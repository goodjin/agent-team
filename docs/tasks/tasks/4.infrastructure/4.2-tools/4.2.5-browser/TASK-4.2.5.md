# 4.2.5 浏览器工具

## 任务描述
实现浏览器操作工具，包括网页浏览、搜索、页面交互、截图、执行 JS。

## 输入
- 无

## 输出
- `src/tools/impl/browser.ts` - 浏览器工具实现

## 验收标准
1. 访问 URL 获取页面内容
2. 搜索引擎查询
3. 页面交互（点击、输入、表单提交）
4. 页面截图
5. 执行 JavaScript

## 依赖任务
- 4.2.1 ToolRegistry 工具注册表

## 估计工时
4h

## 优先级
中

## 任务内容
1. 创建 `src/tools/impl/browser.ts`
   - browse(params): 访问 URL
     - 参数：url
     - 返回：页面 HTML 内容

   - search(params): 搜索引擎查询
     - 参数：query、engine
     - 返回：搜索结果列表

   - click(params): 点击元素
     - 参数：selector
     - 返回：操作结果

   - input(params): 输入文本
     - 参数：selector、text
     - 返回：操作结果

   - submit(params): 提交表单
     - 参数：selector
     - 返回：提交结果

   - screenshot(params): 页面截图
     - 参数：url、selector（可选）
     - 返回：截图 base64

   - executeJS(params): 执行 JavaScript
     - 参数：code
     - 返回：. 工具注册执行结果

2

3. 浏览器管理
   - 创建浏览器实例
   - 管理浏览器生命周期
   - 处理浏览器错误
