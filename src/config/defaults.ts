/**
 * Project Agent 默认配置
 */

import type { AgentConfigFile } from './types.js';

/**
 * 获取默认配置
 */
export function getDefaultConfig(): AgentConfigFile {
  return {
    version: '1.0.0',
    llm: {
      defaultProvider: 'zhipu-primary',
      providers: {
        'anthropic-primary': {
          name: 'Anthropic 主服务',
          provider: 'anthropic',
          apiKey: '${ANTHROPIC_API_KEY}',
          enabled: false,
          models: {
            opus: {
              model: 'claude-3-opus-20240229',
              maxTokens: 4000,
              temperature: 0.7,
              description: '最强大的模型，适合复杂任务',
            },
            sonnet: {
              model: 'claude-3-sonnet-20240229',
              maxTokens: 4000,
              temperature: 0.7,
              description: '平衡性能和成本',
            },
            haiku: {
              model: 'claude-3-haiku-20240307',
              maxTokens: 4000,
              temperature: 0.7,
              description: '快速且经济，适合简单任务',
            },
          },
        },
        'anthropic-secondary': {
          name: 'Anthropic 备用服务',
          provider: 'anthropic',
          apiKey: '${ANTHROPIC_BACKUP_API_KEY}',
          enabled: false,
          models: {
            sonnet: {
              model: 'claude-3-sonnet-20240229',
              maxTokens: 4000,
              temperature: 0.7,
            },
          },
        },
        'openai-primary': {
          name: 'OpenAI 主服务',
          provider: 'openai',
          apiKey: '${OPENAI_API_KEY}',
          baseURL: 'https://api.openai.com/v1',
          enabled: false,
          models: {
            gpt4: {
              model: 'gpt-4-turbo-preview',
              maxTokens: 4000,
              temperature: 0.7,
              description: 'GPT-4 Turbo',
            },
            gpt35: {
              model: 'gpt-3.5-turbo',
              maxTokens: 4000,
              temperature: 0.7,
              description: 'GPT-3.5 Turbo',
            },
          },
        },
        'zhipu-primary': {
          name: '智谱 GLM',
          provider: 'openai',
          apiKey: '${ZHIPU_API_KEY}',
          baseURL: 'https://open.bigmodel.cn/api/coding/paas/v4',
          enabled: true,
          models: {
            'glm-4': {
              model: 'glm-4',
              maxTokens: 8192,
              temperature: 0.7,
              description: '智谱 GLM-4，最新版本',
            },
            'glm-4-plus': {
              model: 'glm-4-plus',
              maxTokens: 128000,
              temperature: 0.7,
              description: 'GLM-4 Plus，更强能力',
            },
            'glm-4-air': {
              model: 'glm-4-air',
              maxTokens: 128000,
              temperature: 0.7,
              description: 'GLM-4 Air，轻量高效',
            },
            'glm-4-flash': {
              model: 'glm-4-flash',
              maxTokens: 128000,
              temperature: 0.7,
              description: 'GLM-4 Flash，极速响应',
            },
          },
        },
        'qwen-primary': {
          name: '通义千问 Qwen',
          provider: 'openai',
          apiKey: '${DASHSCOPE_API_KEY}',
          baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
          enabled: false,
          models: {
            'qwen-max': {
              model: 'qwen-max',
              maxTokens: 6000,
              temperature: 0.7,
              description: '通义千问超大规模语言模型',
            },
            'qwen-plus': {
              model: 'qwen-plus',
              maxTokens: 6000,
              temperature: 0.7,
              description: '通义千问增强版',
            },
            'qwen-turbo': {
              model: 'qwen-turbo',
              maxTokens: 8000,
              temperature: 0.7,
              description: '通义千问高速版',
            },
            'qwen-long': {
              model: 'qwen-long',
              maxTokens: 10000,
              temperature: 0.7,
              description: '通义千问长文本版',
            },
          },
        },
        'deepseek-primary': {
          name: 'DeepSeek',
          provider: 'openai',
          apiKey: '${DEEPSEEK_API_KEY}',
          baseURL: 'https://api.deepseek.com',
          enabled: false,
          models: {
            'deepseek-chat': {
              model: 'deepseek-chat',
              maxTokens: 8192,
              temperature: 0.7,
              description: 'DeepSeek Chat，通用对话模型',
            },
            'deepseek-coder': {
              model: 'deepseek-coder',
              maxTokens: 8192,
              temperature: 0.7,
              description: 'DeepSeek Coder，代码专用模型',
            },
          },
        },
      },
      roleMapping: {
        'product-manager': {
          providerName: 'zhipu-primary',
          modelName: 'glm-4',
        },
        architect: {
          providerName: 'zhipu-primary',
          modelName: 'glm-4-plus',
        },
        developer: [
          {
            providerName: 'zhipu-primary',
            modelName: 'glm-4',
          },
          {
            providerName: 'zhipu-primary',
            modelName: 'glm-4-plus',
          },
        ],
        tester: {
          providerName: 'zhipu-primary',
          modelName: 'glm-4-flash',
        },
        'doc-writer': {
          providerName: 'zhipu-primary',
          modelName: 'glm-4-air',
        },
      },
      fallbackOrder: [
        'anthropic-primary',
        'anthropic-secondary',
        'openai-primary',
        'qwen-primary',
        'zhipu-primary',
        'deepseek-primary',
      ],
    },
    project: {
      name: 'default-project',
      path: '.',
      autoAnalyze: true,
    },
    agent: {
      maxIterations: 10,
      maxHistory: 50,
      autoConfirm: false,
      showThoughts: false,
    },
    tools: {
      file: {
        allowDelete: false,
        allowOverwrite: true,
      },
      git: {
        autoCommit: false,
        confirmPush: true,
      },
      code: {
        enabled: false,
      },
    },
    rules: {
      enabled: ['coding-standards', 'security-rules'],
      disabled: ['best-practices', 'project-rules'],
    },
    logging: {
      enabled: true,
      level: 'info',
      logDir: '~/.agent-team/logs',
      logToFile: true,
      logToConsole: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxFiles: 30, // 保留30天的日志
    },
  };
}

