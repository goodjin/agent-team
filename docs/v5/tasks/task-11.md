# Task 11: 实现提示词管理系统

**优先级**: P1
**预计工时**: 8 小时
**依赖**: 任务 7
**状态**: 待执行

---

## 目标

1. 创建提示词目录结构
2. 实现 PromptLoader 类
3. 实现 Handlebars 模板支持
4. 创建内置提示词
5. 实现提示词 Web 编辑 API

---

## 输入

- 架构设计：`docs/v5/02-architecture.md`

---

## 输出

- `prompts/` 目录结构
- `src/prompts/loader.ts`
- `src/server/routes/prompts.ts`
- 内置提示词：`prompts/roles/*.md`

---

## 实现步骤

### 步骤 1: 创建提示词目录结构

```bash
mkdir -p prompts/roles
mkdir -p prompts/tasks
mkdir -p prompts/tools
```

### 步骤 2: 创建内置提示词

创建 `prompts/roles/master-agent.md`：

```markdown
---
role: master-agent
version: 1.0.0
---

# Master Agent System Prompt

You are a Master Agent responsible for analyzing complex tasks and coordinating sub-agents to complete them.

## Your Responsibilities

1. **Task Analysis**: Analyze the given task to understand its requirements and complexity
2. **Task Decomposition**: Break down complex tasks into smaller, manageable subtasks
3. **Resource Allocation**: Assign subtasks to appropriate sub-agents
4. **Progress Monitoring**: Track the progress of all sub-agents
5. **Result Aggregation**: Combine results from sub-agents into a coherent output

## Task Decomposition Guidelines

When breaking down a task:
- Create subtasks that are independent when possible
- Clearly define the goal and acceptance criteria for each subtask
- Identify dependencies between subtasks
- Ensure subtasks are granular enough to be completed by a single agent

## Output Format

When analyzing a task, respond with JSON in this format:

\`\`\`json
{
  "analysis": "Brief analysis of the task requirements",
  "subtasks": [
    {
      "id": "subtask-1",
      "title": "Descriptive title",
      "description": "Detailed description of what needs to be done",
      "dependencies": []
    }
  ]
}
\`\`\`

## Important Notes

- Always ensure subtasks have clear, measurable outcomes
- Consider the capabilities and limitations of sub-agents
- Prioritize subtasks based on dependencies and importance
```

创建 `prompts/roles/sub-agent.md`：

```markdown
---
role: sub-agent
version: 1.0.0
---

# Sub-Agent System Prompt

You are a Sub-Agent specialized in executing specific tasks assigned by the Master Agent.

## Your Capabilities

- Execute well-defined tasks independently
- Use available tools to accomplish your goals
- Report progress regularly
- Handle errors gracefully
- Ask for clarification when requirements are unclear

## Task Execution Guidelines

1. **Understand the Task**: Read the task description carefully
2. **Plan Your Approach**: Break down the task into steps
3. **Execute Systematically**: Work through your plan step by step
4. **Use Tools Effectively**: Leverage available tools to accomplish your goals
5. **Validate Results**: Ensure your output meets the requirements

## Tools Available

You have access to various tools. Use them appropriately:
- File system operations (read, write, edit files)
- Command execution
- Web searches and fetches
- Code analysis and generation

## Error Handling

If you encounter errors:
1. Try to understand the root cause
2. Attempt to resolve the issue
3. If unable to resolve, report the error clearly with context

## Output Format

Provide clear, structured output that includes:
- Summary of what was accomplished
- Key findings or results
- Any issues encountered and how they were resolved
```

创建 `prompts/roles/developer.md`：

