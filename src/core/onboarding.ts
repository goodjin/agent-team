import type { ProjectAgent } from './project-agent.js';
import type { ConfigValidationResult } from '../services/llm-config.js';
import type { RoleType } from '../types/index.js';
import type { ToolResult } from '../types/index.js';

interface OnboardingOptions {
  skipPrompts?: boolean;
  interactive?: boolean;
}

interface OnboardingResult {
  completed: boolean;
  configVerified: boolean;
  testTaskCompleted: boolean;
  suggestions: string[];
}

/**
 * 新手引导管理器
 * 引导用户完成首次配置和使用
 */
export class OnboardingManager {
  private agent: ProjectAgent;
  private options: OnboardingOptions;

  constructor(agent: ProjectAgent, options: OnboardingOptions = {}) {
    this.agent = agent;
    this.options = {
      interactive: true,
      skipPrompts: false,
      ...options,
    };
  }

  /**
   * 运行完整的新手引导
   */
  async run(): Promise<OnboardingResult> {
    console.log('\n' + '='.repeat(60));
    console.log('欢迎使用 Project Agent');
    console.log('='.repeat(60));

    // 步骤 1：检查配置
    const configResult = await this.checkConfiguration();
    if (!configResult) {
      return {
        completed: false,
        configVerified: false,
        testTaskCompleted: false,
        suggestions: ['请先配置有效的 API Key'],
      };
    }

    // 步骤 2：运行测试任务
    const testResult = await this.runTestTask();

    // 步骤 3：提供后续建议
    const suggestions = this.generateSuggestions(configResult, testResult);

    return {
      completed: true,
      configVerified: true,
      testTaskCompleted: testResult.success,
      suggestions,
    };
  }

  /**
   * 检查配置是否有效
   */
  private async checkConfiguration(): Promise<boolean> {
    const config = this.agent.getLLMConfig();
    const readyCount = config.providers?.filter(p => p.enabled !== false).length || 0;

    if (readyCount === 0) {
      console.log('\n未检测到可用的 LLM 服务商配置');
      console.log('\n请按以下步骤配置：');
      console.log('  1. 复制配置文件: cp .env.example .env');
      console.log('  2. 编辑 .env 文件，添加你的 API Key');
      console.log('  3. 编辑 llm.config.json，启用服务商');
      console.log('\n详细文档: docs/LLM_CONFIG_GUIDE.md');
      return false;
    }

    console.log(`\n已检测到 ${readyCount} 个可用的 LLM 服务商`);
    return true;
  }

  /**
   * 运行测试任务
   */
  private async runTestTask(): Promise<{ success: boolean; error?: string }> {
    if (this.options.skipPrompts) {
      return { success: true };
    }

    console.log('\n正在运行测试任务...');

    try {
      const result = await this.agent.execute({
        type: 'development' as const,
        title: '测试任务',
        description: '这是一个测试任务，用于验证配置是否正确',
        assignedRole: 'developer' as const,
        input: {
          code: '// 测试代码\nconsole.log("Hello, Project Agent!");',
        },
      });

      if (result.success) {
        console.log('测试任务执行成功！');
        return { success: true };
      } else {
        console.log(`测试任务失败: ${result.error}`);
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.log(`测试任务异常: ${error}`);
      return { success: false, error: String(error) };
    }
  }

  /**
   * 生成后续建议
   */
  private generateSuggestions(
    config: boolean,
    test: { success: boolean; error?: string }
  ): string[] {
    const suggestions: string[] = [];

    if (!test.success) {
      suggestions.push('测试任务失败，请检查 API Key 是否正确');
      suggestions.push('参考 docs/LLM_CONFIG_GUIDE.md 排查问题');
    }

    suggestions.push('查看示例代码: npm run example:basic');
    suggestions.push('开始你的第一个项目: agent.developFeature({...})');
    suggestions.push('查看文档: docs/QUICK_START.md');

    return suggestions;
  }
}

/**
 * 创建新手引导管理器
 */
export function createOnboardingManager(
  agent: ProjectAgent,
  options?: OnboardingOptions
): OnboardingManager {
  return new OnboardingManager(agent, options);
}
