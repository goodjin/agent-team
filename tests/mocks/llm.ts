import { vi } from 'vitest';

export interface MockLLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export function createMockLLMService() {
  const chat = vi.fn();
  const chatStream = vi.fn();
  const healthCheck = vi.fn().mockResolvedValue(true);

  return {
    chat,
    chatStream,
    healthCheck,
    _setMockResponse: (response: MockLLMResponse) => {
      chat.mockResolvedValue(response);
    },
    _setMockStreamResponse: (responses: string[]) => {
      chatStream.mockImplementation(function* () {
        for (const content of responses) {
          yield { delta: content, done: false };
        }
        yield { delta: '', done: true };
      });
    },
  };
}

export function createMockLLMAdapter(provider: string = 'openai') {
  return {
    provider,
    chat: vi.fn().mockResolvedValue({
      content: 'mock response',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    }),
    chatStream: vi.fn(),
    getModelInfo: vi.fn().mockReturnValue({
      name: 'mock-model',
      provider,
      contextWindow: 4096,
      maxOutputTokens: 2048,
    }),
  };
}

export const mockChatCompletion = {
  id: 'chatcmpl-mock',
  object: 'chat.completion',
  created: Date.now(),
  model: 'gpt-4',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: 'This is a mock response',
      },
      finish_reason: 'stop',
    },
  ],
  usage: {
    prompt_tokens: 10,
    completion_tokens: 20,
    total_tokens: 30,
  },
};
