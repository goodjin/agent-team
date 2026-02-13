export default {
  async activate(context) {
    const { manifest, logger } = context;
    logger.info(`角色插件已激活: ${manifest.role?.roleName ?? 'CodeReviewer'}`);
  },

  async deactivate(context) {
    context.logger.info('角色插件已停用');
  }
};
