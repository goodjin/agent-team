/**
 * Agent Message Bus
 * 支持 Agent 之间发送/接收消息：点对点消息、广播消息、主题订阅
 */

import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'eventemitter3';

/**
 * 消息类型
 */
export type MessageType = 
  | 'direct'      // 点对点消息
  | 'broadcast'   // 广播消息
  | 'topic';      // 主题消息

/**
 * 消息优先级
 */
export type MessagePriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * Agent 标识
 */
export interface AgentId {
  id: string;
  name?: string;
  type?: string;
}

/**
 * 消息内容
 */
export interface MessageContent {
  type: string;
  payload: any;
  metadata?: Record<string, any>;
}

/**
 * 消息接口
 */
export interface Message {
  id: string;
  type: MessageType;
  from: AgentId;
  to?: AgentId | AgentId[];  // 点对点时为单个 Agent，广播时可为多个
  topic?: string;            // 主题订阅时使用
  content: MessageContent;
  priority: MessagePriority;
  timestamp: Date;
  expiresAt?: Date;          // 消息过期时间
  correlationId?: string;    // 用于消息关联/追踪
  replyTo?: string;          // 回复的消息 ID
}

/**
 * 消息订阅者
 */
export interface Subscriber {
  id: string;
  agentId: AgentId;
  topics?: string[];        // 订阅的主题列表
  filter?: (message: Message) => boolean;  // 消息过滤器
  callback: (message: Message) => void | Promise<void>;
}

/**
 * 消息投递结果
 */
export interface MessageDeliveryResult {
  success: boolean;
  messageId: string;
  deliveredTo: AgentId[];
  failedTo?: AgentId[];
  errors?: string[];
}

/**
 * 消息统计
 */
export interface MessageStats {
  totalMessages: number;
  directMessages: number;
  broadcastMessages: number;
  topicMessages: number;
  delivered: number;
  failed: number;
  subscribers: number;
}

/**
 * 消息总线配置
 */
export interface MessageBusConfig {
  enableLogging?: boolean;
  maxQueueSize?: number;      // 消息队列最大长度
  messageTTL?: number;       // 消息默认存活时间（毫秒）
  enablePersistence?: boolean; // 是否持久化消息
  maxRetries?: number;       // 最大重试次数
}

/**
 * Agent 消息总线
 */
export class AgentMessageBus extends EventEmitter {
  private agents: Map<string, AgentId> = new Map();
  private subscribers: Map<string, Set<Subscriber>> = new Map();  // topic -> subscribers
  private directSubscribers: Map<string, Set<Subscriber>> = new Map();  // agentId -> subscribers
  private messageQueue: Message[] = [];
  private config: MessageBusConfig;
  private stats: MessageStats = {
    totalMessages: 0,
    directMessages: 0,
    broadcastMessages: 0,
    topicMessages: 0,
    delivered: 0,
    failed: 0,
    subscribers: 0,
  };
  private messageHandlers: Map<string, (message: Message) => Promise<void>> = new Map();

  constructor(config: MessageBusConfig = {}) {
    super();
    this.config = {
      enableLogging: false,
      maxQueueSize: 1000,
      messageTTL: 300000, // 5 minutes
      enablePersistence: false,
      maxRetries: 3,
      ...config,
    };
  }

  /**
   * 注册 Agent
   */
  registerAgent(agent: AgentId): void {
    if (!agent.id) {
      throw new Error('Agent ID is required');
    }
    
    this.agents.set(agent.id, agent);
    this.directSubscribers.set(agent.id, new Set());
    
    if (this.config.enableLogging) {
      console.log(`[MessageBus] Agent registered: ${agent.id} (${agent.name || 'unnamed'})`);
    }

    this.emit('agent:registered', { agent });
  }

