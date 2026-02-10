import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { ProjectAgent } from '../core/project-agent.js';
import { createApiRoutes } from './api.js';
import { getSessionManager } from './session-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function log(...args: any[]) {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const logMsg = `[${timestamp}] ${msg}`;
  console.log(logMsg);
  try {
    const logDir = path.join(os.homedir(), '.agent-team', 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, `server-${new Date().toISOString().split('T')[0]}.log`);
    fs.appendFileSync(logFile, logMsg + '\n');
  } catch (e) {}
}

function errorLog(...args: any[]) {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const logMsg = `[${timestamp}] ERROR: ${msg}`;
  console.error(logMsg);
  try {
    const logDir = path.join(os.homedir(), '.agent-team', 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, `server-${new Date().toISOString().split('T')[0]}.log`);
    fs.appendFileSync(logFile, logMsg + '\n');
  } catch (e) {}
}

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

    const projectPath = options.projectPath || process.cwd();
    const homeDir = os.homedir();
    const llmConfigPath = path.join(homeDir, '.agent-team', 'config.yaml');

    this.agent = new ProjectAgent(
      {
        projectName: path.basename(projectPath),
        projectPath,
      },
      { llm: llmConfigPath }
    );

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });

    const projectPublicPath = path.resolve(process.cwd(), 'public');
    const distPublicPath = path.resolve(__dirname, '../../public');
    
    if (fs.existsSync(projectPublicPath)) {
      this.app.use(express.static(projectPublicPath));
      log(`📁 静态文件目录: ${projectPublicPath}`);
    } else if (fs.existsSync(distPublicPath)) {
      this.app.use(express.static(distPublicPath));
      log(`📁 静态文件目录: ${distPublicPath}`);
    } else {
      log('⚠️ 未找到 public 目录');
    }
  }

  private setupRoutes() {
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({
        success: true,
        data: {
          status: 'ok',
          timestamp: new Date().toISOString(),
        },
      });
    });

    this.app.use('/api', createApiRoutes(this.agent));

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

      agentMgr.on('agent.created', (event: any) => {
        log(`[Agent] Agent created: ${event.data.agent.name} (${event.data.agent.id})`);
      });

      agentMgr.on('agent.status.changed', (event: any) => {
        if (!event.data?.agent) return;
        log(`[Agent] ${event.data.agent.name}: ${event.data.oldStatus} -> ${event.data.newStatus}`);
      });

      agentMgr.on('agent.auto-restarted', (event: any) => {
        log(`[Agent] Auto-restarted: ${event.data.agent.name} (attempt ${event.data.restartCount})`);
      });

      agentMgr.startMonitoring(30000);

      await this.agent.loadConfig();

      const llmConfig = this.agent.getLLMConfig();
      const enabledProviders = llmConfig?.providers || [];
      
      log(`\n✅ Agent配置加载成功，${enabledProviders.length} 个服务商可用`);
    } catch (error) {
      errorLog('❌ Agent配置加载失败:', error);
      throw error;
    }
  }

  async start() {
    await this.initialize();

    return new Promise<void>((resolve) => {
      this.server = this.app.listen(this.port, this.host, () => {
        log(`\n🚀 Agent Team Web Server 已启动`);
        log(`📍 访问地址: http://${this.host}:${this.port}`);
        log(`📊 仪表板: http://${this.host}:${this.port}/dashboard`);
        log(`\n按 Ctrl+C 停止服务器\n`);
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
      errorLog('Error saving agent state:', error);
    }

    return new Promise<void>((resolve) => {
      if (this.server) {
        this.server.close(() => {
          log('\n👋 服务器已关闭\n');
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new AgentTeamServer({
    port: parseInt(process.env.PORT || '3020', 10),
    host: process.env.HOST || 'localhost',
    projectPath: process.env.PROJECT_PATH || process.cwd(),
  });

  server.start().catch((error) => {
    errorLog('服务器启动失败:', error);
    process.exit(1);
  });

  process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.stop();
    process.exit(0);
  });
}
