import express, { Request, Response } from 'express';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { ProjectAgent } from '../core/project-agent.js';
import { createApiRoutes } from './api.js';
import { loadConfig } from '../config/config-loader.js';
import { getSessionManager } from './session-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ServerOptions {
  port?: number;
  host?: string;
  projectPath?: string;
}

export class AgentTeamServer {
  private app: express.Application;
  private agent: ProjectAgent;
  private server: any;
  private port: number;
  private host: string;
  private sessionManager = getSessionManager();

  constructor(options: ServerOptions = {}) {
    this.port = options.port || 3020;
    this.host = options.host || 'localhost';
    this.app = express();

    // 初始化ProjectAgent（作为默认会话）
    const projectPath = options.projectPath || process.cwd();
    
    // 尝试找到配置文件路径
    const configPaths = this.findConfigPaths(projectPath);
    
    this.agent = new ProjectAgent(
      {
        projectName: path.basename(projectPath),
        projectPath,
      },
      {
        llm: configPaths.llm,
        prompts: configPaths.prompts,
      }
    );

    this.setupMiddleware();
    this.setupRoutes();
  }

  private findConfigPaths(projectPath: string): { llm?: string; prompts?: string | string[] } {
    const configPaths: { llm?: string; prompts?: string | string[] } = {};

    // 优先使用 home 目录的配置 ~/.agent-team/config.yaml
    const homeConfigPath = path.join(os.homedir(), '.agent-team', 'config.yaml');
    if (fs.existsSync(homeConfigPath)) {
      configPaths.llm = homeConfigPath;
      console.log(`📁 使用配置文件: ${homeConfigPath}`);
    } else {
      // 降级到项目目录查找
      const projectConfigPaths = [
        path.join(projectPath, '.agent-team', 'config.yaml'),
        path.join(projectPath, '.agent-team.yaml'),
        path.join(projectPath, 'agent.config.yaml'),
        path.join(projectPath, 'llm.config.json'),
      ];

      for (const configPath of projectConfigPaths) {
        if (fs.existsSync(configPath)) {
          configPaths.llm = configPath;
          console.log(`📁 使用配置文件: ${configPath}`);
          break;
        }
      }
    }

    // 查找提示词目录
    const promptsPath = path.join(projectPath, 'prompts');
    if (fs.existsSync(promptsPath)) {
      configPaths.prompts = promptsPath;
    }

    return configPaths;
  }

  private setupMiddleware() {
    // JSON解析
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // CORS支持
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });

    // 静态文件服务
    // 优先使用项目根目录的 public（开发和生产都适用）
    const projectPublicPath = path.resolve(process.cwd(), 'public');
    const distPublicPath = path.resolve(__dirname, '../../public');
    
    // 优先使用项目根目录的 public
    if (fs.existsSync(projectPublicPath)) {
      this.app.use(express.static(projectPublicPath));
      console.log(`📁 静态文件目录: ${projectPublicPath}`);
    } else if (fs.existsSync(distPublicPath)) {
      this.app.use(express.static(distPublicPath));
      console.log(`📁 静态文件目录: ${distPublicPath}`);
    } else {
      console.warn('⚠️  未找到 public 目录，静态文件可能无法加载');
    }
  }

  private setupRoutes() {
    // Health check route
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({
        success: true,
        data: {
          status: 'ok',
          timestamp: new Date().toISOString(),
        },
      });
    });

    // API路由
    this.app.use('/api', createApiRoutes(this.agent));

    // 前端路由 - 所有非API请求返回index.html
    this.app.get('*', (req, res) => {
      if (!req.path.startsWith('/api') && !req.path.startsWith('/health')) {
        const projectPublicPath = path.resolve(process.cwd(), 'public');
        const distPublicPath = path.resolve(__dirname, '../../public');
        
        let indexPath: string;
        if (fs.existsSync(path.join(projectPublicPath, 'index.html'))) {
          indexPath = path.join(projectPublicPath, 'index.html');
        } else if (fs.existsSync(path.join(distPublicPath, 'index.html'))) {
          indexPath = path.join(distPublicPath, 'index.html');
        } else {
          return res.status(404).send('未找到 index.html');
        }
        
        res.sendFile(indexPath);
      }
    });
  }

