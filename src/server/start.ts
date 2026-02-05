import { AgentTeamServer } from './index.js';

const server = new AgentTeamServer({
  port: parseInt(process.env.PORT || '3020', 10),
  host: process.env.HOST || 'localhost',
  projectPath: process.env.PROJECT_PATH || process.cwd(),
});

server.start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

process.on('SIGINT', async () => {
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await server.stop();
  process.exit(0);
});