/**
 * 获取最小配置（仅包含必需字段）
 */
export function getMinimalConfig(): Partial<AgentConfigFile> {
  return {
    version: '1.0.0',
    llm: {
      defaultProvider: 'zhipu-primary',
      providers: {},
      roleMapping: {},
      fallbackOrder: [],
    },
    project: {
      name: 'my-project',
      path: '.',
      autoAnalyze: true,
    },
    agent: {
      maxIterations: 10,
      maxHistory: 50,
      autoConfirm: false,
      showThoughts: false,
    },
    tools: {
      file: {
        allowDelete: false,
        allowOverwrite: true,
      },
      git: {
        autoCommit: false,
        confirmPush: true,
      },
      code: {
        enabled: false,
      },
    },
    rules: {
      enabled: [],
      disabled: [],
    },
  };
}

/**
 * 默认配置文件路径
 */
export const DEFAULT_CONFIG_PATHS = [
  '~/.agent-team/config.yaml',
  './.agent-team.yaml',
  './agent.config.yaml',
];

/**
 * 旧配置文件路径（用于迁移）
 */
export const LEGACY_CONFIG_PATHS = [
  './llm.config.json',
  './prompts/config.json',
];

/**
 * 环境变量映射
 */
export const ENVIRONMENT_VARIABLE_MAPPING: { [key: string]: string } = {
  AGENT_LLM_PROVIDER: 'llm.defaultProvider',
  AGENT_PROJECT_NAME: 'project.name',
  AGENT_PROJECT_PATH: 'project.path',
  AGENT_AUTO_ANALYZE: 'project.autoAnalyze',
  AGENT_MAX_ITERATIONS: 'agent.maxIterations',
  AGENT_MAX_HISTORY: 'agent.maxHistory',
  AGENT_AUTO_CONFIRM: 'agent.autoConfirm',
  AGENT_SHOW_THOUGHTS: 'agent.showThoughts',
  AGENT_ALLOW_DELETE: 'tools.file.allowDelete',
  AGENT_ALLOW_OVERWRITE: 'tools.file.allowOverwrite',
  AGENT_GIT_AUTO_COMMIT: 'tools.git.autoConfirm',
  AGENT_CODE_ENABLED: 'tools.code.enabled',
};
