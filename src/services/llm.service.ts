import type {
  LLMConfig,
  LLMResponse,
  Message,
} from '../types/index.js';
import { getLLMConfigManager } from './llm-config.js';
import {
  ErrorCode,
  ErrorWithCode,
  getUserFriendlyError,
} from '../types/errors.js';
import { ProgressIndicator } from '../utils/error-display.js';

/**
 * LLM 服务选项
 */
interface LLMServiceOptions {
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 是否显示进度 */
  showProgress?: boolean;
  /** 进度消息 */
  progressMessage?: string;
}

/**
 * 检查 API key 是否有效
 */
function isValidApiKey(apiKey: string): boolean {
  if (!apiKey || apiKey.trim() === '') return false;
  // 检查是否为占位符
  if (apiKey.startsWith('your_') || apiKey === 'sk-xxxxx' || apiKey.startsWith('${')) {
    return false;
  }
  return true;
}

/**
 * 输出错误信息
 */
function logError(reason: string): void {
  console.log('\n' + '='.repeat(60));
  console.log('❌ LLM 服务调用失败');
  console.log('='.repeat(60));
  console.log(`\n原因: ${reason}`);
  console.log('\n请检查以下配置项:');
  console.log('  1. .env 文件是否存在并包含有效的 API Key');
  console.log('  2. llm.config.json 中的服务商配置是否正确');
  console.log('  3. 环境变量是否正确设置');
  console.log('\n示例配置:');
  console.log('  # .env');
  console.log('  ANTHROPIC_API_KEY=sk-ant-xxxxx');
  console.log('  OPENAI_API_KEY=sk-xxxxx');
  console.log('  DASHSCOPE_API_KEY=sk-xxxxx');
  console.log('  ZHIPU_API_KEY=xxxxx');
  console.log('  DEEPSEEK_API_KEY=sk-xxxxx');
}

/**
 * 带超时的 LLM 调用
 */
async function callWithTimeout<T>(
  promise: Promise<T>,
  timeout: number,
  provider: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new ErrorWithCode(
        ErrorCode.LLM_TIMEOUT,
        `${provider} API 调用超时（${timeout}ms），请检查网络连接或稍后重试`,
        { suggestions: ['检查网络连接', '稍后重试', '考虑使用其他服务商', '增加超时时间配置'] }
      ));
    }, timeout);

    promise.then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * 包装 LLM API 调用，处理超时和错误
 */
async function wrapLLMCall<T>(
  call: () => Promise<T>,
  options: LLMServiceOptions,
  provider: string
): Promise<T> {
  const timeout = options.timeout ?? 60000; // 默认 60 秒
  const showProgress = options.showProgress ?? process.stdout.isTTY;
  const progressMessage = options.progressMessage ?? `正在调用 ${provider} API...`;

  let progress: ProgressIndicator | null = null;

  if (showProgress) {
    progress = new ProgressIndicator(progressMessage);
    progress.start();
  }

  try {
    const result = await callWithTimeout(call(), timeout, provider);
    progress?.stop(true);
    return result;
  } catch (error) {
    progress?.stop(false);
    if (error instanceof ErrorWithCode) {
      throw error;
    }
    // 将其他错误转换为带代码的错误
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new ErrorWithCode(
      ErrorCode.LLM_API_ERROR,
      `${provider} API 调用失败: ${errorMessage}`,
      { suggestions: ['检查 API Key 是否有效', '确认服务商服务状态', '查看错误详情日志'] }
    );
  }
}

/**
 * LLM 服务基类
 */
export abstract class LLMService {
  protected config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  /**
   * 完成文本生成
   */
  abstract complete(messages: Message[], options?: {
    temperature?: number;
    maxTokens?: number;
    stopSequences?: string[];
  }): Promise<LLMResponse>;

