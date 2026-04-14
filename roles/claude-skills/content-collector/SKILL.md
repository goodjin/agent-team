---
name: content-collector
description: 网址池资料采集工具。支持定时采集和主动触发，可采集新闻、文章、指南、参考资料等。触发场景：(1) 用户说"收集文章"、"采集资料"、"收集新闻"、"抓取内容"、"今日新闻" (2) 用户指定主题要求收集相关资料 (3) 用户提供网站要求采集内容 (4) 用户说"搜索并收集XX资料" (5) 用户管理网址池："添加网址"、"删除网址"、"列出网址" (6) 用户配置定时任务："设置定时采集"
---

# Content Collector - 网址池资料采集工具

智能采集新闻、文章、指南、参考资料，支持定时任务、去重、分类管理、自动归类。

## 核心能力

| 功能 | 说明 |
|------|------|
| 定时采集 | 每天 9:00 自动采集（需配置 launchd/cron） |
| 主动采集 | 触发时立即采集并输出结果 |
| 网址池管理 | 按分类管理网址，支持增删查 |
| 智能匹配 | 根据需求自动匹配相关分类的网址 |
| 自动归类 | 采集后自动判断内容类型并归类 |
| 智能去重 | URL 哈希去重，检查当月+上月 |
| HTML 报告 | 生成美观的资料简报页面 |

## 目录结构

```
~/.claude/skills/content-collector/
├── config/
│   ├── sources.json      # 网址池配置
│   └── email.json        # 邮件配置（可选）
├── logs/
│   ├── 2026-02.jsonl     # 按月存储采集记录
│   └── 2026-01.jsonl
└── reports/
    └── 2026-02-21.html   # HTML 报告输出
```

## 网址池分类

| 分类 | 说明 | 示例 |
|------|------|------|
| news | 新闻资讯 | 36氪、虎嗅、钛媒体 |
| article | 文章博客 | Hacker News、掘金、V2EX |
| guide | 指南教程 | MDN、阮一峰博客 |
| reference | 参考资料 | GitHub、Stack Overflow |
| life | 生活休闲 | 少数派 |

## 触发模式

### 1. 主动触发

用户说："收集新闻"、"今日新闻"、"采集资料"、"收集AI相关文章"等

**输出位置**：`~/mynote/collected/`，按内容类型分类存放

```
[当前项目]/
├── collected/
│   ├── news/           # 新闻类
│   │   └── 2026-02-21/
│   │       ├── articles/           # 每篇文章独立 HTML
│   │       │   ├── article-1.html
│   │       │   └── article-2.html
│   │       ├── index.md            # Markdown 汇总
│   │       └── index.html          # HTML 简报（标题带链接）
│   ├── article/        # 文章类
│   ├── guide/          # 指南类
│   ├── reference/      # 参考资料类
│   └── life/           # 生活类
```

**流程**：
1. 获取当前工作目录
2. **需求分析**：判断用户需求属于哪个分类（news/article/guide/reference/life）
3. 读取 `config/sources.json` 获取网址池
4. **匹配网址**：只选择需求对应分类下的网址进行采集
5. 逐个访问网站采集内容
6. 去重检查（对比当月+上月日志）
7. 根据内容类型确定分类目录，不存在则创建
8. **自动归类**：综合判断当前网址的内容类型，将网址添加到网址池相应分类
9. 生成 Markdown 文件 + HTML 汇总报告
10. 输出结果给用户

**用户指定网址时**：
- 如果用户明确提供了具体网址（如"采集 https://example.com 这篇文章"）
- 则跳过网址池匹配步骤，直接采集用户指定的网址
- 采集后同样进行自动归类

### 2. 定时触发

通过 launchd/cron 在每天 9:00 自动执行

**输出位置**：`~/news-reports/` 或用户配置的目录

**流程**：采集所有分类的网址，生成 HTML 报告并通过邮件发送（需配置）

## 配置管理

### 网址池配置 (config/sources.json)

```json
{
  "url_pool": {
    "news": {
      "name": "新闻资讯",
      "description": "新闻网站、资讯平台",
      "urls": [
        {"name": "36氪", "url": "https://36kr.com", "enabled": true}
      ]
    },
    "article": {
      "name": "文章博客",
      "description": "博客文章、专栏评论",
      "urls": [
        {"name": "Hacker News", "url": "https://news.ycombinator.com", "enabled": true}
      ]
    },
    "guide": {
      "name": "指南教程",
      "description": "教程、学习指南、入门资料",
      "urls": []
    },
    "reference": {
      "name": "参考资料",
      "description": "技术文档、API参考、官方文档",
      "urls": []
    },
    "life": {
      "name": "生活休闲",
      "description": "生活方式、兴趣爱好",
      "urls": []
    }
  }
}
```

