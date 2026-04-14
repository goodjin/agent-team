import * as path from 'path';
import { FileStore, IFileStore } from './infrastructure/file-store/index.js';
import { EventBus, IEventBus } from './infrastructure/event-bus/index.js';
import { WebSocketManager } from './infrastructure/websocket/index.js';
import { BatchLogger, ILogger } from './infrastructure/logger/index.js';
import {
  LLMService,
  AnthropicAdapter,
  OpenAIAdapter,
  loadLLMConfig,
  overrideConfigFromEnv,
} from './infrastructure/llm/index.js';
import { TaskRepository } from './domain/task/index.js';
import { AgentRepository } from './domain/agent/index.js';
import { RoleRepository } from './domain/role/index.js';
import { WorkerMailbox } from './application/orchestration/mailbox.js';
import { OrchestratorService } from './application/orchestration/orchestrator.service.js';
import { WorkerRunner } from './application/orchestration/worker-runner.js';
import { ToolRegistry, builtinTools } from './domain/tool/index.js';
import { TaskService } from './application/task/task.service.js';
import { MasterAgentService } from './application/master-agent/master-agent.service.js';
import { MasterFollowUpScheduler } from './application/master-agent/master-follow-up-scheduler.js';
import { LogService } from './application/log/log.service.js';
import { ArtifactService } from './application/artifact/artifact.service.js';
import { AgentService } from './application/agent/agent.service.js';
import { AgentExecutionEngine, type AgentExecutionFinishedPayload } from './application/agent/execution-engine.js';
import { APIGateway } from './application/api/gateway.js';
import { PostmortemService } from './application/ops/postmortem.service.js';
import { ExperienceCuratorService } from './application/experience/experience-curator.service.js';
import { ReviewGateService } from './application/review/review-gate.service.js';
import { ReviewRoleMappingStore } from './application/review/review-role-mapping.store.js';
import { registerPluginToolsOnRegistry } from './application/bootstrap/plugin-tools.js';
import { seedRolesFromProjectSkills } from './application/bootstrap/seed-roles-from-project-skills.js';
import { seedSystemRoles } from './application/bootstrap/seed-system-roles.js';
import { SelfEvaluator } from './evolution/evaluator.js';
import { PromptOptimizer } from './evolution/prompt-optimizer.js';
import { AgentMemory } from './knowledge/agent-memory.js';
import { ProjectKnowledgeBase } from './knowledge/project-kb.js';
import { ContextCompressor } from './application/memory/context-compressor.js';
import { NamespaceMemoryService } from './application/memory/namespace-memory.service.js';
import { createMemoryTools } from './application/memory/memory-tools.js';
import { MemoryToolHandlers } from './application/memory/memory-tool-handlers.js';
import { loadContextCompressionConfig } from './config/context-compression.config.js';
import { attachObservability } from './observability/middleware.js';
import type { PluginLoader } from './plugins/loader.js';
import type { DynamicToolLoader } from './plugins/dynamic-tool-loader.js';

export type { AgentExecutionFinishedPayload };

export interface Container {
  fileStore: IFileStore;
  eventBus: IEventBus;
  wsManager: WebSocketManager;
  logger: ILogger;
  llmService: LLMService;

  taskRepo: TaskRepository;
  agentRepo: AgentRepository;
  toolRegistry: ToolRegistry;

  taskService: TaskService;
  logService: LogService;
  artifactService: ArtifactService;
  agentService: AgentService;
  executionEngine: AgentExecutionEngine;
  apiGateway: APIGateway;

  /** v8 情景记忆 + 长期向量存储入口 */
  agentMemory: AgentMemory;
  /** v8 项目级知识库（按 projectId 分 VectorStore，可后续接 API/导入） */
  projectKnowledgeBase: ProjectKnowledgeBase;
  /** v9 自评估 */
  selfEvaluator: SelfEvaluator;
  /** v9 提示词变体（订阅评分下降） */
  promptOptimizer: PromptOptimizer;
  /** 插件加载器（若启动成功） */
  pluginLoader: PluginLoader | null;
  dynamicToolLoader: DynamicToolLoader | null;
  /** 主控定时跟进（需调用 start()，见 index.ts） */
  masterFollowUpScheduler: MasterFollowUpScheduler;
}

