/**
 * 工作流程演示
 *
 * 本示例展示 Project Agent 工作流的完整功能：
 * 1. 工作流注册和执行
 * 2. 任务依赖管理
 * 3. 事件监听和进度追踪
 * 4. 统计信息查看
 * 5. developFeature 高级 API
 *
 * 运行方式：npx tsx examples/workflow-demo.ts [workflow|task|dependency]
 */
import { ProjectAgent } from '../src/index.js';
/**
 * ============================================================
 * 示例 1：完整工作流执行演示
 * ============================================================
 *
 * 展示如何：
 * 1. 初始化 Agent
 * 2. 注册工作流
 * 3. 执行工作流
 * 4. 监听事件
 * 5. 查看统计信息
 */
async function workflowDemo() {
    console.log('=== Project Agent 工作流程演示 ===\n');
    // ============================================================
    // 阶段 1: 初始化 Agent
    // ============================================================
    //
    // 创建 ProjectAgent 实例时，会自动初始化：
    // - ToolRegistry: 工具注册表，管理所有可用工具
    // - TaskManager: 任务管理器，管理任务生命周期
    // - EventSystem: 事件系统，支持事件监听和转发
    // - LLM Service: LLM 服务，用于调用 AI 模型
    //
    // 配置参数说明：
    // - projectName: 项目名称（用于标识和日志）
    // - projectPath: 项目路径（工具执行的根目录）
    // - llmConfig: LLM 配置（provider, apiKey, model）
    // - constraints: 项目约束（代码风格、测试覆盖率等）
    // - prompts: 提示词配置路径
    console.log('阶段 1: 初始化 Agent');
    console.log('─────────────────────────────');
    const agent = new ProjectAgent({
        projectName: 'demo-app',
        projectPath: '/path/to/project',
        // LLM 配置
        llmConfig: {
            provider: 'anthropic',
            apiKey: process.env.ANTHROPIC_API_KEY || 'demo-key',
            model: 'claude-3-opus-20240229',
        },
        // 项目约束
        constraints: {
            codeStyle: 'prettier',
            testCoverage: 80,
        },
    }, {
        // 提示词配置路径
        prompts: './prompts',
    });
    console.log('ProjectAgent 实例已创建');
    console.log('ToolRegistry 已初始化（10 个工具可用）');
    console.log('TaskManager 已初始化');
    console.log('事件监听器已设置');
    console.log('');
    // ============================================================
    // 设置事件监听器
    // ============================================================
    //
    // 事件监听器用于监控工作流执行过程：
    // - task:created: 任务创建时触发
    // - task:started: 任务开始执行时触发
    // - task:completed: 任务完成时触发
    // - task:failed: 任务失败时触发
    //
    // 事件数据包含：
    // - event: 事件类型
    // - timestamp: 事件发生时间
    // - data: 事件数据（根据事件类型不同而不同）
    agent.on('task:created', (data) => {
        console.log(`任务创建: ${data.data.task.title}`);
        console.log(`  ID: ${data.data.task.id}`);
        console.log(`  类型: ${data.data.task.type}`);
        console.log(`  角色: ${data.data.task.assignedRole}`);
        console.log(`  状态: ${data.data.task.status}`);
    });
    agent.on('task:started', (data) => {
        console.log(`任务开始: ${data.data.task.title}`);
    });
    agent.on('task:completed', (data) => {
        console.log(`任务完成: ${data.data.task.title}`);
        console.log(`  耗时: ${data.data.duration}ms`);
    });
    agent.on('task:failed', (data) => {
        console.log(`任务失败: ${data.data.task.title}`);
        console.log(`  错误: ${data.data.result?.error}`);
    });
    // ============================================================
    // 阶段 2: 注册工作流
    // ============================================================
    //
    // 工作流（Workflow）定义了一组有序的任务步骤：
    // - id: 工作流唯一标识
    // - name: 工作流名称（显示用）
    // - description: 工作流描述
    // - steps: 工作流步骤数组
    //
    // 步骤（Step）定义：
    // - id: 步骤唯一标识（用于依赖引用）
    // - name: 步骤名称（显示用）
    // - role: 执行角色
    // - taskType: 任务类型
    // - dependencies: 依赖的步骤 ID（可选）
    //
    // 依赖关系说明：
    // - 步骤可以依赖多个其他步骤
    // - 系统会自动按依赖顺序执行
    // - 无依赖的步骤可以并行执行
    console.log('\n阶段 2: 注册工作流');
    console.log('─────────────────────────────');
    agent.registerWorkflow({
        id: 'complete-feature-development',
        name: '完整功能开发流程',
        description: '从需求分析到文档更新的完整流程',
        steps: [
            {
                id: 'analyze',
                name: '需求分析',
                role: 'product-manager',
                taskType: 'requirement-analysis',
                // 无依赖，可以立即执行
            },
            {
                id: 'design',
                name: '架构设计',
                role: 'architect',
                taskType: 'architecture-design',
                dependencies: ['analyze'], // 依赖需求分析完成
            },
            {
                id: 'develop',
                name: '代码实现',
                role: 'developer',
                taskType: 'development',
                dependencies: ['design'], // 依赖架构设计完成
            },
            {
                id: 'test',
                name: '编写测试',
                role: 'tester',
                taskType: 'testing',
                dependencies: ['develop'], // 依赖代码实现完成
            },
            {
                id: 'document',
                name: '更新文档',
                role: 'doc-writer',
                taskType: 'documentation',
                dependencies: ['test'], // 依赖测试完成
            },
        ],
    });
    console.log('工作流已注册');
    console.log('  工作流 ID: complete-feature-development');
    console.log('  步骤数量: 5');
    console.log('  执行顺序: analyze → design → develop → test → document');
    console.log('');
    // ============================================================
    // 阶段 3: 执行工作流
    // ============================================================
    //
    // executeWorkflow() 执行流程：
    // 1. 解析步骤依赖关系，生成执行计划
    // 2. 按依赖顺序执行步骤：
    //    - 无依赖的步骤并行执行
    //    - 有依赖的步骤等待依赖完成后执行
    // 3. 收集所有步骤的执行结果
    // 4. 返回结果数组
    //
    // 返回值：
    // - ToolResult 数组，每个元素对应一个步骤的执行结果
    // - 结果顺序与步骤顺序一致
    console.log('阶段 3: 执行工作流');
    console.log('─────────────────────────────');
    try {
        console.log('开始执行工作流...\n');
        const results = await agent.executeWorkflow('complete-feature-development');
        console.log('\n工作流执行结果:');
        console.log('─────────────────────────────');
        results.forEach((result, index) => {
            const status = result.success ? '成功' : '失败';
            console.log(`步骤 ${index + 1}: ${status}`);
            if (!result.success && result.error) {
                console.log(`  错误: ${result.error}`);
            }
        });
    }
    catch (error) {
        console.error('工作流执行失败:', error);
    }
    // ============================================================
    // 阶段 4: 查看统计信息
    // ============================================================
    //
    // getStats() 返回当前会话的统计信息：
    // - tasks: 任务统计
    //   - total: 任务总数
    //   - byStatus: 按状态分类
    //   - byType: 按类型分类
    // - tools: 工具统计
    //   - totalTools: 工具总数
    //   - toolsByCategory: 按类别分类
    //   - dangerousTools: 危险工具列表
    console.log('\n阶段 4: 统计信息');
    console.log('─────────────────────────────');
    const stats = agent.getStats();
    console.log('任务统计:');
    console.log(`  总数: ${stats.tasks.total}`);
    console.log('  状态分布:');
    console.log(`    - 待执行: ${stats.tasks.byStatus.pending}`);
    console.log(`    - 进行中: ${stats.tasks.byStatus['in-progress']}`);
    console.log(`    - 已完成: ${stats.tasks.byStatus.completed}`);
    console.log(`    - 失败: ${stats.tasks.byStatus.failed}`);
    console.log(`    - 被阻塞: ${stats.tasks.byStatus.blocked}`);
    console.log('  类型分布:');
    Object.entries(stats.tasks.byType).forEach(([type, count]) => {
        console.log(`    - ${type}: ${count}`);
    });
    console.log('\n工具统计:');
    console.log(`  总数: ${stats.tools.totalTools}`);
    console.log('  分类:');
    Object.entries(stats.tools.toolsByCategory).forEach(([category, count]) => {
        console.log(`    - ${category}: ${count}`);
    });
    if (stats.tools.dangerousTools.length > 0) {
        console.log('\n危险工具:');
        stats.tools.dangerousTools.forEach((tool) => {
            console.log(`  - ${tool}`);
        });
    }
    // ============================================================
    // 阶段 5: developFeature 高级 API
    // ============================================================
    //
    // developFeature() 是高级 API，它内部会自动：
    // 1. 创建需求分析任务（product-manager）
    // 2. 执行需求分析
    // 3. 创建架构设计任务（architect）
    // 4. 执行架构设计（等待需求分析完成）
    // 5. 创建开发任务（developer）
    // 6. 执行开发（等待架构设计完成）
    // 7. 创建测试任务（tester）
    // 8. 执行测试（等待开发完成）
    // 9. 创建文档任务（doc-writer）
    // 10. 执行文档更新（等待测试完成）
    //
    // 等同于手动执行一个完整的工作流
    console.log('\n阶段 5: developFeature 高级 API');
    console.log('─────────────────────────────');
    console.log('\ndevelopFeature() 内部流程:');
    console.log('1. 创建需求分析任务 (product-manager)');
    console.log('2. 执行需求分析');
    console.log('3. 创建架构设计任务 (architect)');
    console.log('4. 执行架构设计（依赖：需求分析）');
    console.log('5. 创建开发任务 (developer)');
    console.log('6. 执行开发（依赖：架构设计）');
    console.log('7. 创建测试任务 (tester)');
    console.log('8. 执行测试（依赖：开发）');
    console.log('9. 创建文档任务 (doc-writer)');
    console.log('10. 执行文档更新（依赖：测试）');
    // 注意：这里不实际执行，因为需要真实的 API Key
    // const result = await agent.developFeature({
    //   title: '实现用户认证',
    //   description: 'JWT 认证系统',
    //   requirements: ['邮箱登录', 'Token 管理'],
    // });
    // ============================================================
    // 阶段 6: 清理资源
    // ============================================================
    //
    // shutdown() 方法：
    // 1. 取消所有进行中的任务
    // 2. 清理事件监听器
    // 3. 关闭 LLM 服务连接
    // 4. 释放系统资源
    console.log('\n阶段 6: 清理资源');
    console.log('─────────────────────────────');
    await agent.shutdown();
    console.log('Agent 已关闭');
    console.log('事件监听器已清理');
    console.log('资源已释放');
    console.log('\n=== 演示完成 ===');
}
/**
 * ============================================================
 * 示例 2：单个任务执行流程
 * ============================================================
 *
 * 详细说明单个任务从创建到完成的完整流程
 */