**管理命令**：
- "列出所有网址" → 显示完整列表，按分类展示
- "添加网址 [分类] [名称] [URL]" → 追加到指定分类
- "删除网址 [名称]" → 从网址池移除
- "列出 [分类] 网址" → 显示指定分类的网址

**分类关键词映射**：
- news → 新闻、资讯、时事、今日新闻
- article → 文章、博客、帖子、讨论
- guide → 教程、指南、入门、学习
- reference → 文档、API、参考、资料
- life → 生活、休闲、爱好

### 邮件配置 (config/email.json)

```json
{
  "smtp_server": "smtp.gmail.com",
  "smtp_port": 587,
  "username": "your@email.com",
  "password": "app_password",
  "from": "your@email.com",
  "to": ["recipient@example.com"]
}
```

未配置时跳过邮件发送。

### 输出目录配置

**固定输出目录**：`~/mynote/collected/`

所有采集内容都输出到此目录，按内容类型自动分类。

## 采集流程

### Step 1: 加载配置

```bash
Read ~/.claude/skills/content-collector/config/sources.json
Read ~/.claude/skills/content-collector/config/email.json  # 如果存在
```

### Step 2: 需求分析与网址匹配

1. **解析用户需求**：
   - 分析用户输入的关键词
   - 映射到对应的分类（news/article/guide/reference/life）

2. **匹配网址池**：
   - 从网址池中选择对应分类下的所有 enabled=true 的网址
   - 如果用户明确提供了网址，跳过此步骤

**需求分类映射示例**：
- "收集今日新闻" → news
- "收集AI相关文章" → article
- "收集React教程" → guide
- "收集Python资料" → article
- "查看技术文档" → reference

### Step 3: 访问网站采集

**核心原则**：只使用 Playwright 技术，有头模式模拟真实用户访问。

#### 采集方式 1：Playwright MCP（推荐）

如果已配置 Playwright MCP，直接使用 MCP 工具：

```
mcp__playwright__navigate -> 打开页面
mcp__playwright__screenshot -> 截图查看页面
mcp__playwright__click -> 点击链接
mcp__playwright__evaluate -> 提取内容
```

**配置方法**：在 `~/.claude.json` 中添加 Playwright MCP 服务器。

**⚠️ 重要：必须关闭浏览器**
- 采集完成后必须调用 `mcp__playwright__close` 关闭浏览器
- 禁止残留浏览器进程
- 确保每次采集后浏览器进程数为 0

#### 方式 2：Playwright 有头模式（脚本自动化）

如果网站有防爬虫等措施（如36kr），采用有头模式脚本采集：

```bash
# 运行采集脚本（需要用户配合验证验证码）
node scripts/collect-36kr-headed.js
```

**自动化流程**：
1. 打开有头浏览器（可见窗口）
2. 访问目标网站
3. **检测验证码**：如果弹出滑动验证码，自动暂停并提示用户
4. 提示用户在浏览器中手动完成验证
5. 验证完成后自动继续采集
6. 提取文章列表和详细内容
7. 生成 HTML 简报

**验证码处理**：
- 脚本会自动检测 `#captcha_container` 等验证码元素
- 检测到后显示提示信息，用户完成验证后自动继续
- 超时时间：120秒

**⚠️ 重要：必须关闭浏览器**
- 脚本执行完毕后检查进程：`pgrep chromium` 应返回空
- 如有残留手动关闭：`pkill -f playwright`

**禁止使用其他采集方式**：
- 禁止使用 Web Reader MCP
- 禁止使用 Web Search 补充
- 只使用 Playwright 技术

#### 采集失败处理

如果采集失败：
1. 向用户说明具体哪个网址采集失败
2. 尝试调整脚本（增加等待时间、更换选择器）
3. 多次尝试仍失败则记录失败日志，继续采集其他网址

#### 验证码处理（重要）

部分网站（如36kr）会检测自动化访问并弹出滑动验证码。处理流程：

1. **检测验证码**：
   - 脚本会自动检测页面中是否出现验证码容器（`#captcha_container`、`.captcha-wrapper` 等）
   - 检测到后自动暂停采集

2. **提示用户**：
   - 在终端显示提示信息：
     ```
     ⚠️ 检测到验证码！
     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     请在浏览器中手动完成滑动验证
     验证完成后，浏览器会自动继续...
     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     ```

