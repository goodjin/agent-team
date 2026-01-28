/**
 * 简单测试 - 验证交互式 CLI 功能
 */

import { InteractiveCLI } from './src/cli/index.js';

async function testCLI() {
  const cli = new InteractiveCLI({
    showProgress: true,
    colorOutput: true,
  });

  try {
    cli.title('交互式 CLI 测试');

    // 1. 测试基本输入
    cli.blank();
    const name = await cli.question('请输入你的名字: ');
    cli.success(`你好, ${name}!`);

    // 2. 测试确认
    cli.blank();
    const likesCode = await cli.confirm('你喜欢编程吗？');
    if (likesCode) {
      cli.success('太棒了！');
    } else {
      cli.info('没关系，继续加油！');
    }

    // 3. 测试选择
    cli.blank();
    const colorIndex = await cli.choose('选择你喜欢的颜色', ['红色', '蓝色', '绿色']);
    const colors = ['红色', '蓝色', '绿色'];
    cli.success(`你选择了: ${colors[colorIndex]}`);

    // 4. 测试进度显示
    cli.blank();
    cli.section('进度测试');
    for (let i = 1; i <= 10; i++) {
      cli.showProgress(i, 10, `处理中 ${i}/10`);
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // 5. 测试代码显示
    cli.blank();
    cli.section('代码显示测试');
    cli.code(`function hello() {\n  console.log('Hello, World!');\n}`);

    // 6. 测试列表
    cli.blank();
    cli.section('列表测试');
    cli.log('\n编号列表:');
    cli.list(['项目 1', '项目 2', '项目 3'], true);
    cli.log('\n无编号列表:');
    cli.list(['项目 A', '项目 B', '项目 C'], false);

    // 7. 测试加载动画
    cli.blank();
    await cli.withLoading('加载中...', async () => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      return { data: '加载完成' };
    });

    cli.blank();
    cli.title('测试完成', 2);
    cli.success('所有测试通过！');

  } finally {
    cli.close();
  }
}

testCLI().catch(console.error);
