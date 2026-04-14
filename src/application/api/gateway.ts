import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import cors from 'cors';
import path from 'path';
import { TaskService } from '../task/task.service.js';
import { LogService } from '../log/log.service.js';
import { ArtifactService } from '../artifact/artifact.service.js';
import { AgentService } from '../agent/agent.service.js';
import { WebSocketManager } from '../../infrastructure/websocket/index.js';
import { IEventBus } from '../../infrastructure/event-bus/index.js';
import { MasterAgentService } from '../master-agent/master-agent.service.js';
import { RoleMatcher } from '../../domain/agent/role-matcher.js';
import type { Role } from '../../domain/agent/agent.entity.js';
import type { IRoleRepository } from '../../domain/role/role.repository.js';
import { isReservedSystemRoleId } from '../bootstrap/seed-system-roles.js';
import type { OrchestratorService } from '../orchestration/orchestrator.service.js';
import type { PostmortemService } from '../ops/postmortem.service.js';
import type { ReviewRoleMappingStore } from '../review/review-role-mapping.store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveInWorkspaceRoot(taskId: string, relPath: string): string {
  const root = path.resolve(process.cwd(), `data/workspaces/${taskId}`);
  const raw = String(relPath || '').trim().replace(/\\/g, '/');
  if (!raw) throw new Error('artifact.path empty');
  const candidate = path.isAbsolute(raw) || /^[a-zA-Z]:\//.test(raw) || raw.startsWith('//')
    ? path.resolve(raw)
    : path.resolve(root, raw);
  const rel = path.relative(root, candidate);
  if (rel.startsWith('..') || rel.includes(`..${path.sep}`)) {
    throw new Error(`artifact path escapes workspace (root: ${root})`);
  }
  return candidate;
}

export interface APIGatewayOptions {
  port: number;
  taskService: TaskService;
  logService: LogService;
  artifactService: ArtifactService;
  agentService: AgentService;
  eventBus: IEventBus;
  wsManager: WebSocketManager;
  masterAgentService: MasterAgentService;
  roleRepo: IRoleRepository;
  reviewRoleMappingStore: ReviewRoleMappingStore;
  orchestratorService: OrchestratorService;
  postmortemService: PostmortemService;
}

export class APIGateway {
  private app: express.Application;
  private server: ReturnType<typeof createServer>;
  private port: number;

  private taskService: TaskService;
  private logService: LogService;
  private artifactService: ArtifactService;
  private agentService: AgentService;
  private eventBus: IEventBus;
  private wsManager: WebSocketManager;
  private masterAgentService: MasterAgentService;
  private roleRepo: IRoleRepository;
  private reviewRoleMappingStore: ReviewRoleMappingStore;
  private orchestratorService: OrchestratorService;
  private postmortemService: PostmortemService;
  private roleMatcher = new RoleMatcher();
  /** 构建后的 React 单页资源目录（vite build → public-react/dist） */
  private readonly reactDistDir = join(__dirname, '../../../public-react/dist');

  constructor(options: APIGatewayOptions) {
    this.port = options.port;
    this.taskService = options.taskService;
    this.logService = options.logService;
    this.artifactService = options.artifactService;
    this.agentService = options.agentService;
    this.eventBus = options.eventBus;
    this.wsManager = options.wsManager;
    this.masterAgentService = options.masterAgentService;
    this.roleRepo = options.roleRepo;
    this.reviewRoleMappingStore = options.reviewRoleMappingStore;
    this.orchestratorService = options.orchestratorService;
    this.postmortemService = options.postmortemService;

    this.app = express();
    this.server = createServer(this.app);
    this.setupMiddleware();
    this.setupStaticFiles();
    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(this.requestLogger.bind(this));
  }

  private requestLogger(req: Request, res: Response, next: NextFunction): void {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
  }