3. **等待验证**：
   - 浏览器保持打开状态，用户手动完成滑动验证
   - 脚本会自动检测验证码消失，然后继续采集
   - 超时时间：120秒

4. **超时处理**：
   - 如果用户未在 120 秒内完成验证，脚本会继续尝试采集
   - 可能需要多次手动验证

### 采集完整内容流程

**核心原则**：简报只展示摘要，点击链接后必须看到完整内容。

1. **获取文章列表**：
   - 访问新闻源首页（如虎嗅、钛媒体）
   - 解析文章标题和链接

2. **采集每篇文章完整内容**：
   - 逐个访问文章详情页 URL
   - 使用 Playwright 提取完整内容：
     ```
     mcp__playwright__navigate -> 文章URL
     mcp__playwright__evaluate -> 提取 article/main/content 标签的完整HTML
     ```

3. **保存完整内容到 HTML 文件**：
   - 标题：`<h1>` 或 `<title>`
   - 正文：`<article>`, `.content`, `.article-body`, `main` 的完整 HTML
   - 图片：保持 `<img>` 标签，src 为完整 URL
   - 保留原文链接，便于跳转

4. **简报中的链接指向本地 HTML**：
   - 简报中标题链接指向 `articles/xxx.html`（本地文件）
   - 用户点击后看到的是完整内容，而非摘要

### Step 4: 去重检查

```bash
# 读取当月和上月日志
Read ~/.claude/skills/content-collector/logs/2026-02.jsonl
Read ~/.claude/skills/content-collector/logs/2026-01.jsonl
```

- 计算 URL 的 MD5 哈希
- 已存在则跳过
- 新内容追加到当月日志

### Step 5: 确定输出目录

**所有采集输出都固定到 `~/mynote/collected/` 目录**：
1. 根据采集内容类型确定分类：
   - `news` → `~/mynote/collected/news/日期/`
   - `article` → `~/mynote/collected/article/日期/`
   - `guide` → `~/mynote/collected/guide/日期/`
   - `reference` → `~/mynote/collected/reference/日期/`
   - `life` → `~/mynote/collected/life/日期/`
2. 目录不存在则创建
3. 创建 `articles/` 子目录存放每篇文章的 HTML

**定时触发时**：
- 输出到配置的目录，默认 `~/news-reports/`

### Step 6: 自动归类网址

采集完成后，执行自动归类：

1. **分析采集的网址**：
   - 根据网址域名特征初步判断分类
   - 根据页面标题和内容关键词进一步确认

2. **判断规则**：
   - 包含 "news"、"新闻"、"资讯" → news
   - 包含技术博客、讨论社区 → article
   - 包含 "tutorial"、"教程"、"入门"、"guide" → guide
   - 包含 "docs"、"API"、"reference" → reference
   - 生活方式、兴趣爱好 → life

3. **更新网址池**：
   - 如果网址不在当前分类，将其添加到合适的分类
   - 如果网址已存在，更新其分类标签

### Step 7: 生成报告

**每篇文章生成独立 HTML 文件**：

