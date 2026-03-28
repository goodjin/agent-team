import { createContainer } from './container.js';

async function main() {
  console.log('Starting Agent Team...');

  const container = await createContainer('./data');

  // 确保数据目录存在
  await container.fileStore.ensureDir('tasks');
  await container.fileStore.ensureDir('logs');
  await container.fileStore.ensureDir('artifacts');
  await container.fileStore.ensureDir('agents');

  console.log('Data directories initialized');

  // 启动 API Gateway
  container.apiGateway.start();

  console.log('Agent Team is ready!');
}

main().catch(console.error);

export { createContainer, type AgentExecutionFinishedPayload, type Container } from './container.js';
export { TaskService } from './application/task/task.service.js';
export { LogService } from './application/log/log.service.js';
export { ArtifactService } from './application/artifact/artifact.service.js';
export { AgentService } from './application/agent/agent.service.js';
export { APIGateway } from './application/api/gateway.js';
export * from './domain/task/index.js';
export * from './domain/agent/index.js';
export * from './domain/tool/index.js';
export * from './infrastructure/file-store/index.js';
export * from './infrastructure/event-bus/index.js';
export * from './infrastructure/logger/index.js';
export * from './infrastructure/scheduler/index.js';
export * from './infrastructure/websocket/index.js';
