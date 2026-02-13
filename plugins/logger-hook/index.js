export const hooks = {
  'tool:before': async (context) => {
    console.log(`[logger-hook] 工具调用: ${context.toolName}`);
  },
  'tool:after': async (context) => {
    console.log(`[logger-hook] 工具完成: ${context.toolName}, 耗时 ${context.duration}ms`);
  }
};