async initialize() {
    try {
      const agentMgr = this.agent.getAgentMgr();
      const dataPath = path.join(os.homedir(), '.agent-team', 'data');

      agentMgr.configure({
        persistencePath: path.join(dataPath, 'agents.json'),
        restartFailedAgents: true,
        maxRestartAttempts: 3,
      });

      await agentMgr.loadState();

      agentMgr.on('agent.created', (event) => {
        console.log(`[Agent] Agent created: ${event.data.agent.name} (${event.data.agent.id})`);
      });

      agentMgr.on('agent.status.changed', (event) => {
        console.log(`[Agent] ${event.data.agent.name}: ${event.data.oldStatus} -> ${event.data.newStatus}`);
      });

      agentMgr.on('agent.auto-restarted', (event) => {
        console.log(`[Agent] Auto-restarted: ${event.data.agent.name} (attempt ${event.data.restartCount})`);
      });

      agentMgr.startMonitoring(30000);

      await this.agent.loadConfig();

      const llmConfig = this.agent.getLLMConfig();
      const manager = await import('../services/llm-config.js');
      const configManager = manager.getLLMConfigManager();
      const settings = configManager.getSettings();

      if (settings) {
        console.log('\n📋 LLM配置详情:');
        for (const [name, provider] of Object.entries(settings.providers)) {
          const isEnabled = configManager.isEnabled(name);
          const hasKey = configManager.hasValidApiKey(name);
          const status = isEnabled
            ? (hasKey ? '✅ 可用' : '⚠️  已启用但缺少有效API Key')
            : '❌ 已禁用';
          console.log(`  ${status} ${provider.name} (${name})`);
          if (isEnabled && !hasKey && provider.apiKey) {
            console.log(`     API Key: ${provider.apiKey.substring(0, 15)}... (可能无效)`);
          }
        }
      }

      const enabledProviders = llmConfig.providers || [];
      if (enabledProviders.length === 0) {
        console.warn('\n⚠️ 警告: 没有可用的LLM服务商');
        console.warn('   提示: 请检查配置文件，确保至少有一个服务商设置为 enabled: true 且有有效的 API Key');
      } else {
        console.log(`\n✅ Agent配置加载成功，${enabledProviders.length} 个服务商可用\n`);
      }
    } catch (error) {
      console.error('❌ Agent配置加载失败:', error);
      throw error;
    }
  }

  async start() {
    await this.initialize();

    return new Promise<void>((resolve) => {
      this.server = this.app.listen(this.port, this.host, () => {
        console.log(`\n🚀 Agent Team Web Server 已启动`);
        console.log(`📍 访问地址: http://${this.host}:${this.port}`);
        console.log(`📊 仪表板: http://${this.host}:${this.port}/dashboard`);
        console.log(`💬 支持多会话管理`);
        console.log(`\n按 Ctrl+C 停止服务器\n`);
        resolve();
      });
    });
  }

  async stop() {
    try {
      const agentMgr = this.agent.getAgentMgr();
      agentMgr.stopMonitoring();
      await agentMgr.saveState();
    } catch (error) {
      console.error('Error saving agent state:', error);
    }

    return new Promise<void>((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('\n👋 服务器已关闭\n');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getAgent(): ProjectAgent {
    return this.agent;
  }

  getApp(): express.Application {
    return this.app;
  }
}

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new AgentTeamServer({
    port: parseInt(process.env.PORT || '3020', 10),
    host: process.env.HOST || 'localhost',
    projectPath: process.env.PROJECT_PATH || process.cwd(),
  });

  server.start().catch((error) => {
    console.error('服务器启动失败:', error);
    process.exit(1);
  });

  // 优雅关闭
  process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.stop();
    process.exit(0);
  });
}