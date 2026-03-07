/**
 * AgentOS Core Features Demo
 * 展示任务分解引擎和消息总线的使用方法
 */

import {
  TaskDecompositionEngine,
  createTaskDecompositionEngine,
  AgentMessageBus,
  createMessageBus,
  createMessageContent,
} from './src/core/index.js';

// ============================================
// 1. 任务分解引擎 (Task Decomposition Engine)
// ============================================

console.log('=== 任务分解引擎演示 ===\n');

// 创建引擎实例
const decompositionEngine = createTaskDecompositionEngine();

// 示例：分解一个复杂的开发任务
const complexTask = '开发一个完整的用户认证系统，包括注册、登录、权限管理和密码找回功能';

console.log('原始任务:', complexTask);
console.log('---\n');

// 执行分解
const result = decompositionEngine.decompose(complexTask, {
  taskType: 'development',
});

console.log('分解结果:');
console.log(`- 子任务数量: ${result.tasks.length}`);
console.log(`- 复杂度: ${result.metadata.complexity}`);
console.log(`- 预估总时长: ${Math.round((result.metadata.estimatedTotalDuration || 0) / 60000)} 分钟`);
console.log(`- 关键路径: ${result.metadata.criticalPath.length} 个任务`);
console.log(`- 可并行执行: ${result.metadata.parallelizable.length} 个任务\n`);

// 显示每个子任务
console.log('子任务详情:');
result.tasks.forEach((task, index) => {
  console.log(`\n${index + 1}. ${task.title}`);
  console.log(`   描述: ${task.description}`);
  console.log(`   类型: ${task.type}`);
  console.log(`   角色: ${task.assignedRole}`);
  console.log(`   优先级: ${task.priority}`);
  console.log(`   依赖: ${task.dependencies.length > 0 ? task.dependencies.join(', ') : '无'}`);
  console.log(`   预估时长: ${Math.round((task.estimatedDuration || 0) / 60000)} 分钟`);
});

// 输出 JSON 格式
console.log('\n\nJSON 输出格式:');
console.log(JSON.stringify(decompositionEngine.toJSON(result), null, 2));

// ============================================
// 2. Agent 消息总线 (Agent Message Bus)
// ============================================

console.log('\n\n=== Agent 消息总线演示 ===\n');

// 创建消息总线实例
const messageBus = createMessageBus({ enableLogging: true });

// 定义 Agent
const architect = { id: 'architect', name: '架构师 Agent', type: 'architect' };
const developer = { id: 'developer', name: '开发者 Agent', type: 'developer' };
const tester = { id: 'tester', name: '测试 Agent', type: 'tester' };
const pm = { id: 'pm', name: '项目经理 Agent', type: 'product-manager' };

// 注册 Agents
messageBus.registerAgent(architect);
messageBus.registerAgent(developer);
messageBus.registerAgent(tester);
messageBus.registerAgent(pm);

// 订阅主题
messageBus.subscribe(developer, 'task:created', (message) => {
  console.log(`[开发者] 收到新任务通知: ${message.content.payload.title}`);
});

messageBus.subscribe(tester, 'task:completed', (message) => {
  console.log(`[测试] 任务完成: ${message.content.payload.title}`);
});

messageBus.subscribe(pm, ['task:created', 'task:completed'], (message) => {
  console.log(`[PM] 收到任务事件: ${message.type}`);
});

// 1. 点对点消息
async function sendDirectMessage() {
  console.log('\n--- 发送点对点消息 ---');
  const content = createMessageContent('task:assign', {
    taskId: 'task-123',
    title: '实现用户模块',
    assignee: 'developer',
  });
  
  const result = await messageBus.sendDirectMessage(pm, developer, content, {
    priority: 'high',
  });
  
  console.log(`消息发送结果: ${result.success ? '成功' : '失败'}`);
  console.log(`消息ID: ${result.messageId}`);
}

// 2. 广播消息
async function sendBroadcast() {
  console.log('\n--- 发送广播消息 ---');
  const content = createMessageContent('announcement', {
    message: '所有 Agent 请注意，今天下午 3 点有代码审查会议',
  });
  
  const result = await messageBus.sendBroadcast(pm, content);
  
  console.log(`广播发送结果: ${result.success ? '成功' : '失败'}`);
  console.log(`接收者数量: ${result.deliveredTo.length}`);
}

// 3. 主题发布
async function publishTopic() {
  console.log('\n--- 发布主题消息 ---');
  const content = createMessageContent('task:created', {
    taskId: 'task-456',
    title: '编写单元测试',
    type: 'testing',
  });
  
  const result = await messageBus.publishTopic(pm, 'task:created', content);
  
  console.log(`主题发布结果: ${result.success ? '成功' : '失败'}`);
  console.log(`订阅者接收数量: ${result.deliveredTo.length}`);
}

// 执行消息演示
await sendDirectMessage();
await sendBroadcast();
await publishTopic();

// 显示统计信息
console.log('\n--- 消息统计 ---');
const stats = messageBus.getStats();
console.log(`总消息数: ${stats.totalMessages}`);
console.log(`点对点消息: ${stats.directMessages}`);
console.log(`广播消息: ${stats.broadcastMessages}`);
console.log(`主题消息: ${stats.topicMessages}`);
console.log(`成功投递: ${stats.delivered}`);
console.log(`投递失败: ${stats.failed}`);
console.log(`订阅者总数: ${stats.subscribers}`);

// 获取所有主题
console.log('\n已订阅主题:', messageBus.getTopics());

console.log('\n=== 演示完成 ===');
