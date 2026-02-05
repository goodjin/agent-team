/**
 * 个人AI协作增强系统使用示例
 * 
 * 展示如何使用个人AI协作系统处理高强度、高复杂度的开发任务
 */

import { ProjectAgent } from '../src/index.js';
import { PersonalAICollaborator } from '../src/personal/personal-ai-collaborator.js';
import { config } from 'dotenv';

// 加载环境变量
config();

async function demonstratePersonalAICollaboration() {
  console.log('🧠 个人AI协作增强系统演示\n');
  console.log('='.repeat(60));

  // 1. 创建基础Agent
  const agent = new ProjectAgent(
    {
      projectName: 'personal-ai-enhancement',
      projectPath: process.cwd(),
    },
    {
      llm: './llm.config.json'
    }
  );

  // 加载配置
  await agent.loadConfig();

  // 2. 创建个人AI协作增强器
  const collaborator = new PersonalAICollaborator(agent);

  console.log('✅ 个人AI协作系统初始化完成\n');

  // 演示1：超高复杂度任务 - 分布式系统设计
  await demonstrateUltraComplexTask(collaborator);

  // 演示2：高复杂度开发任务
  await demonstrateComplexDevelopmentTask(collaborator);

  // 演示3：批量任务处理
  await demonstrateBatchTaskProcessing(collaborator);

  // 演示4：认知负荷保护
  await demonstrateCognitiveProtection(collaborator);

  // 获取统计信息
  const stats = collaborator.getCollaborationStats();
  console.log('\n📊 协作统计:');
  console.log(JSON.stringify(stats, null, 2));
}

/**
 * 演示1：超高复杂度任务处理
 */
async function demonstrateUltraComplexTask(collaborator: PersonalAICollaborator) {
  console.log('\n🚀 演示1：超高复杂度任务 - 分布式微服务架构设计');
  console.log('-'.repeat(60));

  const ultraComplexTask = `
设计一个高并发、高可用的分布式微服务电商系统，要求：

1. 支持100万+并发用户，日均1000万订单处理
2. 99.99%可用性，全球多地域部署
3. 实时库存同步，防止超卖
4. 智能推荐系统，个性化商品推荐
5. 多种支付方式集成，包括加密货币
6. 实时物流跟踪，全球配送
7. 社交功能，用户评论和分享
8. AI客服系统，7x24小时服务
9. 数据分析和商业智能
10. 安全性和隐私保护，GDPR合规

技术约束：
- 预算限制：1000万美元
- 时间限制：6个月上线
- 团队规模：50人
- 必须开源部分组件

请提供完整的架构设计、技术选型、实施计划和风险评估。
  `;

  try {
    const result = await collaborator.processIntelligentTask(ultraComplexTask);
    
    if (result.success) {
      console.log('✅ 超高复杂度任务处理完成！');
      console.log(`📈 处理策略：${result.strategy}`);
      console.log(`📊 复杂度评分：${result.complexity.score}/10`);
      console.log(`🔍 复杂度因素：${result.complexity.factors.join(', ')}`);
      
      if (result.results) {
        console.log(`📋 子任务完成数：${result.results.length}`);
        const successful = result.results.filter(r => r.success).length;
        console.log(`✅ 成功：${successful}，❌ 失败：${result.results.length - successful}`);
      }
    } else {
      console.log('❌ 任务处理失败');
    }
  } catch (error) {
    console.error('任务处理错误：', error);
  }
}

/**
 * 演示2：高复杂度开发任务
 */
async function demonstrateComplexDevelopmentTask(collaborator: PersonalAICollaborator) {
  console.log('\n🔥 演示2：高复杂度开发任务 - 实现智能推荐引擎');
  console.log('-'.repeat(60));

  const complexTask = `
实现一个基于机器学习的智能商品推荐引擎：

功能要求：
1. 实时个性化推荐（延迟<100ms）
2. 多种推荐算法集成（协同过滤、内容推荐、深度学习）
3. A/B测试框架，支持算法效果对比
4. 冷启动问题解决，新用户快速适应
5. 多维度特征工程，用户行为、商品属性、上下文信息
6. 模型在线学习和实时更新
7. 推荐结果解释性，用户可理解推荐理由
8. 隐私保护，联邦学习实现

技术要求：
- Python + TensorFlow/PyTorch
- Redis缓存，Kafka消息队列
- 微服务架构，容器化部署
- 支持水平扩展，10万QPS
- 99.9%可用性

数据规模：
- 1000万用户，100万商品
- 日均1亿次推荐请求
- 用户行为数据10TB/天

请提供完整的技术方案、核心算法实现、系统架构和部署方案。
  `;

  try {
    const result = await collaborator.processIntelligentTask(complexTask);
    
    console.log('✅ 高复杂度开发任务处理完成！');
    console.log(`📈 处理策略：${result.strategy}`);
    console.log(`📊 复杂度评分：${result.complexity.score}/10`);
    
    if (result.subtasks) {
      console.log(`📋 分解为 ${result.subtasks.length} 个子任务`);
      result.subtasks.forEach((subtask, index) => {
        console.log(`  ${index + 1}. ${subtask.title}`);
      });
    }
  } catch (error) {
    console.error('任务处理错误：', error);
  }
}

