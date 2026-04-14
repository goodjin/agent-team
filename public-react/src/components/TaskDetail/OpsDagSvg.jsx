import { useId, useMemo, useState, useRef, useEffect, useCallback } from 'react';

const PADDING = 20;
const NODE_W = 200;
const NODE_H = 96;
/** 同层节点之间的垂直间距 */
const GAP_NODE = 20;
/** 拓扑层之间的水平间距（依赖方向：左 → 右） */
const GAP_LAYER = 72;

const MIN_SCALE = 0.12;
const MAX_SCALE = 4;

function statusPaint(status) {
  if (status === 'completed') return { fill: '#ecfdf5', stroke: '#10b981' };
  if (status === 'failed') return { fill: '#fef2f2', stroke: '#ef4444' };
  if (status === 'reviewing') return { fill: '#eef2ff', stroke: '#6366f1' };
  if (status === 'running') return { fill: '#fffbeb', stroke: '#f59e0b' };
  return { fill: '#ffffff', stroke: '#cbd5e1' };
}

/** 与后端 plan-dag 一致的拓扑分层（无 layers 时兜底） */
function topologicalLayersFromNodes(nodes) {
  if (!nodes?.length) return [];
  const idSet = new Set(nodes.map((n) => n.id));
  const adj = new Map();
  const indeg = new Map();
  for (const n of nodes) {
    adj.set(n.id, []);
    indeg.set(n.id, 0);
  }
  for (const n of nodes) {
    for (const d of n.dependsOn || []) {
      if (!idSet.has(d)) continue;
      adj.get(d).push(n.id);
      indeg.set(n.id, (indeg.get(n.id) || 0) + 1);
    }
  }
  const layers = [];
  let frontier = nodes.map((n) => n.id).filter((id) => indeg.get(id) === 0).sort();
  while (frontier.length) {
    layers.push([...frontier]);
    const next = [];
    for (const u of frontier) {
      for (const v of adj.get(u) || []) {
        const nd = indeg.get(v) - 1;
        indeg.set(v, nd);
        if (nd === 0) next.push(v);
      }
    }
    frontier = next.sort();
  }
  return layers;
}

