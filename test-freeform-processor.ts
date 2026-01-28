/**
 * 自由输入功能测试
 */

import { FreeFormProcessor } from './src/cli/freeform-processor.js';

// 创建模拟的 CLI 和 Agent
class MockCLI {
  log(msg: string) {
    console.log(`[LOG] ${msg}`);
  }
  error(msg: string) {
    console.error(`[ERROR] ${msg}`);
  }
  success(msg: string) {
    console.log(`[SUCCESS] ${msg}`);
  }
  warn(msg: string) {
    console.warn(`[WARN] ${msg}`);
  }
  info(msg: string) {
    console.info(`[INFO] ${msg}`);
  }
  blank() {
    console.log('');
  }
  section(title: string) {
    console.log(`\n### ${title}`);
  }
  title(text: string) {
    console.log(`\n${'='.repeat(40)}\n  ${text}\n${'='.repeat(40)}`);
  }
  list(items: string[]) {
    items.forEach(item => console.log(`  • ${item}`));
  }
  code(content: string) {
    console.log('\n```\n' + content.substring(0, 100) + '\n...\n```');
  }

  async question(prompt: string): Promise<string> {
    console.log(`${prompt}`);
    return 'test input';
  }

  async confirm(prompt: string): Promise<boolean> {
    console.log(`${prompt} (auto: true)`);
    return true;
  }

  async withLoading<T>(msg: string, fn: () => Promise<T>): Promise<T> {
    console.log(`[LOADING] ${msg}`);
    return await fn();
  }

  options = {
    showProgress: true,
    showLLMThought: false,
  };
}

class MockAgent {
  async execute(params: any): Promise<any> {
    console.log(`[AGENT EXECUTE] type=${params.type}, title=${params.title}`);
    return {
      success: true,
      data: { result: 'test result' },
    };
  }

  async developFeature(params: any): Promise<any> {
    console.log(`[AGENT DEVELOP] title=${params.title}`);
    return {
      success: true,
      data: { code: 'test code' },
    };
  }

  getStats() {
    return {
      tasks: {
        total: 10,
        byStatus: {
          completed: 5,
          failed: 1,
          'in-progress': 2,
        },
      },
      tools: {
        'read-file': 3,
        'write-file': 2,
      },
    };
  }
}

async function testFreeFormProcessor() {
  console.log('\n🧪 测试自由输入处理器\n');
  console.log('='.repeat(60));

  const mockCLI = new MockCLI();
  const mockAgent = new MockAgent() as any;
  const processor = new FreeFormProcessor(mockAgent, mockCLI as any);

  // 测试 1: 功能开发识别
  console.log('\n\n📋 测试 1: 功能开发识别');
  console.log('-'.repeat(60));
  const test1 = '开发一个用户登录功能';
  console.log(`输入: ${test1}`);
  await processor.process(test1);

  // 测试 2: 代码审查识别
  console.log('\n\n📋 测试 2: 代码审查识别');
  console.log('-'.repeat(60));
  const test2 = '审查 src/auth 的代码';
  console.log(`输入: ${test2}`);
  await processor.process(test2);

  // 测试 3: 命令识别
  console.log('\n\n📋 测试 3: 命令识别');
  console.log('-'.repeat(60));
  const test3 = '/stats';
  console.log(`输入: ${test3}`);
  await processor.process(test3);

  // 测试 4: 帮助命令
  console.log('\n\n📋 测试 4: 帮助命令');
  console.log('-'.repeat(60));
  const test4 = '/help';
  console.log(`输入: ${test4}`);
  await processor.process(test4);

  // 测试 5: 退出命令
  console.log('\n\n📋 测试 5: 退出命令');
  console.log('-'.repeat(60));
  const test5 = 'exit';
  console.log(`输入: ${test5}`);
  const shouldContinue = await processor.process(test5);
  console.log(`\n继续执行: ${shouldContinue}`);

  console.log('\n\n' + '='.repeat(60));
  console.log('✅ 所有测试完成！');
}

testFreeFormProcessor().catch(console.error);