/**
 * 演示3：批量任务处理
 */
async function demonstrateBatchTaskProcessing(collaborator: PersonalAICollaborator) {
  console.log('\n⚡ 演示3：批量任务处理 - 多个功能开发');
  console.log('-'.repeat(60));

  const batchTasks = [
    '实现用户注册和登录功能，支持邮箱、手机号、第三方OAuth登录',
    '设计商品搜索系统，支持全文检索、筛选排序、实时建议',
    '实现购物车功能，支持添加删除、数量修改、价格计算',
    '开发订单管理系统，包含订单状态流转、支付集成、物流跟踪',
    '设计用户评价系统，支持评分、评论、图片上传、情感分析'
  ];

  try {
    const results = await collaborator.processBatchTasks(batchTasks);
    
    console.log('✅ 批量任务处理完成！');
    console.log(`📊 共处理 ${results.length} 个任务`);
    
    results.forEach((result, index) => {
      const status = result.success ? '✅' : '❌';
      console.log(`${status} 任务${index + 1}：${result.strategy}`);
    });
  } catch (error) {
    console.error('批量处理错误：', error);
  }
}

/**
 * 演示4：认知负荷保护
 */
async function demonstrateCognitiveProtection(collaborator: PersonalAICollaborator) {
  console.log('\n🛡️  演示4：认知负荷保护机制');
  console.log('-'.repeat(60));

  // 模拟高认知负荷状态
  console.log('🔄 模拟连续高复杂度任务处理...');

  const highLoadTasks = [
    '设计分布式事务处理系统，解决微服务数据一致性问题',
    '实现高性能消息队列，支持百万级并发和消息持久化',
    '构建实时数据分析平台，秒级处理TB级数据',
    '设计智能负载均衡系统，动态调整资源分配',
    '实现分布式锁服务，保证高并发下的数据安全'
  ];

  for (let i = 0; i < highLoadTasks.length; i++) {
    console.log(`\n[${i + 1}/${highLoadTasks.length}] ${highLoadTasks[i].slice(0, 50)}...`);
    
    const result = await collaborator.processIntelligentTask(highLoadTasks[i]);
    
    if (result.strategy === 'simplified-protection') {
      console.log('🛡️  认知保护激活！切换到简化处理模式');
      console.log(`💡 建议：${result.advice}`);
    } else {
      console.log(`✅ 正常处理：${result.strategy}`);
    }
    
    // 显示当前认知状态
    const stats = collaborator.getCollaborationStats();
    console.log(`🧠 认知负荷：${(stats.cognitiveShield.currentLoad * 100).toFixed(1)}%`);
  }
}

/**
 * 高级功能演示
 */
async function demonstrateAdvancedFeatures() {
  console.log('\n🎯 高级功能演示');
  console.log('='.repeat(60));

  // 这里可以添加更多高级功能的演示
  // 例如：自定义思维模式组合、个人知识图谱更新、认知模式学习等
  
  console.log('🔮 个人知识图谱持续学习...');
  console.log('🎨 思维模式动态优化...');
  console.log('⚡ 认知负荷自适应调节...');
}

// 运行演示
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstratePersonalAICollaboration()
    .then(() => {
      console.log('\n🎉 个人AI协作增强系统演示完成！');
      console.log('\n💡 使用建议：');
      console.log('1. 根据个人情况调整 personal-knowledge-graph.json');
      console.log('2. 在高效时段处理超高复杂度任务');
      console.log('3. 利用认知保护机制避免过度疲劳');
      console.log('4. 定期查看协作统计，优化使用模式');
      process.exit(0);
    })
    .catch(error => {
      console.error('演示失败：', error);
      process.exit(1);
    });
}