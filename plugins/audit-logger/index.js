export default {
  async activate(context) {
    const { logger } = context;
    logger.info('审计日志钩子已激活');
  },

  async onToolBefore(event, context) {
    const { toolName, params, taskId } = event;
    context.logger.info('工具调用开始', {
      audit: true,
      toolName,
      taskId,
      timestamp: new Date().toISOString(),
      paramKeys: Object.keys(params ?? {})
    });
  },

  async onToolAfter(event, context) {
    const { toolName, taskId, duration, success } = event;
    context.logger.info('工具调用完成', {
      audit: true,
      toolName,
      taskId,
      duration,
      success,
      timestamp: new Date().toISOString()
    });
  },

  async deactivate(context) {
    context.logger.info('审计日志钩子已停用');
  }
};