  /**
   * 流式生成
   */
  async completeStream(
    messages: Message[],
    onChunk: (chunk: string) => void,
    options?: {
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<LLMResponse> {
    // 默认实现：不支持流式
    return this.complete(messages, options);
  }

  /**
   * 获取模型名称
   */
  getModel(): string {
    return this.config.model;
  }

  /**
   * 获取提供商
   */
  getProvider(): string {
    return this.config.provider;
  }

  /**
   * 检查服务是否可用
   */
  abstract isAvailable(): Promise<boolean>;

  /**
   * 计算 token 数量（估算）
   */
  estimateTokens(text: string): number {
    // 简单估算：英文约 4 字符/token，中文约 2 字符/token
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 2 + otherChars / 4);
  }
}

/**
 * Anthropic Claude 服务
 */
export class AnthropicService extends LLMService {
  private apiKey: string;

  constructor(config: LLMConfig) {
    super(config);
    this.apiKey = config.apiKey || '';
  }

  async complete(messages: Message[], options?: {
    temperature?: number;
    maxTokens?: number;
  }): Promise<LLMResponse> {
    // 检查 API key 是否有效
    if (!isValidApiKey(this.apiKey)) {
      throw new ErrorWithCode(
        ErrorCode.CONFIG_INVALID_API_KEY,
        `Anthropic API key 无效或未配置`,
        { details: `当前值: ${this.apiKey.substring(0, 10)}...` }
      );
    }

    const temperature = options?.temperature ?? this.config.temperature ?? 0.7;
    const maxTokens = options?.maxTokens ?? this.config.maxTokens ?? 4000;

    // 构建请求
    const systemMessage = messages.find(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');

    const requestBody = {
      model: this.config.model,
      max_tokens: maxTokens,
      temperature,
      system: systemMessage?.content || '',
      messages: conversationMessages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    };

    return wrapLLMCall(async () => {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();

        // 检查是否是认证错误
        if (response.status === 401 || response.status === 403) {
          throw new ErrorWithCode(
            ErrorCode.LLM_AUTH_ERROR,
            `Anthropic API 认证失败 (${response.status}): ${errorText}`
          );
        }

        if (response.status === 429) {
          throw new ErrorWithCode(
            ErrorCode.LLM_RATE_LIMITED,
            `Anthropic API 频率限制 (${response.status}): ${errorText}`
          );
        }

        if (response.status >= 500) {
          throw new ErrorWithCode(
            ErrorCode.LLM_SERVER_ERROR,
            `Anthropic API 服务端错误 (${response.status}): ${errorText}`
          );
        }

        throw new ErrorWithCode(
          ErrorCode.LLM_API_ERROR,
          `Anthropic API error: ${response.status} - ${errorText}`
        );
      }

      const data: any = await response.json();

      return {
        content: data.content[0].text,
        usage: {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
          totalTokens: data.usage.input_tokens + data.usage.output_tokens,
        },
        finishReason: data.stop_reason,
      };
    }, {
      timeout: 60000,
      showProgress: true,
      progressMessage: `正在调用 Anthropic ${this.config.model}...`,
    }, 'Anthropic');
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      });

      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * OpenAI 服务
 */
export class OpenAIService extends LLMService {
  private apiKey: string;

  constructor(config: LLMConfig) {
    super(config);
    this.apiKey = config.apiKey || '';
  }

