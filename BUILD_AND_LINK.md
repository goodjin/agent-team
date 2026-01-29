# Agent Team 编译和链接指南

## 编译步骤

### 1. 安装依赖

```bash
npm install
```

### 2. 编译 TypeScript

```bash
npm run build
```

这会执行 `tsc`，将 `src/` 目录下的 TypeScript 文件编译到 `dist/` 目录。

### 3. 验证编译结果

```bash
# 检查编译后的文件是否存在
ls -la dist/cli/cli.js

# 检查文件是否有执行权限和正确的 shebang
head -1 dist/cli/cli.js
# 应该输出: #!/usr/bin/env node
```

## 链接命令的方式

### 方式1：npm link（推荐用于开发）

在项目根目录执行：

```bash
npm link
```

这会在全局创建一个符号链接，让你可以在任何地方使用 `agent-team` 命令。

**取消链接：**
```bash
npm unlink -g agent-team
```

### 方式2：全局安装（用于生产环境）

```bash
npm install -g .
```

或者如果已经发布到 npm：

```bash
npm install -g agent-team
```

### 方式3：本地安装 + npx（无需全局安装）

```bash
# 在项目目录下
npm install

# 使用 npx 运行
npx agent-team --help

# 或者添加到 package.json scripts
npm run agent-team
```

### 方式4：直接使用（开发时）

```bash
# 直接运行编译后的文件
node dist/cli/cli.js --help

# 或者使用 tsx（开发时，无需编译）
npx tsx src/cli/cli.ts --help
```

## 验证命令是否可用

```bash
# 检查命令是否在 PATH 中
which agent-team

# 测试命令
agent-team --help
agent-team version
```

## 常见问题

### 问题1：命令找不到

**原因：** 命令没有正确链接或不在 PATH 中

**解决方案：**
```bash
# 检查 npm 全局 bin 目录
npm config get prefix

# 确保该目录在 PATH 中
echo $PATH | grep $(npm config get prefix)

# 如果不在，添加到 PATH（添加到 ~/.zshrc 或 ~/.bashrc）
export PATH="$(npm config get prefix)/bin:$PATH"
```

### 问题2：权限错误

**原因：** 文件没有执行权限

**解决方案：**
```bash
chmod +x dist/cli/cli.js
```

### 问题3：模块找不到

**原因：** 依赖没有安装或编译有问题

**解决方案：**
```bash
# 重新安装依赖
rm -rf node_modules package-lock.json
npm install

# 重新编译
npm run build
```

## 开发工作流

### 开发模式（使用 tsx，无需编译）

```bash
# 直接运行源码
npx tsx src/cli/cli.ts chat

# 或者添加到 package.json
"scripts": {
  "dev:cli": "tsx src/cli/cli.ts"
}
```

### 生产模式（需要编译）

```bash
# 1. 编译
npm run build

# 2. 链接或安装
npm link

# 3. 使用
agent-team chat
```

## 一键设置脚本

创建 `setup.sh`：

```bash
#!/bin/bash
set -e

echo "📦 安装依赖..."
npm install

echo "🔨 编译项目..."
npm run build

echo "🔗 链接命令..."
npm link

echo "✅ 完成！现在可以使用 'agent-team' 命令了"
echo "   测试: agent-team --help"
```

使用：
```bash
chmod +x setup.sh
./setup.sh
```

## 检查清单

- [ ] 依赖已安装 (`npm install`)
- [ ] 项目已编译 (`npm run build`)
- [ ] `dist/cli/cli.js` 文件存在且有执行权限
- [ ] 文件开头有 `#!/usr/bin/env node` shebang
- [ ] 命令已链接 (`npm link`) 或全局安装
- [ ] `agent-team --help` 可以正常运行