  /**
   * 注销 Agent
   */
  unregisterAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return;
    }

    // 移除所有订阅
    this.subscribers.forEach(subs => {
      subs.forEach(sub => {
        if (sub.agentId.id === agentId) {
          subs.delete(sub);
        }
      });
    });

    this.directSubscribers.delete(agentId);
    this.agents.delete(agentId);

    if (this.config.enableLogging) {
      console.log(`[MessageBus] Agent unregistered: ${agentId}`);
    }

    this.emit('agent:unregistered', { agentId });
  }

  /**
   * 检查 Agent 是否已注册
   */
  isAgentRegistered(agentId: string): boolean {
    return this.agents.has(agentId);
  }

  /**
   * 获取所有已注册的 Agent
   */
  getRegisteredAgents(): AgentId[] {
    return Array.from(this.agents.values());
  }

  /**
   * 发送点对点消息
   */
  async sendDirectMessage(
    from: AgentId,
    to: AgentId,
    content: MessageContent,
    options: {
      priority?: MessagePriority;
      correlationId?: string;
      replyTo?: string;
      expiresIn?: number;
    } = {}
  ): Promise<MessageDeliveryResult> {
    // 验证发送者
    if (!this.isAgentRegistered(from.id)) {
      this.registerAgent(from);
    }

    // 验证接收者
    if (!this.isAgentRegistered(to.id)) {
      return {
        success: false,
        messageId: '',
        deliveredTo: [],
        failedTo: [to],
        errors: [`Recipient agent not registered: ${to.id}`],
      };
    }

    const message: Message = {
      id: uuidv4(),
      type: 'direct',
      from,
      to,
      content,
      priority: options.priority || 'normal',
      timestamp: new Date(),
      correlationId: options.correlationId,
      replyTo: options.replyTo,
      expiresAt: options.expiresIn 
        ? new Date(Date.now() + options.expiresIn) 
        : new Date(Date.now() + this.config.messageTTL!),
    };

    return this.deliverMessage(message);
  }

  /**
   * 发送广播消息
   */
  async sendBroadcast(
    from: AgentId,
    content: MessageContent,
    options: {
      to?: AgentId[];        // 可指定接收者列表，空数组表示所有 Agent
      priority?: MessagePriority;
      correlationId?: string;
      expiresIn?: number;
    } = {}
  ): Promise<MessageDeliveryResult> {
    // 验证发送者
    if (!this.isAgentRegistered(from.id)) {
      this.registerAgent(from);
    }

    const recipients = options.to 
      ? options.to.filter(a => this.isAgentRegistered(a.id))
      : Array.from(this.agents.values()).filter(a => a.id !== from.id);

    const message: Message = {
      id: uuidv4(),
      type: 'broadcast',
      from,
      to: recipients,
      content,
      priority: options.priority || 'normal',
      timestamp: new Date(),
      correlationId: options.correlationId,
      expiresAt: options.expiresIn 
        ? new Date(Date.now() + options.expiresIn) 
        : new Date(Date.now() + this.config.messageTTL!),
    };

    return this.deliverMessage(message);
  }

  /**
   * 发布主题消息
   */
  async publishTopic(
    from: AgentId,
    topic: string,
    content: MessageContent,
    options: {
      priority?: MessagePriority;
      correlationId?: string;
      expiresIn?: number;
    } = {}
  ): Promise<MessageDeliveryResult> {
    // 验证发送者
    if (!this.isAgentRegistered(from.id)) {
      this.registerAgent(from);
    }

    const message: Message = {
      id: uuidv4(),
      type: 'topic',
      from,
      topic,
      content,
      priority: options.priority || 'normal',
      timestamp: new Date(),
      correlationId: options.correlationId,
      expiresAt: options.expiresIn 
        ? new Date(Date.now() + options.expiresIn) 
        : new Date(Date.now() + this.config.messageTTL!),
    };

    return this.deliverTopicMessage(message);
  }

  /**
   * 订阅主题
   */
  subscribe(
    agentId: AgentId,
    topics: string | string[],
    callback: (message: Message) => void | Promise<void>,
    filter?: (message: Message) => boolean
  ): string {
    const topicList = Array.isArray(topics) ? topics : [topics];
    const subscriberId = uuidv4();

    const subscriber: Subscriber = {
      id: subscriberId,
      agentId,
      topics: topicList,
      filter,
      callback,
    };

    for (const topic of topicList) {
      if (!this.subscribers.has(topic)) {
        this.subscribers.set(topic, new Set());
      }
      this.subscribers.get(topic)!.add(subscriber);
    }

    this.stats.subscribers = this.countSubscribers();

    if (this.config.enableLogging) {
      console.log(`[MessageBus] Agent ${agentId.id} subscribed to topics: ${topicList.join(', ')}`);
    }

    this.emit('subscribed', { agentId, topics: topicList });

    return subscriberId;
  }

  /**
   * 订阅特定 Agent 的消息
   */
  subscribeToAgent(
    targetAgentId: string,
    subscriberAgentId: AgentId,
    callback: (message: Message) => void | Promise<void>
  ): string {
    if (!this.directSubscribers.has(targetAgentId)) {
      this.directSubscribers.set(targetAgentId, new Set());
    }

    const subscriber: Subscriber = {
      id: uuidv4(),
      agentId: subscriberAgentId,
      callback,
    };

    this.directSubscribers.get(targetAgentId)!.add(subscriber);
    this.stats.subscribers = this.countSubscribers();

    if (this.config.enableLogging) {
      console.log(`[MessageBus] Agent ${subscriberAgentId.id} subscribed to messages from ${targetAgentId}`);
    }

    return subscriber.id;
  }

  /**
   * 取消订阅
   */
  unsubscribe(subscriberId: string): boolean {
    let found = false;

    // 从主题订阅中移除
    this.subscribers.forEach(subs => {
      subs.forEach(sub => {
        if (sub.id === subscriberId) {
          subs.delete(sub);
          found = true;
        }
      });
    });

    // 从直接订阅中移除
    this.directSubscribers.forEach(subs => {
      subs.forEach(sub => {
        if (sub.id === subscriberId) {
          subs.delete(sub);
          found = true;
        }
      });
    });

    if (found) {
      this.stats.subscribers = this.countSubscribers();
      this.emit('unsubscribed', { subscriberId });
    }

    return found;
  }

  /**
   * 获取订阅的主题列表
   */
  getTopics(): string[] {
    return Array.from(this.subscribers.keys());
  }

  /**
   * 获取主题订阅者数量
   */
  getTopicSubscriberCount(topic: string): number {
    return this.subscribers.get(topic)?.size || 0;
  }

  /**
   * 注册消息处理器
   */
  registerMessageHandler(
    messageType: string,
    handler: (message: Message) => Promise<void>
  ): void {
    this.messageHandlers.set(messageType, handler);
  }

  /**
   * 投递消息
   */
  private async deliverMessage(message: Message): Promise<MessageDeliveryResult> {
    this.stats.totalMessages++;
    this.stats.directMessages++;

    const deliveredTo: AgentId[] = [];
    const failedTo: AgentId[] = [];
    const errors: string[] = [];

    // 检查消息是否过期
    if (message.expiresAt && message.expiresAt < new Date()) {
      this.stats.failed++;
      return {
        success: false,
        messageId: message.id,
        deliveredTo: [],
        failedTo: Array.isArray(message.to) ? message.to : [message.to!],
        errors: ['Message expired'],
      };
    }

    const recipients = Array.isArray(message.to) ? message.to : [message.to];

    for (const recipient of recipients) {
      if (!recipient) continue;
      
      try {
        // 发送给接收者
        await this.deliverToRecipient(message, recipient);
        deliveredTo.push(recipient);
        this.stats.delivered++;

        if (this.config.enableLogging) {
          console.log(`[MessageBus] Direct message ${message.id} delivered to ${recipient.id}`);
        }
      } catch (error) {
        failedTo.push(recipient);
        errors.push(`Failed to deliver to ${recipient.id}: ${error}`);
        this.stats.failed++;
      }
    }

    // 触发消息发送事件
    this.emit('message:sent', { message, deliveredTo, failedTo });

    // 调用消息处理器
    await this.handleMessage(message);

    return {
      success: failedTo.length === 0,
      messageId: message.id,
      deliveredTo,
      failedTo: failedTo.length > 0 ? failedTo : undefined,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * 投递主题消息
   */
  private async deliverTopicMessage(message: Message): Promise<MessageDeliveryResult> {
    if (!message.topic) {
      throw new Error('Topic is required for topic messages');
    }

    this.stats.totalMessages++;
    this.stats.topicMessages++;

    const deliveredTo: AgentId[] = [];
    const errors: string[] = [];

    const topicSubs = this.subscribers.get(message.topic) || new Set();

    for (const subscriber of topicSubs) {
      // 检查过滤器
      if (subscriber.filter && !subscriber.filter(message)) {
        continue;
      }

      try {
        await subscriber.callback(message);
        deliveredTo.push(subscriber.agentId);
        this.stats.delivered++;

        if (this.config.enableLogging) {
          console.log(`[MessageBus] Topic message ${message.id} delivered to ${subscriber.agentId.id}`);
        }
      } catch (error) {
        errors.push(`Failed to deliver to ${subscriber.agentId.id}: ${error}`);
        this.stats.failed++;
      }
    }

    this.emit('topic:published', { message, deliveredTo });

    // 调用消息处理器
    await this.handleMessage(message);

    return {
      success: errors.length === 0,
      messageId: message.id,
      deliveredTo,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * 投递消息给特定接收者
   */
  private async deliverToRecipient(message: Message, recipient: AgentId): Promise<void> {
    const subs = this.directSubscribers.get(recipient.id);
    
    // 直接回调订阅者
    if (subs) {
      for (const subscriber of subs) {
        if (subscriber.filter && !subscriber.filter(message)) {
          continue;
        }
        await subscriber.callback(message);
      }
    }

    // 同时触发事件
    this.emit(`message:${recipient.id}`, message);
  }

  /**
   * 处理消息
   */
  private async handleMessage(message: Message): Promise<void> {
    const handler = this.messageHandlers.get(message.content.type);
    if (handler) {
      try {
        await handler(message);
      } catch (error) {
        console.error(`[MessageBus] Error in message handler for ${message.content.type}:`, error);
      }
    }
  }

  /**
   * 统计订阅者数量
   */
  private countSubscribers(): number {
    let count = 0;
    this.subscribers.forEach(subs => {
      count += subs.size;
    });
    return count;
  }

  /**
   * 获取消息统计
   */
  getStats(): MessageStats {
    return { ...this.stats };
  }

  /**
   * 重置统计
   */
  resetStats(): void {
    this.stats = {
      totalMessages: 0,
      directMessages: 0,
      broadcastMessages: 0,
      topicMessages: 0,
      delivered: 0,
      failed: 0,
      subscribers: this.countSubscribers(),
    };
  }

  /**
   * 清空消息队列
   */
  clearQueue(): void {
    this.messageQueue = [];
  }

  /**
   * 获取队列大小
   */
  getQueueSize(): number {
    return this.messageQueue.length;
  }

  /**
   * 等待特定消息
   */
  waitForMessage(
    filter: (message: Message) => boolean,
    timeout: number = 30000
  ): Promise<Message> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off('message:sent', handleMessage);
        reject(new Error(`Timeout waiting for message after ${timeout}ms`));
      }, timeout);

      const handleMessage = ({ message }: { message: Message }) => {
        if (filter(message)) {
          clearTimeout(timer);
          this.off('message:sent', handleMessage);
          resolve(message);
        }
      };

      this.on('message:sent', handleMessage);
    });
  }

  /**
   * 响应消息
   */
  async replyTo(
    originalMessage: Message,
    from: AgentId,
    content: MessageContent
  ): Promise<MessageDeliveryResult> {
    if (!originalMessage.from) {
      throw new Error('Original message has no sender');
    }

    return this.sendDirectMessage(from, originalMessage.from, content, {
      correlationId: originalMessage.correlationId || originalMessage.id,
      replyTo: originalMessage.id,
    });
  }
}

/**
 * 创建消息内容 helper
 */
export function createMessageContent(
  type: string,
  payload: any,
  metadata?: Record<string, any>
): MessageContent {
  return { type, payload, metadata };
}

/**
 * 创建默认的消息总线实例
 */
export function createMessageBus(config?: MessageBusConfig): AgentMessageBus {
  return new AgentMessageBus(config);
}