export async function createContainer(dataPath: string = './data'): Promise<Container> {
  const fileStore = new FileStore(dataPath);
  const eventBus = new EventBus();
  const wsManager = new WebSocketManager();
  const logger = new BatchLogger(fileStore);

  const llmConfig = overrideConfigFromEnv(loadLLMConfig());
  const adapters = new Map<string, AnthropicAdapter | OpenAIAdapter>();

  for (const provider of llmConfig.providers) {
    if (!provider.enabled || !provider.apiKey) continue;

    try {
      if (provider.type === 'anthropic') {
        adapters.set(provider.name, new AnthropicAdapter(provider.apiKey, provider.model));
      } else if (provider.type === 'openai') {
        adapters.set(
          provider.name,
          new OpenAIAdapter(provider.apiKey, provider.model, provider.baseURL)
        );
      }
    } catch (error) {
      console.warn(`Failed to initialize LLM provider ${provider.name}:`, error);
    }
  }

  if (adapters.size === 0) {
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;

    if (anthropicApiKey) {
      adapters.set('anthropic', new AnthropicAdapter(anthropicApiKey));
    }
    if (openaiApiKey) {
      adapters.set('openai', new OpenAIAdapter(openaiApiKey));
    }
  }

  const defaultProvider =
    llmConfig.defaultProvider || (adapters.size > 0 ? Array.from(adapters.keys())[0] : '');
  const llmService = new LLMService(adapters, defaultProvider);

  if (adapters.size === 0) {
    console.warn(
      'No LLM providers configured. Please set up ~/.llm/llm_services.json or environment variables.'
    );
  } else {
    console.log(
      `LLM providers loaded: ${Array.from(adapters.keys()).join(', ')} (default: ${defaultProvider})`
    );
  }

  const taskRepo = new TaskRepository(fileStore);
  const agentRepo = new AgentRepository(fileStore);
  const roleRepo = new RoleRepository(fileStore);

  const toolRegistry = new ToolRegistry();
  toolRegistry.registerMany(builtinTools);

  let pluginLoader: PluginLoader | null = null;
  let dynamicToolLoader: DynamicToolLoader | null = null;
  try {
    const pluginsDir = path.join(process.cwd(), 'plugins');
    const r = await registerPluginToolsOnRegistry(toolRegistry, pluginsDir);
    pluginLoader = r.loader;
    dynamicToolLoader = r.dynamicToolLoader;
    const names = r.dynamicToolLoader.listTools().map((t) => t.name);
    console.log(`[plugins] Tool plugins registered: ${names.length ? names.join(', ') : '(none)'}`);
  } catch (err) {
    console.warn('[plugins] Failed to load plugin tools:', err);
  }

  try {
    const seeded = await seedRolesFromProjectSkills({ roleRepo, toolRegistry });
    if (seeded.created > 0) {
      console.log(
        `[roles] Seeded roles from project roles/claude-skills: ${seeded.created} created, ${seeded.skipped} skipped`
      );
    }
  } catch (err) {
    console.warn('[roles] Failed to seed roles from project roles/claude-skills:', err);
  }

  try {
    const sys = await seedSystemRoles({ roleRepo });
    if (sys.experienceArchivist === 'created') {
      console.log('[roles] Seeded system role: experience-archivist');
    }
  } catch (err) {
    console.warn('[roles] Failed to seed system roles:', err);
  }

  const agentMemory = new AgentMemory({
    memoryDir: path.join(process.cwd(), '.agent-memory'),
  });
  await agentMemory.initialize();

  const projectKnowledgeBase = new ProjectKnowledgeBase({
    baseDir: path.join(process.cwd(), '.agent-kb'),
  });

  const contextCompressionOpts = loadContextCompressionConfig(process.cwd());
  const contextCompressor = new ContextCompressor(llmService, contextCompressionOpts);
  const namespaceMemoryService = new NamespaceMemoryService(agentMemory, projectKnowledgeBase);
  toolRegistry.registerMany(
    createMemoryTools({
      namespaceMemory: namespaceMemoryService,
      agentRepo,
      contextCompressor,
    })
  );
  const memoryToolHandlers = new MemoryToolHandlers(
    namespaceMemoryService,
    agentRepo,
    contextCompressor
  );

  const executionEngine = new AgentExecutionEngine(
    llmService,
    toolRegistry,
    logger,
    eventBus,
    50,
    contextCompressor
  );

  attachObservability(executionEngine, {
    enableLogger: true,
    enableTracing: true,
    enableMetrics: true,
  });

  const selfEvaluator = new SelfEvaluator();
  selfEvaluator.attachToDomainEventBus(eventBus);

  const promptOptimizer = new PromptOptimizer();
  selfEvaluator.on('evaluation:declining', async (d) => {
    const baseline = `任务「${d.agentId}」执行质量连续下降（最近分: ${d.recentScores.join(', ')}）。请生成更稳健的子代理提示策略。`;
    try {
      await promptOptimizer.generateVariants(`decline-${d.agentId}`, baseline);
    } catch (e) {
      console.error('[PromptOptimizer] generateVariants on declining:', e);
    }
  });

  eventBus.subscribe('agent.execution.finished', async (event) => {
    const p = event.payload as AgentExecutionFinishedPayload;
    try {
      const task = await taskRepo.findById(p.taskId);
      const taskDescription = task
        ? `${task.title}\n${task.description || ''}`.slice(0, 500)
        : p.taskId;
      const summary = (p.summary || p.errorMessage || '').slice(0, 500);
      await agentMemory.recordEpisode({
        taskId: p.taskId,
        agentId: p.agentId,
        taskDescription,
        executionSummary: summary || (p.success ? 'completed' : 'failed'),
        outcome: p.success ? 'success' : 'failure',
        duration: p.durationMs,
        toolsUsed: p.toolsUsed ?? [],
        knowledgeUsed: [],
        startedAt: new Date(Date.now() - p.durationMs).toISOString(),
        completedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.error('[AgentMemory] recordEpisode:', e);
    }
  });

  const agentService = new AgentService(
    agentRepo,
    taskRepo,
    eventBus,
    logger,
    executionEngine,
    toolRegistry
  );

  const workerMailbox = new WorkerMailbox();
  const orchestratorService = new OrchestratorService(
    taskRepo,
    agentRepo,
    eventBus,
    wsManager,
    workerMailbox
  );
  const workerRunner = new WorkerRunner(
    workerMailbox,
    agentRepo,
    taskRepo,
    agentService,
    orchestratorService,
    eventBus,
    logger
  );
  orchestratorService.setWorkerScheduler((id) => workerRunner.scheduleProcess(id));

  const masterAgentService = new MasterAgentService(
    taskRepo,
    agentRepo,
    llmService,
    logger,
    eventBus,
    wsManager,
    roleRepo,
    orchestratorService,
    contextCompressor,
    memoryToolHandlers,
    toolRegistry
  );

  const masterFollowUpScheduler = new MasterFollowUpScheduler({
    taskRepo,
    masterAgentService,
    logger,
  });

  eventBus.subscribe('worker.to.master.progress', async (event) => {
    const p = event.payload as {
      taskId: string;
      workerId: string;
      kind: string;
      correlationId?: string;
      detail?: Record<string, unknown>;
    };
    if (!p?.taskId || !p.workerId) return;
    try {
      await masterAgentService.appendWorkerProgressFeed(p.taskId, p);
    } catch (e) {
      console.error('[worker.to.master.progress] ingest:', e);
    }
  });

  const taskService = new TaskService(taskRepo, eventBus, logger, masterAgentService);
  masterAgentService.attachTaskService(taskService);

  const logService = new LogService(logger);
  const artifactService = new ArtifactService(fileStore, eventBus);
  const postmortemService = new PostmortemService(
    taskService,
    orchestratorService,
    logService,
    artifactService,
    agentService
  );

  const reviewRoleMappingStore = new ReviewRoleMappingStore(fileStore);
  const reviewGateService = new ReviewGateService(
    taskRepo,
    roleRepo,
    agentRepo,
    reviewRoleMappingStore,
    orchestratorService,
    llmService,
    logger
  );
  reviewGateService.start(eventBus);

  const experienceCurator = new ExperienceCuratorService(
    taskRepo,
    roleRepo,
    masterAgentService,
    postmortemService,
    llmService,
    logger
  );
  experienceCurator.start(eventBus);

  const apiGateway = new APIGateway({
    port: 3000,
    taskService,
    logService,
    artifactService,
    agentService,
    eventBus,
    wsManager,
    masterAgentService,
    roleRepo,
    reviewRoleMappingStore,
    orchestratorService,
    postmortemService,
  });

  return {
    fileStore,
    eventBus,
    wsManager,
    logger,
    llmService,
    taskRepo,
    agentRepo,
    toolRegistry,
    taskService,
    logService,
    artifactService,
    agentService,
    executionEngine,
    apiGateway,
    agentMemory,
    projectKnowledgeBase,
    selfEvaluator,
    promptOptimizer,
    pluginLoader,
    dynamicToolLoader,
    masterFollowUpScheduler,
  };
}
