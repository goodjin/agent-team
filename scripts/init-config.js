#!/usr/bin/env node
/**
 * Agent Team 配置初始化工具
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.agent-team');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.yaml');

async function initConfig() {
  console.log('🚀 Agent Team 配置初始化\n');
  
  // 创建配置目录
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  
  // 检查是否已存在配置
  try {
    await fs.access(CONFIG_FILE);
    console.log('⚠️  配置文件已存在:', CONFIG_FILE);
    const overwrite = await question('是否覆盖现有配置? (y/n): ');
    if (overwrite.toLowerCase() !== 'y' && overwrite.toLowerCase() !== '是') {
      console.log('已取消初始化');
      return;
    }
  } catch {
    // 文件不存在，继续
  }
  
  // 生成默认配置
  const defaultConfig = `# Agent Team 配置文件
# 位置: ${CONFIG_FILE}
# 生成时间: ${new Date().toISOString()}

# LLM 配置
llm:
  # 默认提供商
  defaultProvider: zhipu-primary
  
  # LLM 服务商配置
  providers:
    # Anthropic Claude (需要 ANTHROPIC_API_KEY 环境变量)
    anthropic-primary:
      name: Anthropic Claude
      provider: anthropic
      apiKey: \${ANTHROPIC_API_KEY}
      enabled: false
      models:
        claude-3-5-sonnet-20241022:
          model: claude-3-5-sonnet-20241022
          maxTokens: 4000
          temperature: 0.3
          description: Claude 3.5 Sonnet，最新版本
        claude-3-opus-20240229:
          model: claude-3-opus-20240229
          maxTokens: 4000
          temperature: 0.3
          description: Claude 3 Opus，最强大的模型
    
    # OpenAI GPT (需要 OPENAI_API_KEY 环境变量)
    openai-primary:
      name: OpenAI GPT-4
      provider: openai
      apiKey: \${OPENAI_API_KEY}
      baseURL: https://api.openai.com/v1
      enabled: false
      models:
        gpt-4-turbo:
          model: gpt-4-turbo-preview
          maxTokens: 4000
          temperature: 0.3
          description: GPT-4 Turbo
        gpt-4:
          model: gpt-4
          maxTokens: 4000
          temperature: 0.3
          description: GPT-4
        gpt-3.5-turbo:
          model: gpt-3.5-turbo
          maxTokens: 4000
          temperature: 0.3
          description: GPT-3.5 Turbo
    
    # 智谱 GLM (需要 ZHIPU_API_KEY 环境变量)
    zhipu-primary:
      name: 智谱 GLM
      provider: openai
      apiKey: \${ZHIPU_API_KEY}
      baseURL: https://open.bigmodel.cn/api/coding/paas/v4
      enabled: true
      models:
        glm-4:
          model: glm-4
          maxTokens: 8192
          temperature: 0.3
          description: GLM-4，最新版本
        glm-4-plus:
          model: glm-4-plus
          maxTokens: 128000
          temperature: 0.3
          description: GLM-4 Plus，更强能力
        glm-4-air:
          model: glm-4-air
          maxTokens: 128000
          temperature: 0.3
          description: GLM-4 Air，轻量高效
    
    # 通义千问 (需要 DASHSCOPE_API_KEY 环境变量)
    qwen-primary:
      name: 通义千问 Qwen
      provider: openai
      apiKey: \${DASHSCOPE_API_KEY}
      baseURL: https://dashscope.aliyuncs.com/compatible-mode/v1
      enabled: false
      models:
        qwen-max:
          model: qwen-max
          maxTokens: 6000
          temperature: 0.3
          description: 通义千问超大规模语言模型
        qwen-plus:
          model: qwen-plus
          maxTokens: 6000
          temperature: 0.3
          description: 通义千问增强版
    
    # DeepSeek (需要 DEEPSEEK_API_KEY 环境变量)
    deepseek-primary:
      name: DeepSeek
      provider: openai
      apiKey: \${DEEPSEEK_API_KEY}
      baseURL: https://api.deepseek.com
      enabled: false
      models:
        deepseek-chat:
          model: deepseek-chat
          maxTokens: 8192
          temperature: 0.3
          description: DeepSeek Chat，通用对话模型
        deepseek-coder:
          model: deepseek-coder
          maxTokens: 8192
          temperature: 0.3
          description: DeepSeek Coder，代码专用模型

  # 角色专属模型映射
  roleMapping:
    product-manager:
      providerName: zhipu-primary
      modelName: glm-4
    architect:
      providerName: zhipu-primary
      modelName: glm-4-plus
    developer:
      - providerName: zhipu-primary
        modelName: glm-4
      - providerName: anthropic-primary
        modelName: claude-3-5-sonnet-20241022
    tester:
      providerName: zhipu-primary
      modelName: glm-4-air
    doc-writer:
      providerName: zhipu-primary
      modelName: glm-4-air
  
  # 故障转移顺序
  fallbackOrder:
    - anthropic-primary
    - openai-primary
    - zhipu-primary
    - qwen-primary
    - deepseek-primary

# 项目配置
project:
  name: \${PROJECT_NAME:-my-project}
  path: \${PROJECT_PATH:-.}

# Agent 配置
agent:
  maxIterations: 10
  maxHistory: 50
  autoConfirm: false
  showThoughts: false

# 工具配置
tools:
  file:
    allowDelete: false
    allowOverwrite: true
  git:
    autoCommit: false
    confirmPush: true
  code:
    enabled: false

# 规则配置
rules:
  enabled:
    - coding-standards
    - security-rules
  disabled:
    - best-practices
    - project-rules

# 日志配置
logging:
  enabled: true
  level: info
  logDir: ~/.agent-team/logs
  logToFile: true
  logToConsole: true
  maxFileSize: 10485760
  maxFiles: 30
`;

  await fs.writeFile(CONFIG_FILE, defaultConfig, 'utf-8');
  
  console.log('✅ 配置文件已创建:', CONFIG_FILE);
  console.log('\n📝 下一步:');
  console.log('   1. 编辑配置文件: open', CONFIG_FILE);
  console.log('   2. 设置环境变量:');
  console.log('      export ZHIPU_API_KEY=your-api-key');
  console.log('      或');
  console.log('      export ANTHROPIC_API_KEY=your-api-key');
  console.log('      或');
  console.log('      export OPENAI_API_KEY=your-api-key');
  console.log('\n💡 提示: 可以将环境变量添加到 ~/.zshrc 或 ~/.bashrc');
  console.log('\n🚀 启动 Agent Team: npm run server');
}

function question(prompt) {
  return new Promise((resolve) => {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    readline.question(prompt, (answer) => {
      readline.close();
      resolve(answer);
    });
  });
}

initConfig().catch(console.error);
