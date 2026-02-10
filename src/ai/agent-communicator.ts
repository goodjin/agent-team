import EventEmitter3 from 'eventemitter3';

export interface AgentMessage {
  id: string;
  from: string;
  to?: string; // undefined 表示广播
  type: 'broadcast' | 'direct' | 'request' | 'response';
  payload: any;
  timestamp: Date;
  requestId?: string; // 用于请求-响应配对
}

export interface RequestOptions {
  timeout?: number;
}

export class AgentCommunicator {
  private eventBus: EventEmitter3;
  private agentId: string;
  private messageIdCounter: number = 0;
  private pendingRequests: Map<
    string,
    {
      resolve: (value: any) => void;
      reject: (error: any) => void;
      timeoutId: NodeJS.Timeout;
    }
  > = new Map();

  constructor(agentId: string, eventBus?: EventEmitter3) {
    this.agentId = agentId;
    this.eventBus = eventBus || new EventEmitter3();

    // 监听直接消息
    this.eventBus.on(`agent:${agentId}:message`, this.handleMessage.bind(this));

    // 监听广播消息
    this.eventBus.on('agent:broadcast', this.handleBroadcast.bind(this));
  }

  /**
   * 广播消息
   */
  broadcast(payload: any): void {
    const message: AgentMessage = {
      id: this.generateMessageId(),
      from: this.agentId,
      type: 'broadcast',
      payload,
      timestamp: new Date(),
    };

    this.eventBus.emit('agent:broadcast', message);
  }

  /**
   * 发送点对点消息
   */
  send(to: string, payload: any): void {
    const message: AgentMessage = {
      id: this.generateMessageId(),
      from: this.agentId,
      to,
      type: 'direct',
      payload,
      timestamp: new Date(),
    };

    this.eventBus.emit(`agent:${to}:message`, message);
  }

  /**
   * 请求-响应模式
   */
  async request(
    to: string,
    payload: any,
    options: RequestOptions = {}
  ): Promise<any> {
    const requestId = this.generateMessageId();
    const timeout = options.timeout || 30000;

    const message: AgentMessage = {
      id: this.generateMessageId(),
      from: this.agentId,
      to,
      type: 'request',
      payload,
      requestId,
      timestamp: new Date(),
    };

    return new Promise((resolve, reject) => {
      // 设置超时
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);

      // 保存 Promise 处理器
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeoutId,
      });

      // 发送请求
      this.eventBus.emit(`agent:${to}:message`, message);
    });
  }

  /**
   * 响应请求
   */
  respond(requestId: string, to: string, payload: any): void {
    const message: AgentMessage = {
      id: this.generateMessageId(),
      from: this.agentId,
      to,
      type: 'response',
      payload,
      requestId,
      timestamp: new Date(),
    };

    this.eventBus.emit(`agent:${to}:message`, message);
  }

  /**
   * 监听消息
   */
  onMessage(
    handler: (message: AgentMessage) => void | Promise<void>
  ): () => void {
    const listener = async (message: AgentMessage) => {
      await handler(message);
    };

    this.eventBus.on(`message:${this.agentId}`, listener);

    // 返回取消监听的函数
    return () => {
      this.eventBus.off(`message:${this.agentId}`, listener);
    };
  }

  /**
   * 监听特定类型的消息
   */
  onMessageType(
    type: AgentMessage['type'],
    handler: (message: AgentMessage) => void | Promise<void>
  ): () => void {
    return this.onMessage(async (message) => {
      if (message.type === type) {
        await handler(message);
      }
    });
  }

  /**
   * 监听广播消息
   */
  onBroadcast(
    handler: (message: AgentMessage) => void | Promise<void>
  ): () => void {
    const listener = async (message: AgentMessage) => {
      // 忽略自己发送的广播
      if (message.from !== this.agentId) {
        await handler(message);
      }
    };

    this.eventBus.on('broadcast:received', listener);

    return () => {
      this.eventBus.off('broadcast:received', listener);
    };
  }

  /**
   * 处理接收到的消息
   */
  private handleMessage(message: AgentMessage): void {
    // 检查是否是响应消息
    if (message.type === 'response' && message.requestId) {
      const pending = this.pendingRequests.get(message.requestId);

      if (pending) {
        clearTimeout(pending.timeoutId);
        this.pendingRequests.delete(message.requestId);
        pending.resolve(message.payload);
        return;
      }
    }

    // 触发通用消息事件
    this.eventBus.emit(`message:${this.agentId}`, message);
  }

  /**
   * 处理广播消息
   */
  private handleBroadcast(message: AgentMessage): void {
    // 忽略自己发送的广播
    if (message.from === this.agentId) {
      return;
    }

    this.eventBus.emit('broadcast:received', message);
    this.eventBus.emit(`message:${this.agentId}`, message);
  }

  /**
   * 生成消息 ID
   */
  private generateMessageId(): string {
    return `${this.agentId}-${Date.now()}-${++this.messageIdCounter}`;
  }

  /**
   * 获取 Agent ID
   */
  getAgentId(): string {
    return this.agentId;
  }

  /**
   * 获取事件总线（用于共享）
   */
  getEventBus(): EventEmitter3 {
    return this.eventBus;
  }

  /**
   * 清理资源
   */
  destroy(): void {
    // 清理所有待处理的请求
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error('Agent communicator destroyed'));
    }

    this.pendingRequests.clear();

    // 移除所有监听器
    this.eventBus.removeAllListeners(`agent:${this.agentId}:message`);
    this.eventBus.removeAllListeners(`message:${this.agentId}`);
    this.eventBus.removeAllListeners('broadcast:received');
  }
}
