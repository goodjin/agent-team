import { v4 as uuidv4 } from 'uuid';
import { ProjectAgent } from '../core/project-agent.js';
import path from 'path';
import fs from 'fs';

export interface Session {
  id: string;
  name: string;
  agent: ProjectAgent;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 会话管理器
 * 管理多个独立的Agent会话
 */
export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private defaultSessionId: string | null = null;

  /**
   * 创建新会话
   */
  async createSession(
    name: string,
    projectPath?: string,
    configPaths?: { llm?: string; prompts?: string | string[] }
  ): Promise<Session> {
    const sessionId = uuidv4();
    const actualProjectPath = projectPath || process.cwd();

    // 查找配置文件路径
    const llmConfigPath = configPaths?.llm || this.findConfigPath(actualProjectPath);

    const agent = new ProjectAgent(
      {
        projectName: path.basename(actualProjectPath),
        projectPath: actualProjectPath,
      },
      {
        llm: llmConfigPath,
        prompts: configPaths?.prompts || './prompts',
      }
    );

    // 加载配置
    await agent.loadConfig();

    const session: Session = {
      id: sessionId,
      name,
      agent,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.sessions.set(sessionId, session);

    // 如果没有默认会话，设置这个为默认
    if (!this.defaultSessionId) {
      this.defaultSessionId = sessionId;
    }

    return session;
  }

  /**
   * 获取会话
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * 获取默认会话
   */
  getDefaultSession(): Session | undefined {
    if (this.defaultSessionId) {
      return this.sessions.get(this.defaultSessionId);
    }
    return undefined;
  }

  /**
   * 设置默认会话
   */
  setDefaultSession(sessionId: string): boolean {
    if (this.sessions.has(sessionId)) {
      this.defaultSessionId = sessionId;
      return true;
    }
    return false;
  }

  /**
   * 获取所有会话
   */
  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  /**
   * 删除会话
   */
  deleteSession(sessionId: string): boolean {
    if (this.sessions.has(sessionId)) {
      const session = this.sessions.get(sessionId);
      if (session) {
        // 关闭agent
        session.agent.shutdown().catch(console.error);
      }

      this.sessions.delete(sessionId);

      // 如果删除的是默认会话，选择另一个作为默认
      if (this.defaultSessionId === sessionId) {
        const remaining = Array.from(this.sessions.keys());
        this.defaultSessionId = remaining.length > 0 ? remaining[0] : null;
      }

      return true;
    }
    return false;
  }

  /**
   * 更新会话名称
   */
  updateSessionName(sessionId: string, name: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.name = name;
      session.updatedAt = new Date();
      return true;
    }
    return false;
  }

  /**
   * 查找配置文件路径
   */
  private findConfigPath(projectPath: string): string | undefined {
    const configPathsToTry = [
      path.join(projectPath, '.agent-team', 'config.yaml'),
      path.join(projectPath, '.agent-team.yaml'),
      path.join(projectPath, 'agent.config.yaml'),
      path.join(projectPath, 'llm.config.json'),
    ];

    for (const configPath of configPathsToTry) {
      if (fs.existsSync(configPath)) {
        return configPath;
      }
    }

    return undefined;
  }
}

// 单例实例
let sessionManagerInstance: SessionManager | null = null;

export function getSessionManager(): SessionManager {
  if (!sessionManagerInstance) {
    sessionManagerInstance = new SessionManager();
  }
  return sessionManagerInstance;
}