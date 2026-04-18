/**
 * v10 submit_plan DAG：校验与拓扑分层（Kahn）
 */

export type PlanExecutorType = 'worker' | 'submaster';

export type PlanNodeKind = 'atomic' | 'module';

export type DecompositionPolicy =
  | 'direct-atomic'
  | 'stage-first'
  | 'module-first'
  | 'domain-first'
  | 'hybrid';

export interface PlanNodeInput {
  id: string;
  executorType: PlanExecutorType;
  executorId: string;
  nodeKind: PlanNodeKind;
  dependsOn?: string[];
  parallelGroup?: string;
  /** 派工说明（M2 执行 ASSIGN_WORK 用） */
  brief?: string;
  decompositionPolicy?: DecompositionPolicy;
  /** 兼容旧前端/旧快照消费者 */
  workerId?: string;
}

export interface ParsedPlan {
  version: number;
  nodes: PlanNodeInput[];
}

export function parsePlanPayload(raw: unknown): { ok: true; plan: ParsedPlan } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'plan must be an object' };
  }
  const o = raw as Record<string, unknown>;
  const version = o.version;
  if (typeof version !== 'number' || version < 1 || !Number.isInteger(version)) {
    return { ok: false, error: 'plan.version must be integer >= 1' };
  }
  const nodesRaw = o.nodes;
  if (!Array.isArray(nodesRaw) || nodesRaw.length === 0) {
    return { ok: false, error: 'plan.nodes must be a non-empty array' };
  }
  const nodes: PlanNodeInput[] = [];
  const allowedExecutorTypes = new Set<PlanExecutorType>(['worker', 'submaster']);
  const allowedNodeKinds = new Set<PlanNodeKind>(['atomic', 'module']);
  const allowedPolicies = new Set<DecompositionPolicy>([
    'direct-atomic',
    'stage-first',
    'module-first',
    'domain-first',
    'hybrid',
  ]);
  for (const n of nodesRaw) {
    if (!n || typeof n !== 'object') {
      return { ok: false, error: 'each node must be an object' };
    }
    const nr = n as Record<string, unknown>;
    if (typeof nr.id !== 'string' || !nr.id.trim()) {
      return { ok: false, error: 'node.id required' };
    }
    const executorTypeRaw =
      typeof nr.executorType === 'string' && nr.executorType.trim()
        ? nr.executorType.trim()
        : 'worker';
    if (!allowedExecutorTypes.has(executorTypeRaw as PlanExecutorType)) {
      return { ok: false, error: `unsupported executorType "${executorTypeRaw}" on node "${nr.id}"` };
    }
    const executorType = executorTypeRaw as PlanExecutorType;
    const executorIdRaw =
      typeof nr.executorId === 'string' && nr.executorId.trim()
        ? nr.executorId.trim()
        : typeof nr.workerId === 'string' && nr.workerId.trim()
          ? nr.workerId.trim()
          : '';
    if (!executorIdRaw) {
      return { ok: false, error: 'node.executorId required (or legacy workerId)' };
    }
    const nodeKindRaw =
      typeof nr.nodeKind === 'string' && nr.nodeKind.trim()
        ? nr.nodeKind.trim()
        : executorType === 'submaster'
          ? 'module'
          : 'atomic';
    if (!allowedNodeKinds.has(nodeKindRaw as PlanNodeKind)) {
      return { ok: false, error: `unsupported nodeKind "${nodeKindRaw}" on node "${nr.id}"` };
    }
    const nodeKind = nodeKindRaw as PlanNodeKind;
    if (executorType === 'worker' && nodeKind !== 'atomic') {
      return { ok: false, error: `worker executor only supports atomic nodes ("${nr.id}")` };
    }
    if (executorType === 'submaster' && nodeKind !== 'module') {
      return { ok: false, error: `submaster executor only supports module nodes ("${nr.id}")` };
    }
    const dependsOn = Array.isArray(nr.dependsOn)
      ? nr.dependsOn.filter((x): x is string => typeof x === 'string')
      : undefined;
    const parallelGroup = typeof nr.parallelGroup === 'string' ? nr.parallelGroup : undefined;
    const brief = typeof nr.brief === 'string' ? nr.brief : undefined;
    const decompositionPolicy =
      typeof nr.decompositionPolicy === 'string' && nr.decompositionPolicy.trim()
        ? nr.decompositionPolicy.trim()
        : undefined;
    if (
      decompositionPolicy &&
      !allowedPolicies.has(decompositionPolicy as DecompositionPolicy)
    ) {
      return {
        ok: false,
        error: `unsupported decompositionPolicy "${decompositionPolicy}" on node "${nr.id}"`,
      };
    }
    nodes.push({
      id: nr.id.trim(),
      executorType,
      executorId: executorIdRaw,
      nodeKind,
      dependsOn,
      parallelGroup,
      brief,
      decompositionPolicy: decompositionPolicy as DecompositionPolicy | undefined,
      workerId: executorType === 'worker' ? executorIdRaw : undefined,
    });
  }
  const ids = new Set(nodes.map((x) => x.id));
  if (ids.size !== nodes.length) {
    return { ok: false, error: 'duplicate node id' };
  }
  for (const node of nodes) {
    for (const d of node.dependsOn ?? []) {
      if (!ids.has(d)) {
        return { ok: false, error: `unknown dependency "${d}" on node "${node.id}"` };
      }
    }
  }
  if (hasCycle(nodes)) {
    return { ok: false, error: 'DAG has a cycle' };
  }
  return { ok: true, plan: { version, nodes } };
}

function hasCycle(nodes: PlanNodeInput[]): boolean {
  const idSet = new Set(nodes.map((n) => n.id));
  const adj = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const n of nodes) {
    adj.set(n.id, []);
    indeg.set(n.id, 0);
  }
  for (const n of nodes) {
    for (const d of n.dependsOn ?? []) {
      if (!idSet.has(d)) continue;
      adj.get(d)!.push(n.id);
      indeg.set(n.id, (indeg.get(n.id) ?? 0) + 1);
    }
  }
  const q: string[] = [];
  for (const [id, deg] of indeg) {
    if (deg === 0) q.push(id);
  }
  let seen = 0;
  while (q.length) {
    const u = q.shift()!;
    seen++;
    for (const v of adj.get(u) ?? []) {
      const next = (indeg.get(v) ?? 0) - 1;
      indeg.set(v, next);
      if (next === 0) q.push(v);
    }
  }
  return seen !== nodes.length;
}

/** 返回拓扑层序：同层可并行启动 */
export function topologicalLayers(nodes: PlanNodeInput[]): string[][] {
  const idSet = new Set(nodes.map((n) => n.id));
  const adj = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const n of nodes) {
    adj.set(n.id, []);
    indeg.set(n.id, 0);
  }
  for (const n of nodes) {
    for (const d of n.dependsOn ?? []) {
      if (!idSet.has(d)) continue;
      adj.get(d)!.push(n.id);
      indeg.set(n.id, (indeg.get(n.id) ?? 0) + 1);
    }
  }
  const layers: string[][] = [];
  let frontier = nodes.map((n) => n.id).filter((id) => indeg.get(id) === 0);
  const done = new Set<string>();
  while (frontier.length) {
    layers.push([...frontier]);
    const next: string[] = [];
    for (const u of frontier) {
      done.add(u);
      for (const v of adj.get(u) ?? []) {
        const nextDeg = (indeg.get(v) ?? 0) - 1;
        indeg.set(v, nextDeg);
        if (nextDeg === 0) next.push(v);
      }
    }
    frontier = next;
  }
  return layers;
}