**UI 设计规范要求**：
- 标题：28px 粗体，带阴影
- 元信息行：来源、分类、发布时间，字体 14px
- 正文：行高 2.0，段落间距 24px，首行缩进
- 返回链接：固定在顶部，hover 有动画效果
- 底部：原文链接按钮

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>文章标题 - 来源</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(180deg, #f5f7fa 0%, #e4e8ec 100%);
      min-height: 100vh;
      line-height: 2.0;
    }
    .container { max-width: 800px; margin: 0 auto; padding: 40px 20px; }
    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 20px;
      padding: 10px 20px;
      background: white;
      color: #667eea;
      text-decoration: none;
      border-radius: 25px;
      font-weight: 500;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      transition: all 0.3s ease;
    }
    .back-link:hover {
      transform: translateX(-4px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
    }
    header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #6B8DD6 100%);
      color: white;
      padding: 36px 32px;
      border-radius: 16px 16px 0 0;
      box-shadow: 0 4px 20px rgba(102, 126, 234, 0.3);
    }
    h1 {
      font-size: 28px;
      font-weight: 700;
      line-height: 1.5;
      margin-bottom: 16px;
      text-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .meta {
      opacity: 0.95;
      font-size: 14px;
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
    }
    .meta span {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .content {
      background: white;
      padding: 40px 32px;
      border-radius: 0 0 16px 16px;
      box-shadow: 0 2px 16px rgba(0,0,0,0.06);
    }
    .content p {
      margin-bottom: 24px;
      text-indent: 2em;
      color: #333;
      font-size: 16px;
    }
    .content a {
      color: #667eea;
      text-decoration: none;
      font-weight: 500;
    }
    .content a:hover {
      text-decoration: underline;
    }
    .original-link {
      display: inline-block;
      margin-top: 30px;
      padding: 14px 28px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-decoration: none;
      border-radius: 25px;
      font-weight: 500;
      transition: all 0.3s ease;
    }
    .original-link:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
    }
  </style>
</head>
<body>
  <div class="container">
    <a href="index.html" class="back-link">
      <span>←</span> 返回简报
    </a>
    <header>
      <h1>文章标题</h1>
      <div class="meta">
        <span>📰 来源: Hacker News</span>
        <span>🏷️ 分类: article</span>
        <span>🕐 采集时间: 2026-02-21 09:00</span>
      </div>
    </header>
    <div class="content">
      <p>文章正文内容...</p>
      <p>文章正文内容...</p>
      <a href="原文链接" target="_blank" class="original-link">🔗 阅读原文 →</a>
    </div>
  </div>
</body>
</html>
```

**Markdown 文件**（每篇文章）：

```markdown
# 文章标题

## 元信息
- **来源**: Hacker News
- **原文**: https://...
- **采集时间**: 2026-02-21 09:00
- **分类**: article

## 正文

[文章内容]
```

**HTML 汇总报告**（标题带链接）：

**UI 设计规范要求**：
- 整体布局：简洁大气，宽度 800px 居中
- 配色：渐变紫色 header (#667eea → #764ba2)，白色卡片背景，浅灰底色
- 标题：18px 粗体，颜色 #333，链接有 hover 效果
- 元信息：分类标签 + 来源标签并排，间距 8px
- 摘要：行高 1.8，颜色 #555，每段间距 20px
- 卡片：白色背景，圆角 12px，阴影效果
- 间距：文章间距 20px，上下内边距 20px

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>资料采集简报 - 2026年2月21日</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(180deg, #f0f2f5 0%, #e8eaed 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container { max-width: 800px; margin: 0 auto; }
    header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #6B8DD6 100%);
      color: white;
      padding: 40px 30px;
      text-align: center;
      border-radius: 16px 16px 0 0;
      box-shadow: 0 4px 20px rgba(102, 126, 234, 0.3);
    }
    header h1 {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 12px;
      text-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    header .subtitle {
      opacity: 0.95;
      font-size: 15px;
      font-weight: 500;
    }
    .section {
      background: white;
      padding: 24px;
      border-radius: 0 0 16px 16px;
      box-shadow: 0 2px 16px rgba(0,0,0,0.08);
    }
    .section h2 {
      color: #1a1a1a;
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 20px;
      padding-bottom: 14px;
      border-bottom: 2px solid #667eea;
    }
    .article {
      padding: 20px 0;
      border-bottom: 1px solid #f0f0f0;
    }
    .article:last-child { border-bottom: none; }
    .article:hover {
      background: linear-gradient(90deg, rgba(102,126,234,0.03) 0%, transparent 100%);
      margin: 0 -12px;
      padding: 20px 12px;
      border-radius: 8px;
    }
    .tags { margin-bottom: 10px; }
    .category {
      display: inline-block;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 500;
      margin-right: 8px;
    }
    .source {
      display: inline-block;
      background: #f5f5f5;
      color: #666;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 500;
    }
    .title {
      font-size: 18px;
      font-weight: 600;
      line-height: 1.6;
      margin: 10px 0 8px;
    }
    .title a {
      color: #1a1a1a;
      text-decoration: none;
      transition: all 0.2s ease;
    }
    .title a:hover {
      color: #667eea;
      text-decoration: none;
    }
    .title a::before {
      content: '';
      position: absolute;
      width: 100%;
      height: 100%;
      top: 0;
      left: 0;
    }
    .meta {
      font-size: 13px;
      color: #999;
      margin: 8px 0;
    }
    .summary {
      color: #555;
      line-height: 1.8;
      font-size: 15px;
      margin-top: 10px;
    }
    footer {
      text-align: center;
      padding: 24px;
      color: #888;
      font-size: 13px;
    }
    footer a { color: #667eea; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>📰 资料采集简报</h1>
      <p class="subtitle">2026年2月21日 · 星期三 · 共 12 篇</p>
    </header>

    <div class="section">
      <h2>🔥 热门文章</h2>
      <div class="article">
        <div class="tags">
          <span class="category">article</span>
          <span class="source">Hacker News</span>
        </div>
        <div class="title">
          <a href="articles/abc123.html" title="点击查看完整文章内容">文章标题</a>
        </div>
        <div class="meta">来源: 网站名 · 发布时间: 2026-02-21 10:30</div>
        <div class="summary">文章摘要内容...</div>
      </div>
      <!-- 更多文章... -->
    </div>

    <footer>
      <p>由 Content Collector 自动生成 · <a href="#">查看更多</a></p>
    </footer>
  </div>
</body>
</html>
```

### Step 8: 发送邮件（仅定时触发）

如果配置了邮件：
1. 使用 SMTP 发送
2. 主题：`资料采集简报 - 2026-02-21`
3. 正文：HTML 报告

### Step 9: 记录日志

将采集记录追加到当月日志：

```json
{"url_hash": "abc123", "url": "https://...", "title": "文章标题", "collected_at": "2026-02-21T09:00:00+08:00", "source": "Hacker News", "category": "article"}
```

## 预设网址池

### news（新闻资讯）

| 名称 | URL |
|------|-----|
| 36氪 | https://36kr.com |
| 虎嗅 | https://www.huxiu.com |
| 钛媒体 | https://www.tmtpost.com |
| 极客公园 | https://www.geekpark.net |

### article（文章博客）

| 名称 | URL |
|------|-----|
| Hacker News | https://news.ycombinator.com |
| Lobsters | https://lobste.rs |
| Reddit Programming | https://www.reddit.com/r/programming/ |
| 掘金 | https://juejin.cn |
| V2EX | https://www.v2ex.com |

### guide（指南教程）

| 名称 | URL |
|------|-----|
| MDN Web Docs | https://developer.mozilla.org |
| 阮一峰的网络日志 | https://www.ruanyifeng.com/blog/ |

### reference（参考资料）

| 名称 | URL |
|------|-----|
| GitHub Trending | https://github.com/trending |
| Stack Overflow | https://stackoverflow.com |

### life（生活休闲）

| 名称 | URL |
|------|-----|
| 少数派 | https://sspai.com |

## 定时任务设置

### macOS (launchd)

生成 plist 文件并加载：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.user.content-collector</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/claude</string>
        <string>--skill</string>
        <string>content-collector</string>
        <string>定时采集</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>9</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
</dict>
</plist>
```

**安装命令**：

```
用户: "设置定时采集"
→ 生成 plist 到 ~/Library/LaunchAgents/
→ 执行 launchctl load
```

### Linux (cron)

```
0 9 * * * /usr/local/bin/claude --skill content-collector "定时采集"
```

## 用户命令

| 命令 | 说明 |
|------|------|
| "收集新闻" | 采集新闻分类的网址 |
| "收集AI文章" | 采集文章分类的网址 |
| "采集 https://example.com" | 只采集指定网址（跳过网址池） |
| "列出所有网址" | 显示网址池列表，按分类展示 |
| "添加网址 [分类] [名称] [URL]" | 添加新网址到指定分类 |
| "删除网址 [名称]" | 从网址池删除 |
| "设置输出目录 [路径]" | 修改报告输出位置 |
| "设置定时采集" | 配置定时任务 |
| "配置邮件" | 设置邮件发送参数 |

## 输出示例

### 主动触发

```
## 资料采集完成

### 需求分析
- 需求类型: article（文章博客）
- 匹配分类: article

### 采集统计
- 新增: 12 篇
- 去重跳过: 3 篇
- 失败: 0 篇

### 来源分布
| 来源 | 数量 |
|------|------|
| Hacker News | 5 |
| 掘金 | 4 |
| V2EX | 3 |

### 自动归类
- 新发现分类: 2 个网址已归入 article

### 文件位置
```
~/mynote/collected/article/2026-02-21/
├── articles/
│   ├── article-1.html    # 每篇文章独立 HTML
│   ├── article-2.html
│   └── ...
├── index.md              # Markdown 版汇总
└── index.html            # HTML 汇总报告（标题带链接）
```
```

### 用户指定网址

```
## 资料采集完成

### 采集模式
- 用户指定网址：https://example.com/article
- 跳过网址池匹配

### 采集统计
- 新增: 1 篇
- 自动归类: article

### 文件位置
```
~/mynote/collected/article/2026-02-21/
├── articles/
│   └── article.html     # 文章独立 HTML 页面
└── index.html           # 简报（标题带链接）
```
```

### 定时触发

```
报告位置: ~/mynote/collected/news/2026-02-21/index.html
邮件状态: ✓ 已发送至 recipient@example.com
```

---

**Content Collector: 智能采集，自动归类** 📰
