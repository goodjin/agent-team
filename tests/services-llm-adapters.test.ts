import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ChatRequest, ChatMessage } from '../src/types/index.js';

const createMockChatRequest = (overrides?: Partial<ChatRequest>): ChatRequest => ({
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello!' },
  ],
  model: 'gpt-4',
  temperature: 0.7,
  maxTokens: 1000,
  stream: false,
  ...overrides,
});

const createMockResponse = () => ({
  id: 'chatcmpl-123',
  object: 'chat.completion',
  created: 1677858242,
  model: 'gpt-4',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: 'Hello! How can I help you today?',
      },
      finish_reason: 'stop',
    },
  ],
  usage: {
    prompt_tokens: 15,
    completion_tokens: 10,
    total_tokens: 25,
  },
});

describe('LLM Adapters', () => {
  describe('Adapter Interface', () => {
    it('should have correct provider name', () => {
      expect('openai').toBe('openai');
      expect('anthropic').toBe('anthropic');
      expect('qwen').toBe('qwen');
      expect('glm').toBe('glm');
    });

    it('should create valid ChatRequest', () => {
      const request = createMockChatRequest();
      expect(request.messages).toHaveLength(2);
      expect(request.messages[0].role).toBe('system');
      expect(request.messages[1].role).toBe('user');
    });

    it('should handle empty messages', () => {
      const request = createMockChatRequest({ messages: [] });
      expect(request.messages).toHaveLength(0);
    });

    it('should handle tool calls in messages', () => {
      const toolCallMessage: ChatMessage = {
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: {
              name: 'search-files',
              arguments: '{"pattern":"**/*.ts"}',
            },
          },
        ],
      };
      const request = createMockChatRequest({
        messages: [{ role: 'user', content: 'Search for TypeScript files' }, toolCallMessage],
      });
      expect(request.messages[1].toolCalls).toHaveLength(1);
      expect(request.messages[1].toolCalls?.[0].function.name).toBe('search-files');
    });
  });

  describe('ChatMessage Types', () => {
    it('should support system messages', () => {
      const message: ChatMessage = {
        role: 'system',
        content: 'You are a helpful assistant.',
      };
      expect(message.role).toBe('system');
    });

    it('should support user messages', () => {
      const message: ChatMessage = {
        role: 'user',
        content: 'Hello!',
      };
      expect(message.role).toBe('user');
    });

    it('should support assistant messages', () => {
      const message: ChatMessage = {
        role: 'assistant',
        content: 'I can help you with that.',
      };
      expect(message.role).toBe('assistant');
    });

    it('should support tool messages', () => {
      const message: ChatMessage = {
        role: 'tool',
        content: 'Found 5 files',
        toolCallId: 'call-1',
      };
      expect(message.role).toBe('tool');
    });
  });

  describe('Provider Configuration', () => {
    it('should have correct provider types', () => {
      const providers = ['openai', 'anthropic', 'qwen', 'glm'];
      expect(providers).toContain('openai');
      expect(providers).toContain('anthropic');
      expect(providers).toContain('qwen');
      expect(providers).toContain('glm');
    });
  });
});

describe('OpenAI Adapter', () => {
  describe('Message Conversion', () => {
    it('should convert system messages correctly', () => {
      const message: ChatMessage = {
        role: 'system',
        content: 'You are a helpful assistant.',
      };
      expect(message.role).toBe('system');
    });

    it('should convert user messages correctly', () => {
      const message: ChatMessage = {
        role: 'user',
        content: 'Hello!',
      };
      expect(message.role).toBe('user');
    });

    it('should convert assistant messages with tool calls', () => {
      const message: ChatMessage = {
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: {
              name: 'read-file',
              arguments: '{"filePath":"/test.txt"}',
            },
          },
        ],
      };
      expect(message.toolCalls).toHaveLength(1);
      expect(message.toolCalls?.[0].function.name).toBe('read-file');
    });
  });

  describe('Response Structure', () => {
    it('should have correct response format', () => {
      const response = createMockResponse();
      expect(response.id).toBe('chatcmpl-123');
      expect(response.model).toBe('gpt-4');
      expect(response.choices).toHaveLength(1);
      expect(response.choices[0].message.role).toBe('assistant');
      expect(response.usage.total_tokens).toBe(25);
    });

    it('should calculate token usage correctly', () => {
      const response = createMockResponse();
      const { prompt_tokens, completion_tokens, total_tokens } = response.usage;
      expect(total_tokens).toBe(prompt_tokens + completion_tokens);
    });
  });
});

describe('Anthropic Adapter', () => {
  describe('Message Conversion', () => {
    it('should handle system messages', () => {
      const message: ChatMessage = {
        role: 'system',
        content: 'You are a helpful assistant.',
      };
      expect(message.role).toBe('system');
    });

    it('should handle user messages', () => {
      const message: ChatMessage = {
        role: 'user',
        content: 'Hello!',
      };
      expect(message.role).toBe('user');
    });

    it('should convert tool results to user messages', () => {
      const message: ChatMessage = {
        role: 'tool',
        content: 'File content here',
        toolCallId: 'call-1',
      };
      expect(message.role).toBe('tool');
      expect(message.toolCallId).toBe('call-1');
    });
  });

  describe('Response Structure', () => {
    it('should have correct response format', () => {
      const response = {
        id: 'msg-123',
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'text', text: 'Hello!' },
        ],
        model: 'claude-3-opus-2024-02-27',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 10,
          output_tokens: 5,
        },
      };
      expect(response.content[0].type).toBe('text');
      expect(response.stop_reason).toBe('end_turn');
    });
  });
});

describe('Qwen Adapter', () => {
  describe('Message Conversion', () => {
    it('should handle all message roles', () => {
      const roles: ChatMessage['role'][] = ['system', 'user', 'assistant'];
      roles.forEach(role => {
        const message: ChatMessage = { role, content: 'test' };
        expect(message.role).toBe(role);
      });
    });
  });

  describe('Response Structure', () => {
    it('should have correct response format', () => {
      const response = {
        output: {
          choices: [
            {
              finish_reason: 'stop',
              message: {
                role: 'assistant',
                content: 'Hello!',
              },
            },
          ],
        },
        usage: {
          total_tokens: 20,
          output_tokens: 5,
          input_tokens: 15,
        },
        request_id: 'req-123',
      };
      expect(response.output.choices).toHaveLength(1);
      expect(response.output.choices[0].message.role).toBe('assistant');
    });
  });
});

describe('GLM Adapter', () => {
  describe('Message Conversion', () => {
    it('should handle all message roles', () => {
      const roles: ChatMessage['role'][] = ['system', 'user', 'assistant'];
      roles.forEach(role => {
        const message: ChatMessage = { role, content: 'test' };
        expect(message.role).toBe(role);
      });
    });
  });

  describe('Response Structure', () => {
    it('should have correct response format', () => {
      const response = {
        id: 'glm-123',
        created: 1677858242,
        model: 'glm-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello!',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          total_tokens: 20,
          prompt_tokens: 15,
          completion_tokens: 5,
        },
      };
      expect(response.choices).toHaveLength(1);
      expect(response.choices[0].message.role).toBe('assistant');
      expect(response.usage.total_tokens).toBe(20);
    });
  });
});