  private setupStaticFiles(): void {
    if (existsSync(this.reactDistDir)) {
      this.app.use(express.static(this.reactDistDir));
      console.log(`[APIGateway] Web UI (React): ${this.reactDistDir}`);
    } else {
      console.warn(
        '[APIGateway] Web UI missing: public-react/dist not found. Run: npm install --prefix public-react && npm run build:web'
      );
    }
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/api/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Tools（供角色管理按类别勾选 allowedTools）
    this.app.get('/api/tools', async (req: Request, res: Response) => {
      const tools = this.agentService.getToolRegistry().list().map((t) => ({
        name: t.name,
        category: t.category,
        dangerous: t.dangerous,
        description: t.description,
      }));
      res.json(tools);
    });

    /** 质量门禁：工人角色 → 审查员角色映射（持久化于 data/config/review-role-mapping.json） */
    this.app.get('/api/config/review-role-mapping', async (_req: Request, res: Response) => {
      const cfg = await this.reviewRoleMappingStore.get();
      res.json(cfg);
    });

    this.app.put('/api/config/review-role-mapping', async (req: Request, res: Response) => {
      try {
        const b = req.body as Record<string, unknown>;
        const def =
          typeof b.defaultReviewerRoleId === 'string' ? b.defaultReviewerRoleId.trim() : '';
        const rtr = b.roleToReviewer;
        if (!def) {
          res.status(400).json({ error: 'defaultReviewerRoleId required' });
          return;
        }
        if (!rtr || typeof rtr !== 'object' || Array.isArray(rtr)) {
          res.status(400).json({ error: 'roleToReviewer must be an object' });
          return;
        }
        const roleToReviewer: Record<string, string> = {};
        for (const [k, v] of Object.entries(rtr as Record<string, unknown>)) {
          const kk = String(k || '').trim();
          const vv = typeof v === 'string' ? v.trim() : String(v ?? '').trim();
          if (!kk || !vv) continue;
          roleToReviewer[kk] = vv;
        }
        const known = await this.collectAllRoleIds();
        const unknown: string[] = [];
        if (!known.has(def)) unknown.push(`defaultReviewer:${def}`);
        for (const [w, rev] of Object.entries(roleToReviewer)) {
          if (!known.has(w)) unknown.push(`workerRole:${w}`);
          if (!known.has(rev)) unknown.push(`reviewerRole:${rev}`);
        }
        if (unknown.length > 0) {
          res.status(400).json({ error: 'UNKNOWN_ROLE_ID', unknown });
          return;
        }
        await this.reviewRoleMappingStore.save({ defaultReviewerRoleId: def, roleToReviewer });
        res.json(await this.reviewRoleMappingStore.get());
      } catch (error) {
        res.status(400).json({ error: String(error) });
      }
    });

    // Roles（内置 + 持久化合并；同 id 时持久化覆盖）
    this.app.get('/api/roles', async (req: Request, res: Response) => {
      const custom = await this.roleRepo.list();
      const builtin = this.agentService.getAllRoles();
      const byId = new Map<string, Role>();
      for (const r of builtin) byId.set(r.id, r);
      for (const r of custom) byId.set(r.id, r);
      res.json([...byId.values()]);
    });

    this.app.get('/api/roles/:id', async (req: Request, res: Response) => {
      const custom = await this.roleRepo.findById(req.params.id);
      if (custom) {
        res.json(custom);
        return;
      }
      const b = this.roleMatcher.getBuiltinRole(req.params.id);
      if (!b) {
        res.status(404).json({ error: 'ROLE_NOT_FOUND' });
        return;
      }
      res.json(b);
    });

    this.app.post('/api/roles', async (req: Request, res: Response) => {
      try {
        const b = req.body as Record<string, unknown>;
        if (typeof b.id !== 'string' || typeof b.name !== 'string' || typeof b.systemPrompt !== 'string') {
          res.status(400).json({ error: 'id, name, systemPrompt required' });
          return;
        }
        if (isReservedSystemRoleId(String(b.id).trim())) {
          res.status(403).json({ error: 'RESERVED_ROLE_ID' });
          return;
        }
        const role: Role = {
          id: b.id,
          name: b.name,
          description: typeof b.description === 'string' ? b.description : '',
          systemPrompt: b.systemPrompt,
          allowedTools: Array.isArray(b.allowedTools)
            ? (b.allowedTools as unknown[]).filter((x): x is string => typeof x === 'string')
            : ['read_file', 'write_file', 'list_files'],
          maxTokensPerTask: typeof b.maxTokensPerTask === 'number' ? b.maxTokensPerTask : 8000,
          temperature: typeof b.temperature === 'number' ? b.temperature : 0.4,
          timeout: typeof b.timeout === 'number' ? b.timeout : 600,
        };
        await this.roleRepo.save(role);
        res.status(201).json(role);
      } catch (error) {
        res.status(400).json({ error: String(error) });
      }
    });

    /** 更新角色（主要用于修改 systemPrompt）。同 id 时写入持久化层，覆盖内置显示。 */
    this.app.put('/api/roles/:id', async (req: Request, res: Response) => {
      try {
        const id = String(req.params.id || '').trim();
        if (!id) {
          res.status(400).json({ error: 'id required' });
          return;
        }
        const existingCustom = await this.roleRepo.findById(id);
        const builtin = this.roleMatcher.getBuiltinRole(id);
        const base = existingCustom ?? builtin;
        if (!base) {
          res.status(404).json({ error: 'ROLE_NOT_FOUND' });
          return;
        }

        const b = (req.body ?? {}) as Record<string, unknown>;
        const systemLocked =
          isReservedSystemRoleId(id) || !!(existingCustom?.isSystem ?? base.isSystem);
        const next: Role = {
          id,
          name: typeof b.name === 'string' ? b.name : base.name,
          description: typeof b.description === 'string' ? b.description : base.description,
          systemPrompt: typeof b.systemPrompt === 'string' ? b.systemPrompt : base.systemPrompt,
          allowedTools: Array.isArray(b.allowedTools)
            ? (b.allowedTools as unknown[]).filter((x): x is string => typeof x === 'string')
            : base.allowedTools,
          maxTokensPerTask: typeof b.maxTokensPerTask === 'number' ? b.maxTokensPerTask : base.maxTokensPerTask,
          temperature: typeof b.temperature === 'number' ? b.temperature : base.temperature,
          timeout: typeof b.timeout === 'number' ? b.timeout : base.timeout,
        };
        if (systemLocked) {
          next.isSystem = true;
        }

        if (!next.name || !next.systemPrompt) {
          res.status(400).json({ error: 'name and systemPrompt must be non-empty' });
          return;
        }

        await this.roleRepo.save(next);
        res.json(next);
      } catch (error) {
        res.status(400).json({ error: String(error) });
      }
    });

    this.app.delete('/api/roles/:id', async (req: Request, res: Response) => {
      try {
        const id = String(req.params.id || '').trim();
        if (!id) {
          res.status(400).json({ error: 'id required' });
          return;
        }
        const existing = await this.roleRepo.findById(id);
        if (!existing) {
          res.status(404).json({ error: 'ROLE_NOT_FOUND' });
          return;
        }
        if (existing.isSystem || isReservedSystemRoleId(id)) {
          res.status(403).json({ error: 'SYSTEM_ROLE_NOT_DELETABLE' });
          return;
        }
        await this.roleRepo.delete(id);
        res.json({ success: true });
      } catch (error) {
        res.status(400).json({ error: String(error) });
      }
    });

    // Tasks
    this.app.post('/api/tasks', async (req: Request, res: Response) => {
      try {
        const task = await this.taskService.create(req.body);
        res.status(201).json(task);
      } catch (error) {
        res.status(400).json({ error: String(error) });
      }
    });

    this.app.get('/api/tasks', async (req: Request, res: Response) => {
      const { status } = req.query;
      const tasks = await this.taskService.list(
        status ? { status: status as any } : undefined
      );
      res.json(tasks);
    });

    this.app.get('/api/tasks/:id', async (req: Request, res: Response) => {
      try {
        const task = await this.taskService.get(req.params.id);
        res.json(task);
      } catch (error) {
        res.status(404).json({ error: String(error) });
      }
    });

    this.app.post('/api/tasks/:id/start', async (req: Request, res: Response) => {
      try {
        await this.taskService.start(req.params.id);
        res.json({ success: true });
      } catch (error) {
        res.status(400).json({ error: String(error) });
      }
    });

    this.app.post('/api/tasks/:id/pause', async (req: Request, res: Response) => {
      try {
        await this.taskService.pause(req.params.id);
        res.json({ success: true });
      } catch (error) {
        res.status(400).json({ error: String(error) });
      }
    });

    this.app.post('/api/tasks/:id/resume', async (req: Request, res: Response) => {
      try {
        await this.taskService.resume(req.params.id);
        res.json({ success: true });
      } catch (error) {
        res.status(400).json({ error: String(error) });
      }
    });

    this.app.post('/api/tasks/:id/complete', async (req: Request, res: Response) => {
      try {
        const note =
          req.body && typeof req.body === 'object' && typeof (req.body as { closing_note?: string }).closing_note === 'string'
            ? (req.body as { closing_note: string }).closing_note
            : '';
        await this.taskService.complete(req.params.id, { masterClosingNote: note });
        res.json({ success: true });
      } catch (error) {
        res.status(400).json({ error: String(error) });
      }
    });

    this.app.post('/api/tasks/:id/retry', async (req: Request, res: Response) => {
      try {
        await this.taskService.retry(req.params.id);
        res.json({ success: true });
      } catch (error) {
        res.status(400).json({ error: String(error) });
      }
    });

    this.app.get('/api/tasks/:id/subtasks', async (req: Request, res: Response) => {
      const subtasks = await this.taskService.getSubtasks(req.params.id);
      res.json(subtasks);
    });

    // Logs（可选 ?agentId= 仅看某成员）
    this.app.get('/api/tasks/:id/logs', async (req: Request, res: Response) => {
      const agentId =
        typeof req.query.agentId === 'string' && req.query.agentId.trim()
          ? req.query.agentId.trim()
          : undefined;
      const timeline = await this.logService.getTimeline(req.params.id, agentId ? { agentId } : undefined);
      res.json(timeline);
    });

    /** 任务成员（Agent）+ 产出物（成品），供前端「成员与产出」展示 */
    this.app.get('/api/tasks/:id/members', async (req: Request, res: Response) => {
      try {
        const taskId = req.params.id;
        await this.taskService.get(taskId);
        const agents = await this.agentService.getAgentsByTask(taskId);
        const artifacts = await this.artifactService.getByTaskId(taskId);
        res.json({
          agents: agents.map((a) => ({
            id: a.id,
            kind: a.kind ?? 'worker',
            displayName: a.displayName ?? a.roleId,
            roleId: a.roleId,
            status: a.status,
            masterAgentId: a.masterAgentId,
          })),
          deliverables: artifacts.map((a) => ({
            id: a.id,
            kind: 'artifact' as const,
            name: a.name,
            type: a.type,
            mimeType: a.mimeType,
            path: a.path,
            size: a.size,
            createdAt: a.createdAt,
          })),
        });
      } catch (error) {
        res.status(404).json({ error: String(error) });
      }
    });

    // Artifacts
    this.app.get('/api/tasks/:id/artifacts', async (req: Request, res: Response) => {
      const artifacts = await this.artifactService.getByTaskId(req.params.id);
      res.json(artifacts);
    });

    // 获取单个成品元数据
    this.app.get('/api/artifacts/:id', async (req: Request, res: Response) => {
      const artifact = await this.artifactService.getById(req.params.id);
      if (!artifact) {
        res.status(404).json({ error: 'Artifact not found' });
        return;
      }
      res.json(artifact);
    });

    // 获取成品内容（用于预览）
    this.app.get('/api/artifacts/:id/content', async (req: Request, res: Response) => {
      try {
        const artifact = await this.artifactService.getById(req.params.id);
        if (!artifact) {
          res.status(404).json({ error: 'Artifact not found' });
          return;
        }

        const fs = await import('fs/promises');
        const fullPath = resolveInWorkspaceRoot(artifact.taskId, artifact.path);

        const isText =
          (artifact.mimeType && artifact.mimeType.startsWith('text/')) ||
          /json|xml|yaml|yml|markdown/i.test(artifact.mimeType || '') ||
          /\.(txt|md|js|ts|jsx|tsx|css|html|json|yaml|yml|xml|sh|py|go|rs)$/i.test(artifact.name || '');
        if (!isText) {
          res.status(415).json({ error: 'Binary preview not supported in /content; use /raw', artifact });
          return;
        }
        const content = await fs.readFile(fullPath, 'utf-8');
        res.json({ content, artifact });
      } catch (error) {
        console.error('Failed to read artifact content:', error);
        res.status(500).json({ error: 'Failed to read file content' });
      }
    });

    // 原样输出成品（用于图片/PDF等内联预览；不强制下载）
    this.app.get('/api/artifacts/:id/raw', async (req: Request, res: Response) => {
      try {
        const artifact = await this.artifactService.getById(req.params.id);
        if (!artifact) {
          res.status(404).json({ error: 'Artifact not found' });
          return;
        }
        const fs = await import('fs');
        const fullPath = resolveInWorkspaceRoot(artifact.taskId, artifact.path);
        if (!fs.existsSync(fullPath)) {
          res.status(404).json({ error: 'File not found' });
          return;
        }
        if (artifact.mimeType) res.setHeader('Content-Type', artifact.mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(artifact.name)}"`);
        fs.createReadStream(fullPath).pipe(res);
      } catch (error) {
        console.error('Failed to stream artifact raw:', error);
        res.status(500).json({ error: 'Failed to stream file' });
      }
    });

    // 下载成品
    this.app.get('/api/artifacts/:id/download', async (req: Request, res: Response) => {
      try {
        const artifact = await this.artifactService.getById(req.params.id);
        if (!artifact) {
          res.status(404).json({ error: 'Artifact not found' });
          return;
        }

        const fs = await import('fs');
        const fullPath = resolveInWorkspaceRoot(artifact.taskId, artifact.path);

        // 检查文件是否存在
        if (!fs.existsSync(fullPath)) {
          res.status(404).json({ error: 'File not found', path: fullPath });
          return;
        }

        // 设置响应头
        res.setHeader('Content-Type', artifact.mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(artifact.name)}"`);

        // 发送文件
        res.download(fullPath, artifact.name);
      } catch (error) {
        console.error('Failed to download artifact:', error);
        res.status(500).json({ error: 'Failed to download file' });
      }
    });

    // Agents
    this.app.get('/api/tasks/:id/agents', async (req: Request, res: Response) => {
      const agents = await this.agentService.getAgentsByTask(req.params.id);
      res.json(agents);
    });

    // 主 Agent 会话：拉取历史 + 发送消息
    this.app.get('/api/tasks/:id/master/conversation', async (req: Request, res: Response) => {
      try {
        const limitRaw = req.query.limit;
        const beforeRaw = req.query.before;
        const limit =
          typeof limitRaw === 'string' && limitRaw.trim()
            ? Number.parseInt(limitRaw, 10)
            : undefined;
        const before =
          typeof beforeRaw === 'string' && beforeRaw.trim()
            ? Number.parseInt(beforeRaw, 10)
            : undefined;
        const data = await this.masterAgentService.getConversation(req.params.id, {
          limit: Number.isFinite(limit) ? limit : undefined,
          before: Number.isFinite(before) ? before : undefined,
        });
        res.json(data);
      } catch (error) {
        res.status(400).json({ error: String(error) });
      }
    });

    this.app.post('/api/tasks/:id/master/messages', async (req: Request, res: Response) => {
      try {
        const content = req.body?.content;
        if (typeof content !== 'string' || !content.trim()) {
          res.status(400).json({ error: 'body.content (non-empty string) required' });
          return;
        }
        const reply = await this.masterAgentService.handleUserMessage(req.params.id, content);
        res.json({ reply });
      } catch (error) {
        res.status(400).json({ error: String(error) });
      }
    });

    this.app.get('/api/tasks/:id/workers', async (req: Request, res: Response) => {
      try {
        const task = await this.taskService.get(req.params.id);
        const agents = await this.agentService.getAgentsByTask(req.params.id);
        const workers = agents.filter(
          (a) => a.kind !== 'master' && a.id !== task.masterAgentId
        );
        res.json(
          workers.map((w) => ({
            id: w.id,
            displayName: w.displayName ?? w.id,
            roleId: w.roleId,
            status: w.status,
            masterAgentId: w.masterAgentId,
          }))
        );
      } catch (error) {
        res.status(400).json({ error: String(error) });
      }
    });

    this.app.post('/api/tasks/:id/orchestration/start', async (req: Request, res: Response) => {
      try {
        const r = await this.orchestratorService.startOrchestration(req.params.id);
        if (!r.ok) {
          res.status(400).json({ error: r.error });
          return;
        }
        res.json({ success: true });
      } catch (error) {
        res.status(400).json({ error: String(error) });
      }
    });

    /** 编排操作台：DAG 分层、节点状态、工人信箱队列深度与待处理指令 */
    this.app.get('/api/tasks/:id/orchestration/snapshot', async (req: Request, res: Response) => {
      try {
        const taskId = req.params.id;
        await this.taskService.get(taskId);
        const snap = await this.orchestratorService.getSnapshot(taskId);
        const agents = await this.agentService.getAgentsByTask(taskId);
        const workerNames: Record<string, string> = {};
        for (const a of agents) {
          workerNames[a.id] = a.displayName ?? a.roleId ?? a.id;
        }
        res.json({
          ...snap,
          workerNames,
          activePlan: snap.activePlan
            ? {
                ...snap.activePlan,
                nodes: snap.activePlan.nodes.map((n) => ({
                  ...n,
                  workerDisplayName: workerNames[n.workerId] ?? n.workerId,
                })),
              }
            : undefined,
        });
      } catch (error) {
        res.status(404).json({ error: String(error) });
      }
    });

    /** 运行摘要 / 复盘要点（现算，不落库） */
    this.app.get('/api/tasks/:id/postmortem', async (req: Request, res: Response) => {
      try {
        const data = await this.postmortemService.build(req.params.id);
        res.json(data);
      } catch (error) {
        res.status(404).json({ error: String(error) });
      }
    });

    // SPA fallback - 所有非 API 路由返回 React index.html
    this.app.get('*', (req: Request, res: Response) => {
      if (!req.path.startsWith('/api')) {
        const indexHtml = join(this.reactDistDir, 'index.html');
        if (!existsSync(indexHtml)) {
          res
            .status(503)
            .type('text')
            .send(
              'Web UI not built. From repo root run:\n  npm install --prefix public-react && npm run build:web\nThen restart the server.'
            );
          return;
        }
        res.sendFile(indexHtml);
      } else {
        res.status(404).json({ error: 'Not found' });
      }
    });

    // Error handler
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      console.error('Error:', err);
      res.status(500).json({ error: err.message });
    });
  }

  /** 与 GET /api/roles 一致的角色 id 集合（内置 + 持久化） */
  private async collectAllRoleIds(): Promise<Set<string>> {
    const custom = await this.roleRepo.list();
    const builtin = this.agentService.getAllRoles();
    const byId = new Set<string>();
    for (const r of builtin) byId.add(r.id);
    for (const r of custom) byId.add(r.id);
    return byId;
  }

  private setupWebSocket(): void {
    this.wsManager.attachToServer(this.server, {
      onClientMessage: (taskId, msg) => {
        if (msg.type === 'user.message') {
          void this.masterAgentService.handleUserMessage(taskId, msg.content).catch((err) => {
            console.error('[Master] handleUserMessage:', err);
            this.wsManager.broadcast(taskId, {
              type: 'error',
              timestamp: new Date().toISOString(),
              data: { source: 'master', error: String(err) },
            });
          });
        }
      },
    });

    this.eventBus.subscribe('master.session.started', (event) => {
      const { taskId, masterAgentId } = event.payload as { taskId: string; masterAgentId: string };
      this.wsManager.broadcast(taskId, {
        type: 'master_session',
        timestamp: new Date().toISOString(),
        data: { phase: 'started', masterAgentId },
      });
    });

    // 订阅事件并广播
    this.eventBus.subscribe('task.status_changed', (event) => {
      const { taskId } = event.payload;
      this.wsManager.broadcast(taskId, {
        type: 'status_change',
        timestamp: new Date().toISOString(),
        data: event.payload
      });
    });

    this.eventBus.subscribe('task.progress', (event) => {
      const { taskId } = event.payload;
      this.wsManager.broadcast(taskId, {
        type: 'progress_update',
        timestamp: new Date().toISOString(),
        data: event.payload
      });
    });

    this.eventBus.subscribe('artifact.created', (event) => {
      const { taskId } = event.payload;
      this.wsManager.broadcast(taskId, {
        type: 'artifact_created',
        timestamp: new Date().toISOString(),
        data: event.payload
      });
    });
  }

  start(): void {
    this.server.listen(this.port, () => {
      console.log(`API Gateway running on http://localhost:${this.port}`);
      console.log(`Web UI available at http://localhost:${this.port}`);
      console.log(`WebSocket available at ws://localhost:${this.port}?taskId=<taskId>`);
    });
  }

  stop(): void {
    this.server.close();
  }
}