async function singleTaskDemo() {
    console.log('=== 单个任务执行流程演示 ===\n');
    const agent = new ProjectAgent({
        projectName: 'demo-app',
        projectPath: '/path/to/project',
        llmConfig: {
            provider: 'anthropic',
            apiKey: process.env.ANTHROPIC_API_KEY || 'demo-key',
            model: 'claude-3-opus-20240229',
        },
    });
    await agent.loadConfig();
    console.log('执行单个任务的流程:\n');
    // 详细步骤说明
    console.log('1. 用户调用 agent.execute()');
    console.log('   - 输入：任务配置对象');
    console.log('   - 输出：Promise<ToolResult>');
    console.log('   ↓');
    console.log('2. TaskManager.createTask()');
    console.log('   - 生成唯一 ID (UUID)');
    console.log('   - 初始化任务状态为 pending');
    console.log('   - 保存到任务列表');
    console.log('   - 触发 task:created 事件');
    console.log('   ↓');
    console.log('3. TaskManager.executeTask()');
    console.log('   - 检查依赖是否满足');
    console.log('   - 更新状态为 in-progress');
    console.log('   - 触发 task:started 事件');
    console.log('   ↓');
    console.log('4. buildContext()');
    console.log('   - 收集项目配置');
    console.log('   - 收集历史任务结果');
    console.log('   - 收集可用工具列表');
    console.log('   ↓');
    console.log('5. RoleFactory.createRole()');
    console.log('   - 根据任务类型创建对应角色');
    console.log('   - 加载角色提示词配置');
    console.log('   ↓');
    console.log('6. BaseRole.execute()');
    console.log('   - 调用角色执行方法');
    console.log('   ↓');
    console.log('7. prepareMessages()');
    console.log('   - 构建系统消息（角色提示词）');
    console.log('   - 构建用户消息（任务描述）');
    console.log('   ↓');
    console.log('8. buildSystemPrompt()');
    console.log('   - 加载角色系统提示词');
    console.log('   - 添加项目信息');
    console.log('   - 添加项目约束');
    console.log('   ↓');
    console.log('9. buildTaskPrompt()');
    console.log('   - 添加任务标题和描述');
    console.log('   - 添加需求/架构等上下文');
    console.log('   - 添加代码规范要求');
    console.log('   ↓');
    console.log('10. callLLM()');
    console.log('    - 调用 LLM API');
    console.log('    - 传入构建好的 messages');
    console.log('    - 设置 temperature, maxTokens');
    console.log('    ↓');
    console.log('11. LLMService.complete()');
    console.log('    - 发送 HTTP 请求到 API');
    console.log('    - 等待响应');
    console.log('    - 返回 LLM 响应');
    console.log('    ↓');
    console.log('12. processResponse()');
    console.log('    - 解析响应内容');
    console.log('    - 提取代码块');
    console.log('    - 提取测试代码');
    console.log('    - 提取说明文档');
    console.log('    ↓');
    console.log('13. validateOutput()');
    console.log('    - 验证必需字段是否存在');
    console.log('    - 验证数据格式正确性');
    console.log('    - 检查约束条件');
    console.log('    ↓');
    console.log('14. 设置任务结果');
    console.log('    - task.result = result');
    console.log('    - task.updatedAt = now');
    console.log('    ↓');
    console.log('15. updateTaskStatus()');
    console.log('    - 更新为 completed 或 failed');
    console.log('    - task.completedAt = now');
    console.log('    ↓');
    console.log('16. 触发事件');
    console.log('    - emit("task:completed") 或 emit("task:failed")');
    console.log('    - 事件监听器接收通知');
    console.log('    ↓');
    console.log('17. 执行子任务（如果有）');
    console.log('    ↓');
    console.log('18. 返回结果');
    console.log('    - 返回 ToolResult 对象');
    console.log('    - success: 是否成功');
    console.log('    - data: 执行数据');
    console.log('    - error: 错误信息');
    await agent.shutdown();
}
/**
 * ============================================================
 * 示例 3：任务依赖管理
 * ============================================================
 *
 * 展示工作流中的任务依赖管理：
 * - 定义依赖关系
 * - 依赖顺序执行
 * - 并行执行无依赖任务
 */