```markdown
---
role: developer
version: 1.0.0
---

# Developer Agent System Prompt

You are a Developer Agent specialized in writing, reviewing, and refactoring code.

## Your Expertise

- Multiple programming languages (JavaScript/TypeScript, Python, Java, Go, etc.)
- Software architecture and design patterns
- Code quality and best practices
- Testing and debugging
- Documentation

## Development Guidelines

1. **Code Quality**: Write clean, maintainable, well-documented code
2. **Best Practices**: Follow language-specific conventions and best practices
3. **Testing**: Write tests for critical functionality
4. **Error Handling**: Implement proper error handling
5. **Performance**: Consider performance implications
6. **Security**: Be aware of common security vulnerabilities

## Code Style

- Use meaningful variable and function names
- Keep functions small and focused
- Add comments for complex logic
- Follow the existing codebase style

## When Writing Code

1. Understand the requirements thoroughly
2. Design before coding
3. Write clear, self-documenting code
4. Test your code
5. Refactor for clarity and efficiency

Variables: {{language}}, {{framework}}, {{codeStyle}}
```

### 步骤 3: 实现 PromptLoader 类

创建 `src/prompts/loader.ts`：

```typescript
import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import Handlebars from 'handlebars';

export interface PromptMetadata {
  role?: string;
  version?: string;
  [key: string]: any;
}

export interface LoadedPrompt {
  content: string;
  metadata: PromptMetadata;
  template?: HandlebarsTemplateDelegate;
}

export class PromptLoader {
  private cache: Map<string, LoadedPrompt> = new Map();
  private promptsDir: string;
  private hotReload: boolean;

  constructor(promptsDir: string = 'prompts', hotReload: boolean = true) {
    this.promptsDir = promptsDir;
    this.hotReload = hotReload;
  }

  /**
   * 加载提示词
   */
  async load(promptPath: string): Promise<LoadedPrompt> {
    // 检查缓存
    if (!this.hotReload && this.cache.has(promptPath)) {
      return this.cache.get(promptPath)!;
    }

    const fullPath = path.join(this.promptsDir, promptPath);

    // 读取文件
    const content = await fs.readFile(fullPath, 'utf-8');

    // 解析 Front Matter
    const { data: metadata, content: promptContent } = matter(content);

    // 编译 Handlebars 模板
    const template = Handlebars.compile(promptContent);

    const prompt: LoadedPrompt = {
      content: promptContent,
      metadata,
      template,
    };

    // 缓存
    this.cache.set(promptPath, prompt);

    return prompt;
  }

  /**
   * 加载角色提示词
   */
  async loadRole(role: string): Promise<LoadedPrompt> {
    return this.load(`roles/${role}.md`);
  }

  /**
   * 渲染提示词（替换变量）
   */
  async render(promptPath: string, variables: Record<string, any> = {}): Promise<string> {
    const prompt = await this.load(promptPath);

    if (!prompt.template) {
      return prompt.content;
    }

    return prompt.template(variables);
  }

  /**
   * 渲染角色提示词
   */
  async renderRole(role: string, variables: Record<string, any> = {}): Promise<string> {
    return this.render(`roles/${role}.md`, variables);
  }

  /**
   * 列出所有提示词
   */
  async list(category?: string): Promise<string[]> {
    const dir = category ? path.join(this.promptsDir, category) : this.promptsDir;

    const files: string[] = [];

    const readDir = async (currentDir: string, prefix: string = '') => {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          await readDir(
            path.join(currentDir, entry.name),
            path.join(prefix, entry.name)
          );
        } else if (entry.name.endsWith('.md')) {
          files.push(path.join(prefix, entry.name));
        }
      }
    };

    await readDir(dir);

    return files;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 重新加载提示词
   */
  async reload(promptPath: string): Promise<LoadedPrompt> {
    this.cache.delete(promptPath);
    return this.load(promptPath);
  }
}
```

### 步骤 4: 实现 Web 编辑 API

创建 `src/server/routes/prompts.ts`：