function escapeSvgText(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function truncate(s, max) {
  const t = String(s ?? '');
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/**
 * @param {string[][]} layers
 * @param {Array<{ id: string; status?: string; workerDisplayName?: string; workerId?: string; brief?: string }>} nodes
 */
export default function OpsDagSvg({ layers: layersProp, nodes }) {
  const rid = useId().replace(/:/g, '');
  const markerId = `ops-dag-arrow-${rid}`;

  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const wrapRef = useRef(null);
  const dragRef = useRef(null);

  const layout = useMemo(() => {
    const nodeList = Array.isArray(nodes) ? nodes : [];
    const layers =
      Array.isArray(layersProp) && layersProp.length > 0
        ? layersProp.map((row) => [...row].sort())
        : topologicalLayersFromNodes(nodeList);

    if (!layers.length) {
      return { vbW: 400, vbH: 200, positions: new Map(), edges: [] };
    }

    const nodeById = new Map(nodeList.map((n) => [n.id, n]));

    const colHeights = layers.map(
      (row) => row.length * NODE_H + Math.max(0, row.length - 1) * GAP_NODE
    );
    const maxColH = Math.max(...colHeights, NODE_H);

    const positions = new Map();
    layers.forEach((row, li) => {
      const x = PADDING + li * (NODE_W + GAP_LAYER);
      const colH = colHeights[li];
      const offsetY = PADDING + (maxColH - colH) / 2;
      row.forEach((id, ci) => {
        const y = offsetY + ci * (NODE_H + GAP_NODE);
        positions.set(id, { x, y, w: NODE_W, h: NODE_H, node: nodeById.get(id) });
      });
    });

    const edges = [];
    for (const n of nodeList) {
      for (const d of n.dependsOn || []) {
        const from = positions.get(d);
        const to = positions.get(n.id);
        if (from && to) edges.push({ from: d, to: n.id, fromPos: from, toPos: to });
      }
    }

    const vbW = PADDING * 2 + layers.length * NODE_W + Math.max(0, layers.length - 1) * GAP_LAYER;
    const vbH = PADDING * 2 + maxColH;

    return { vbW, vbH, positions, edges };
  }, [layersProp, nodes]);

  const { vbW, vbH, positions, edges } = layout;

  const layoutKey = `${vbW}x${vbH}-${positions.size}`;
  const prevLayoutKey = useRef('');
  useEffect(() => {
    if (layoutKey !== prevLayoutKey.current && positions.size > 0) {
      prevLayoutKey.current = layoutKey;
      setView({ scale: 1, x: 0, y: 0 });
    }
  }, [layoutKey, positions.size]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      setView((v) => {
        const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
        const ratio = nextScale / v.scale;
        return {
          scale: nextScale,
          x: mx - (mx - v.x) * ratio,
          y: my - (my - v.y) * ratio,
        };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const resetView = useCallback(() => {
    setView({ scale: 1, x: 0, y: 0 });
  }, []);

  const onPointerDown = useCallback((e) => {
    const panButtons = e.button === 1 || (e.button === 0 && e.altKey);
    if (!panButtons) return;
    e.preventDefault();
    const v = viewRef.current;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      ox: v.x,
      oy: v.y,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
  }, []);

  const onPointerMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    setView((v) => ({
      ...v,
      x: d.ox + (e.clientX - d.startX),
      y: d.oy + (e.clientY - d.startY),
    }));
  }, []);

  const endDrag = useCallback((e) => {
    const d = dragRef.current;
    if (!d || (e.pointerId != null && e.pointerId !== d.pointerId)) return;
    try {
      wrapRef.current?.releasePointerCapture(d.pointerId);
    } catch (_) {}
    dragRef.current = null;
  }, []);

  return (
    <div className="ops-dag-svg-wrap">
      <div className="ops-dag-canvas-bar">
        <span className="muted ops-dag-canvas-hint">
          横向：依赖从左 → 右。滚轮缩放；中键或 Alt+左键拖拽平移。
        </span>
        <button type="button" className="btn btn-ghost ops-dag-reset-btn" onClick={resetView}>
          重置视图
        </button>
      </div>
      <div
        ref={wrapRef}
        className="ops-dag-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onAuxClick={(e) => {
          if (e.button === 1) e.preventDefault();
        }}
      >
        <div
          className="ops-dag-canvas-inner"
          style={{
            width: vbW,
            height: vbH,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transformOrigin: '0 0',
          }}
        >
          <svg
            className="ops-dag-svg"
            width={vbW}
            height={vbH}
            viewBox={`0 0 ${vbW} ${vbH}`}
            role="img"
            aria-label="DAG 拓扑连线图（横向）"
          >
            <defs>
              <marker
                id={markerId}
                markerWidth="10"
                markerHeight="7"
                refX="9"
                refY="3.5"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
              </marker>
            </defs>

            <g className="ops-dag-svg-edges">
              {edges.map((e) => {
                const { fromPos, toPos } = e;
                const x1 = fromPos.x + NODE_W;
                const y1 = fromPos.y + NODE_H / 2;
                const x2 = toPos.x;
                const y2 = toPos.y + NODE_H / 2;
                let dPath;
                if (x2 > x1 + 2) {
                  const xm = (x1 + x2) / 2;
                  dPath = `M ${x1} ${y1} C ${xm} ${y1}, ${xm} ${y2}, ${x2} ${y2}`;
                } else {
                  const sign = y2 >= y1 ? 1 : -1;
                  const bend = 44 * sign;
                  dPath = `M ${x1} ${y1} C ${x1 + 28} ${y1 + bend}, ${x2 - 28} ${y2 - bend}, ${x2} ${y2}`;
                }
                return (
                  <path
                    key={`${e.from}->${e.to}`}
                    d={dPath}
                    fill="none"
                    stroke="#94a3b8"
                    strokeWidth="1.75"
                    markerEnd={`url(#${markerId})`}
                  />
                );
              })}
            </g>

            <g className="ops-dag-svg-nodes">
              {[...positions.entries()].map(([id, pos]) => {
                const n = pos.node;
                const st = statusPaint(n?.status);
                const title = n
                  ? `${id}\n${n.workerDisplayName || n.workerId || ''}\n${n.status || ''}`
                  : id;
                const worker = truncate(n?.workerDisplayName || n?.workerId || '（未知工人）', 22);
                const brief = n?.brief ? truncate(n.brief, 36) : '';
                const statusLabel = n?.status || 'unknown';
                return (
                  <g key={id} transform={`translate(${pos.x},${pos.y})`} className="ops-dag-svg-node">
                    <title>{title}</title>
                    <rect
                      width={NODE_W}
                      height={NODE_H}
                      rx="10"
                      fill={st.fill}
                      stroke={st.stroke}
                      strokeWidth="2"
                      className="ops-svg-node-rect"
                    />
                    <text x="12" y="22" className="ops-svg-node-id" fontSize="12" fontWeight="700" fill="#1e293b">
                      {escapeSvgText(truncate(id, 26))}
                    </text>
                    {n ? (
                      <>
                        <text x="12" y="42" className="ops-svg-node-worker" fontSize="11" fill="#475569">
                          {escapeSvgText(worker)}
                        </text>
                        <text x="12" y="60" className="ops-svg-node-status" fontSize="10" fontWeight="600" fill="#64748b">
                          {escapeSvgText(statusLabel)}
                        </text>
                        {brief ? (
                          <text x="12" y="78" className="ops-svg-node-brief" fontSize="9" fill="#64748b">
                            {escapeSvgText(brief)}
                          </text>
                        ) : null}
                      </>
                    ) : (
                      <text x="12" y="48" fontSize="10" fill="#94a3b8" fontStyle="italic">
                        （节点未加载）
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
