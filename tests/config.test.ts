import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import yaml from 'js-yaml';
import {
  ConfigManager,
  ConfigCheckResult,
} from '../src/config/config-manager.js';
import {
  AgentConfigFile,
} from '../src/config/types.js';
import { expandPath } from '../src/config/config-loader.js';

vi.mock('node:fs/promises');
vi.mock('js-yaml');
vi.mock('../src/config/config-loader.js');
vi.mock('../src/config/config-validator.js');
vi.mock('../src/config/environment.js');
vi.mock('../src/config/defaults.js');

vi.mock('../src/config/config-loader.js', async () => {
  const actual = await vi.importActual('../src/config/config-loader.js');
  return {
    ...actual,
    expandPath: vi.fn((path: string) => path),
  };
});

describe('ConfigManager', () => {
  const mockConfig: AgentConfigFile = {
    version: '1.0.0',
    llm: {
      defaultProvider: 'openai',
      providers: {
        openai: {
          name: 'openai',
          provider: 'openai',
          apiKey: 'sk-test',
          enabled: true,
          models: {
            'gpt-4': {
              model: 'gpt-4',
              maxTokens: 4000,
              temperature: 0.7,
              description: 'GPT-4 model',
            },
          },
        },
      },
      roleMapping: {
        developer: { providerName: 'openai', modelName: 'gpt-4' },
      },
      fallbackOrder: ['openai'],
    },
    project: {
      name: 'Test Project',
      path: '/test',
      autoAnalyze: true,
    },
    agent: {
      maxIterations: 100,
      maxHistory: 50,
      autoConfirm: false,
      showThoughts: true,
    },
    tools: {
      file: {
        allowDelete: true,
        allowOverwrite: false,
      },
      git: {
        autoCommit: false,
        confirmPush: true,
      },
      code: {
        enabled: true,
      },
    },
    rules: {
      enabled: ['rule1', 'rule2'],
      disabled: [],
    },
    logging: {
      enabled: true,
      level: 'info',
      logToFile: true,
      logToConsole: true,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv('AGENT_LLM_PROVIDER', '');
    vi.stubEnv('OPENAI_API_KEY', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('constructor', () => {
    it('should use default config path when not provided', () => {
      const manager = new ConfigManager();
      expect(manager).toBeDefined();
    });

    it('should use custom config path when provided', () => {
      const manager = new ConfigManager('/custom/path/config.yaml');
      expect(manager).toBeDefined();
    });
  });

  describe('getConfigPath', () => {
    it('should return the config path', () => {
      const manager = new ConfigManager('/test/config.yaml');
      expect(manager.getConfigPath()).toBe('/test/config.yaml');
    });
  });

  describe('isLoaded', () => {
    it('should return false before loading', () => {
      const manager = new ConfigManager();
      expect(manager.isLoaded()).toBe(false);
    });
  });
});