async function dependencyDemo() {
    console.log('=== 任务依赖管理演示 ===\n');
    const agent = new ProjectAgent({
        projectName: 'demo-app',
        projectPath: '/path/to/project',
        llmConfig: {
            provider: 'anthropic',
            apiKey: process.env.ANTHROPIC_API_KEY || 'demo-key',
            model: 'claude-3-opus-20240229',
        },
    });
    await agent.loadConfig();
    // ============================================================
    // 注册有依赖关系的工作流
    // ============================================================
    agent.registerWorkflow({
        id: 'dependency-demo',
        name: '依赖演示',
        steps: [
            {
                id: 'task1',
                name: '任务 1（无依赖）',
                role: 'product-manager',
                taskType: 'requirement-analysis',
            },
            {
                id: 'task2',
                name: '任务 2（依赖任务 1）',
                role: 'architect',
                taskType: 'architecture-design',
                dependencies: ['task1'],
            },
            {
                id: 'task3',
                name: '任务 3（依赖任务 1 和 2）',
                role: 'developer',
                taskType: 'development',
                dependencies: ['task1', 'task2'],
            },
            {
                id: 'task4',
                name: '任务 4（依赖任务 3）',
                role: 'tester',
                taskType: 'testing',
                dependencies: ['task3'],
            },
        ],
    });
    // 依赖结构图
    console.log('工作流依赖结构:');
    console.log('┌─────────┐');
    console.log('│  Task1  │  ← 无依赖，可以立即执行');
    console.log('└────┬────┘');
    console.log('     │');
    console.log('     ▼');
    console.log('┌─────────┐     ┌─────────┐');
    console.log('│  Task2  │◄────┤  Task3  │  ← Task3 等待 Task1 和 Task2');
    console.log('└────┬────┘     └────┬────┘');
    console.log('     │               │');
    console.log('     └───────┬───────┘');
    console.log('             ▼');
    console.log('       ┌─────────┐');
    console.log('       │  Task4  │  ← Task4 等待 Task3');
    console.log('       └─────────┘');
    console.log('\n执行顺序:');
    console.log('1. Task1 开始（无依赖）');
    console.log('2. Task2 等待 Task1 完成');
    console.log('3. Task3 等待 Task1 和 Task2 完成');
    console.log('4. Task4 等待 Task3 完成');
    console.log('5. Task1 完成 → Task2 可以开始');
    console.log('6. Task2 完成 → Task3 可以开始（Task1 已完成）');
    console.log('7. Task3 完成 → Task4 可以开始');
    console.log('8. Task4 完成 → 工作流完成');
    console.log('\n并行执行机会:');
    console.log('- Task1 和其他无依赖任务可以并行');
    console.log('- Task2 完成后，如果 Task1 已完成，Task3 可以开始');
    // 执行工作流
    console.log('\n执行工作流...\n');
    const results = await agent.executeWorkflow('dependency-demo');
    console.log('\n执行结果:');
    results.forEach((result, index) => {
        const status = result.success ? '成功' : '失败';
        console.log(`Task${index + 1}: ${status}`);
    });
    await agent.shutdown();
}
// ============================================================
// 运行演示
// ============================================================
//
// 命令行参数：
// - workflow: 完整工作流演示（默认）
// - task: 单个任务流程演示
// - dependency: 依赖管理演示
if (import.meta.url === `file://${process.argv[1]}`) {
    const demo = process.argv[2] || 'workflow';
    switch (demo) {
        case 'workflow':
            workflowDemo().catch(console.error);
            break;
        case 'task':
            singleTaskDemo().catch(console.error);
            break;
        case 'dependency':
            dependencyDemo().catch(console.error);
            break;
        default:
            console.log('用法: npx tsx examples/workflow-demo.ts [workflow|task|dependency]');
    }
}
//# sourceMappingURL=workflow-demo.js.map