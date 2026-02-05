# 4.2.4 AI 生成工具

## 任务描述
实现 AI 生成工具，包括文生图、文生视频、图生图、视频编辑。

## 输入
- 无

## 输出
- `src/tools/impl/ai-generation.ts` - AI 生成工具实现

## 验收标准
1. 支持文生图（Text-to-Image）
2. 支持文生视频（Text-to-Video）
3. 支持图生图（Image-to-Image）
4. 支持视频编辑
5. 用户只需配置 API Key

## 依赖任务
- 4.2.1 ToolRegistry 工具注册表
- 4.3.1 配置管理器实现

## 估计工时
4h

## 优先级
中

## 任务内容
1. 创建 `src/tools/impl/ai-generation.ts`
   - textToImage(params): 文生图
     - 参数：prompt、size、style、n
     - 返回：图片 URL 或 base64

   - textToVideo(params): 文生视频
     - 参数：prompt、duration、resolution
     - 返回：视频 URL

   - imageToImage(params): 图生图
     - 参数：image、prompt、strength
     - 返回：生成图片

   - videoEdit(params): 视频编辑
     - 参数：video、operations（裁剪、拼接、字幕）
     - 返回：编辑后视频

2. 工具注册

3. 配置集成
   - 从配置管理器获取 API Key
   - 支持多个 AI 生成服务商