```typescript
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { PromptLoader } from '../../prompts/loader.js';

const router = express.Router();
const promptLoader = new PromptLoader();

/**
 * GET /api/prompts - 列出所有提示词
 */
router.get('/', async (req, res) => {
  try {
    const category = req.query.category as string | undefined;
    const prompts = await promptLoader.list(category);

    res.json({
      success: true,
      prompts,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/prompts/:path - 获取提示词内容
 */
router.get('/:path(*)', async (req, res) => {
  try {
    const promptPath = req.params.path;
    const prompt = await promptLoader.load(promptPath);

    res.json({
      success: true,
      prompt: {
        content: prompt.content,
        metadata: prompt.metadata,
      },
    });
  } catch (error: any) {
    res.status(404).json({
      success: false,
      error: 'Prompt not found',
    });
  }
});

/**
 * PUT /api/prompts/:path - 更新提示词内容
 */
router.put('/:path(*)', async (req, res) => {
  try {
    const promptPath = req.params.path;
    const { content, metadata } = req.body;

    // 构建完整内容（Front Matter + 内容）
    let fullContent = '';

    if (metadata && Object.keys(metadata).length > 0) {
      fullContent += '---\n';
      for (const [key, value] of Object.entries(metadata)) {
        fullContent += `${key}: ${value}\n`;
      }
      fullContent += '---\n\n';
    }

    fullContent += content;

    // 写入文件
    const fullPath = path.join('prompts', promptPath);
    await fs.writeFile(fullPath, fullContent, 'utf-8');

    // 重新加载
    await promptLoader.reload(promptPath);

    res.json({
      success: true,
      message: 'Prompt updated successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/prompts/:path - 创建新提示词
 */
router.post('/:path(*)', async (req, res) => {
  try {
    const promptPath = req.params.path;
    const { content, metadata } = req.body;

    // 检查文件是否已存在
    const fullPath = path.join('prompts', promptPath);
    try {
      await fs.access(fullPath);
      return res.status(409).json({
        success: false,
        error: 'Prompt already exists',
      });
    } catch {
      // 文件不存在，继续
    }

    // 构建完整内容
    let fullContent = '';

    if (metadata && Object.keys(metadata).length > 0) {
      fullContent += '---\n';
      for (const [key, value] of Object.entries(metadata)) {
        fullContent += `${key}: ${value}\n`;
      }
      fullContent += '---\n\n';
    }

    fullContent += content;

    // 确保目录存在
    await fs.mkdir(path.dirname(fullPath), { recursive: true });

    // 写入文件
    await fs.writeFile(fullPath, fullContent, 'utf-8');

    res.json({
      success: true,
      message: 'Prompt created successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * DELETE /api/prompts/:path - 删除提示词
 */
router.delete('/:path(*)', async (req, res) => {
  try {
    const promptPath = req.params.path;
    const fullPath = path.join('prompts', promptPath);

    await fs.unlink(fullPath);

    // 清除缓存
    promptLoader.clearCache();

    res.json({
      success: true,
      message: 'Prompt deleted successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
```

---

## 验收标准

- ✅ PromptLoader 可以加载 Markdown 文件
- ✅ 支持变量替换
- ✅ 支持提示词热加载
- ✅ Web API 可以编辑提示词
- ✅ 至少 3 个内置角色提示词

---

## 依赖安装

```bash
npm install gray-matter handlebars
npm install --save-dev @types/gray-matter @types/node
```

---

## 使用示例

```typescript
import { PromptLoader } from './prompts/loader.js';

// 创建 PromptLoader
const loader = new PromptLoader('prompts', true);

// 加载角色提示词
const masterPrompt = await loader.loadRole('master-agent');
console.log(masterPrompt.content);
console.log(masterPrompt.metadata);

// 渲染提示词（带变量）
const devPrompt = await loader.renderRole('developer', {
  language: 'TypeScript',
  framework: 'Express',
  codeStyle: 'Airbnb',
});

console.log(devPrompt);

// 列出所有提示词
const allPrompts = await loader.list();
console.log('Available prompts:', allPrompts);

// 列出角色提示词
const rolePrompts = await loader.list('roles');
console.log('Role prompts:', rolePrompts);
```

---

## 相关文档

- 任务 7: `docs/v5/tasks/task-07.md`
- 架构设计：`docs/v5/02-architecture.md`

---

**任务完成标志**：

- [ ] 提示词目录结构创建完成
- [ ] PromptLoader 类实现完成
- [ ] Handlebars 模板支持实现完成
- [ ] 内置提示词创建完成（至少 3 个角色）
- [ ] Web 编辑 API 实现完成