  async complete(messages: Message[], options?: {
    temperature?: number;
    maxTokens?: number;
  }): Promise<LLMResponse> {
    // 检查 API key 是否有效
    if (!isValidApiKey(this.apiKey)) {
      const baseURL = this.config.baseURL || 'OpenAI';
      throw new ErrorWithCode(
        ErrorCode.CONFIG_INVALID_API_KEY,
        `${baseURL} API key 无效或未配置`,
        { details: `当前值: ${this.apiKey.substring(0, 10)}...` }
      );
    }

    const temperature = options?.temperature ?? this.config.temperature ?? 0.7;
    const maxTokens = options?.maxTokens ?? this.config.maxTokens ?? 4000;

    const model = this.config.model;

    const isGLMModel = model.startsWith('glm-');

    const messagesFormatted = messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    const requestBody: any = {
      model,
      messages: messagesFormatted,
      temperature: temperature,
    };

    if (isGLMModel) {
      requestBody.max_new_tokens = maxTokens;
      requestBody.extra_body = {
        thinking: { type: "enabled" }
      };
    } else {
      requestBody.max_tokens = maxTokens;
    }

    const baseURL = this.config.baseURL || 'OpenAI';

    console.log(`[LLM] 请求: ${baseURL}/chat/completions`);
    console.log(`[LLM] model: ${model}`);
    console.log(`[LLM] body:`, JSON.stringify(requestBody, null, 2));

    return wrapLLMCall(async () => {
      const response = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();

        // 检查是否是认证错误
        if (response.status === 401 || response.status === 403) {
          throw new ErrorWithCode(
            ErrorCode.LLM_AUTH_ERROR,
            `${baseURL} API 认证失败 (${response.status}): ${errorText}`
          );
        }

        if (response.status === 429) {
          throw new ErrorWithCode(
            ErrorCode.LLM_RATE_LIMITED,
            `${baseURL} API 频率限制 (${response.status}): ${errorText}`
          );
        }

        if (response.status >= 500) {
          throw new ErrorWithCode(
            ErrorCode.LLM_SERVER_ERROR,
            `${baseURL} API 服务端错误 (${response.status}): ${errorText}`
          );
        }

        throw new ErrorWithCode(
          ErrorCode.LLM_API_ERROR,
          `OpenAI API error: ${response.status} - ${errorText}`
        );
      }

      const data: any = await response.json();

      return {
        content: data.choices[0].message.content,
        usage: {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        },
        finishReason: data.choices[0].finish_reason,
      };
    }, {
      timeout: 60000,
      showProgress: true,
      progressMessage: `正在调用 ${baseURL} ${this.config.model}...`,
    }, baseURL);
  }

  async isAvailable(): Promise<boolean> {
    try {
      const baseURL = this.config.baseURL || 'https://api.openai.com/v1';
      const response = await fetch(`${baseURL}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * LLM 服务工厂
 * 支持动态配置和多服务商
 */
export class LLMServiceFactory {
  private static fallbackAttempts: Map<string, string[]> = new Map();

  /**
   * 创建 LLM 服务实例
   */
  static create(config: LLMConfig): LLMService {
    switch (config.provider) {
      case 'anthropic':
        return new AnthropicService(config);
      case 'openai':
        return new OpenAIService(config);
      default:
        throw new Error(`Unsupported LLM provider: ${config.provider}`);
    }
  }

  /**
   * 为角色创建 LLM 服务（使用配置管理器）
   */
  static createForRole(roleType: string): LLMService | null {
    const manager = getLLMConfigManager();

    const config = manager.getRoleLLMConfig(roleType);
    if (!config) {
      return null;
    }

    return this.create(config);
  }

  /**
   * 带故障转移的创建
   */
  static createWithFallback(
    roleType: string,
    attemptedProviders?: string[]
  ): LLMService | null {
    const manager = getLLMConfigManager();

    const fallbackOrder = manager.getFallbackOrder();

    // 过滤掉已尝试的提供商
    const available = fallbackOrder.filter(
      (p: string) => !attemptedProviders?.includes(p)
    );

    for (const providerName of available) {
      const provider = manager.getProvider(providerName);
      if (!provider || provider.enabled === false) continue;

      // 使用该提供商的默认模型
      const modelConfig: any = Object.values(provider.models)[0];
      const config: LLMConfig = {
        provider: provider.provider,
        apiKey: provider.apiKey,
        model: modelConfig.model,
        baseURL: provider.baseURL,
        maxTokens: modelConfig.maxTokens,
        temperature: modelConfig.temperature,
      };

      return this.create(config);
    }

    return null;
  }

  /**
   * 记录失败的提供商
   */
  static recordFailure(roleType: string, providerName: string): void {
    if (!this.fallbackAttempts.has(roleType)) {
      this.fallbackAttempts.set(roleType, []);
    }
    this.fallbackAttempts.get(roleType)!.push(providerName);
  }

  /**
   * 清除失败记录
   */
  static clearFailures(roleType?: string): void {
    if (roleType) {
      this.fallbackAttempts.delete(roleType);
    } else {
      this.fallbackAttempts.clear();
    }
  }
}
