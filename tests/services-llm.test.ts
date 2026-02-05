import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LLMService } from '../src/services/llm/llm-service.js';
import { ConfigManager } from '../src/config/config-manager.js';
import type { ChatRequest, ChatResponse, ProviderInfo } from '../src/types/index.js';

vi.mock('../src/config/config-manager.js');
vi.mock('node:fs/promises');

describe('LLMService', () => {
  const mockProviderConfig = {
    name: 'openai',
    provider: 'openai' as const,
    apiKey: 'sk-test',
    baseURL: 'https://api.openai.com/v1',
    enabled: true,
    models: {
      'gpt-4': {
        model: 'gpt-4',
        maxTokens: 4000,
        temperature: 0.7,
        description: 'GPT-4 model',
      },
    },
  };

  const mockLLMConfig = {
    defaultProvider: 'openai',
    providers: {
      openai: mockProviderConfig,
    },
    roleMapping: {},
    fallbackOrder: ['openai'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with default options', () => {
      const service = new LLMService();
      expect(service).toBeDefined();
    });

    it('should create instance with custom options', () => {
      const service = new LLMService({
        defaultTimeout: 30000,
        maxRetries: 5,
      });
      expect(service).toBeDefined();
    });
  });

  describe('getAvailableProviders', () => {
    it('should return empty list when not initialized', () => {
      const service = new LLMService();
      const providers = service.getAvailableProviders();
      expect(providers).toEqual([]);
    });
  });

  describe('getStats', () => {
    it('should return zero stats initially', () => {
      const service = new LLMService();
      const stats = service.getStats();
      expect(stats.promptTokens).toBe(0);
      expect(stats.completionTokens).toBe(0);
      expect(stats.totalTokens).toBe(0);
    });
  });

  describe('resetStats', () => {
    it('should reset token stats to zero', () => {
      const service = new LLMService();
      service.resetStats();
      const stats = service.getStats();
      expect(stats.totalTokens).toBe(0);
    });
  });

  describe('getDefaultProvider', () => {
    it('should return empty string when not initialized', () => {
      const service = new LLMService();
      const provider = service.getDefaultProvider();
      expect(provider).toBe('');
    });
  });

  describe('getCurrentProvider', () => {
    it('should return empty string when not initialized', () => {
      const service = new LLMService();
      const provider = service.getCurrentProvider();
      expect(provider).toBe('');
    });
  });

  describe('healthCheck', () => {
    it('should return false when not initialized', async () => {
      const service = new LLMService();
      const result = await service.healthCheck();
      expect(result).toBe(false);
    });

    it('should return false for non-existent provider', async () => {
      const service = new LLMService();
      const result = await service.healthCheck('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('failover', () => {
    it('should return false when no fallback available', async () => {
      const service = new LLMService();
      const result = await service.failover('openai');
      expect(result).toBe(false);
    });
  });

  describe('setDefaultProvider', () => {
    it('should throw error for non-existent provider', () => {
      const service = new LLMService();
      expect(() => service.setDefaultProvider('nonexistent')).toThrow();
    });
  });
});

describe('LLMService Integration', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should handle chat request structure', async () => {
    const request: ChatRequest = {
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' },
      ],
      model: 'gpt-4',
      temperature: 0.7,
      maxTokens: 100,
    };

    expect(request.messages).toHaveLength(2);
    expect(request.messages[0].role).toBe('system');
    expect(request.model).toBe('gpt-4');
  });

  it('should handle chat response structure', () => {
    const response: ChatResponse = {
      id: 'resp-001',
      model: 'gpt-4',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'Hello! How can I help you?',
          },
          finishReason: 'stop',
        },
      ],
      usage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
    };

    expect(response.id).toBe('resp-001');
    expect(response.choices).toHaveLength(1);
    expect(response.usage.totalTokens).toBe(15);
  });

  it('should handle provider info structure', () => {
    const provider: ProviderInfo = {
      name: 'openai',
      enabled: true,
      models: ['gpt-4', 'gpt-3.5-turbo'],
    };

    expect(provider.name).toBe('openai');
    expect(provider.enabled).toBe(true);
    expect(provider.models).toContain('gpt-4');
  });
});
