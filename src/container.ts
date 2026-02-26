import { FileStore, IFileStore } from './infrastructure/file-store/index.js';
import { EventBus, IEventBus } from './infrastructure/event-bus/index.js';
import { Scheduler, IScheduler } from './infrastructure/scheduler/index.js';
import { WebSocketManager } from './infrastructure/websocket/index.js';
import { BatchLogger, ILogger } from './infrastructure/logger/index.js';
import {
  LLMService,
  AnthropicAdapter,
  OpenAIAdapter,
  loadLLMConfig,
  overrideConfigFromEnv,
  type LLMProviderConfig
} from './infrastructure/llm/index.js';
import { TaskRepository } from './domain/task/index.js';
import { AgentRepository } from './domain/agent/index.js';
import { ToolRegistry, builtinTools } from './domain/tool/index.js';
import { TaskService } from './application/task/task.service.js';
import { LogService } from './application/log/log.service.js';
import { ArtifactService } from './application/artifact/artifact.service.js';
import { AgentService } from './application/agent/agent.service.js';
import { AgentExecutionEngine } from './application/agent/execution-engine.js';
import { APIGateway } from './application/api/gateway.js';

export interface Container {
  // Infrastructure
  fileStore: IFileStore;
  eventBus: IEventBus;
  scheduler: IScheduler;
  wsManager: WebSocketManager;
  logger: ILogger;
  llmService: LLMService;

  // Domain
  taskRepo: TaskRepository;
  agentRepo: AgentRepository;
  toolRegistry: ToolRegistry;

  // Application
  taskService: TaskService;
  logService: LogService;
  artifactService: ArtifactService;
  agentService: AgentService;
  executionEngine: AgentExecutionEngine;
  apiGateway: APIGateway;
}

export function createContainer(dataPath: string = './data'): Container {
  // Infrastructure Layer
  const fileStore = new FileStore(dataPath);
  const eventBus = new EventBus();
  const scheduler = new Scheduler(10);
  const wsManager = new WebSocketManager();
  const logger = new BatchLogger(fileStore);

  // LLM Infrastructure - Load from ~/.llm/llm_services.json
  const llmConfig = overrideConfigFromEnv(loadLLMConfig());

  const adapters = new Map<string, AnthropicAdapter | OpenAIAdapter>();

  for (const provider of llmConfig.providers) {
    if (!provider.enabled || !provider.apiKey) continue;

    try {
      if (provider.type === 'anthropic') {
        adapters.set(provider.name, new AnthropicAdapter(
          provider.apiKey,
          provider.model
        ));
      } else if (provider.type === 'openai') {
        adapters.set(provider.name, new OpenAIAdapter(
          provider.apiKey,
          provider.model,
          provider.baseURL // 支持自定义baseURL
        ));
      }
    } catch (error) {
      console.warn(`Failed to initialize LLM provider ${provider.name}:`, error);
    }
  }

  // 如果没有配置任何提供商，尝试从环境变量创建
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

  const defaultProvider = llmConfig.defaultProvider || (adapters.size > 0 ? Array.from(adapters.keys())[0] : '');
  const llmService = new LLMService(adapters, defaultProvider);

  if (adapters.size === 0) {
    console.warn('No LLM providers configured. Please set up ~/.llm/llm_services.json or environment variables.');
  } else {
    console.log(`LLM providers loaded: ${Array.from(adapters.keys()).join(', ')} (default: ${defaultProvider})`);
  }

  // Domain Layer
  const taskRepo = new TaskRepository(fileStore);
  const agentRepo = new AgentRepository(fileStore);

  // Tool Registry
  const toolRegistry = new ToolRegistry();
  toolRegistry.registerMany(builtinTools);

  // Execution Engine
  const executionEngine = new AgentExecutionEngine(
    llmService,
    toolRegistry,
    logger,
    eventBus,
    50 // maxIterations
  );

  // Application Layer
  const agentService = new AgentService(
    agentRepo,
    taskRepo,
    eventBus,
    logger,
    executionEngine
  );

  const taskService = new TaskService(
    taskRepo,
    eventBus,
    logger,
    scheduler,
    agentService
  );

  const logService = new LogService(logger);
  const artifactService = new ArtifactService(fileStore, eventBus);

  // API Layer
  const apiGateway = new APIGateway({
    port: 3000,
    taskService,
    logService,
    artifactService,
    agentService,
    eventBus,
    wsManager
  });

  return {
    fileStore,
    eventBus,
    scheduler,
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
    apiGateway
  };
}
