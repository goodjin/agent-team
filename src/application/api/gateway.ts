import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
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
import type { OrchestratorService } from '../orchestration/orchestrator.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  orchestratorService: OrchestratorService;
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
  private orchestratorService: OrchestratorService;
  private roleMatcher = new RoleMatcher();

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
    this.orchestratorService = options.orchestratorService;

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
    // 静态文件目录
    const publicDir = join(__dirname, '../../../public');
    this.app.use(express.static(publicDir));
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/api/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
        const path = await import('path');

        // 解析完整路径：artifact.path 可能是相对路径，需要结合工作目录
        const fullPath = path.resolve(process.cwd(), `data/workspaces/${artifact.taskId}`, artifact.path);

        const content = await fs.readFile(fullPath, 'utf-8');
        res.json({ content, artifact });
      } catch (error) {
        console.error('Failed to read artifact content:', error);
        res.status(500).json({ error: 'Failed to read file content' });
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
        const path = await import('path');

        // 解析完整路径
        const fullPath = path.resolve(process.cwd(), `data/workspaces/${artifact.taskId}`, artifact.path);

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
        const data = await this.masterAgentService.getConversation(req.params.id);
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

    // SPA fallback - 所有非 API 路由返回 index.html
    this.app.get('*', (req: Request, res: Response) => {
      if (!req.path.startsWith('/api')) {
        const publicDir = join(__dirname, '../../../public');
        res.sendFile(join(publicDir, 'index.html'));
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
