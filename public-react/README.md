# Agent Team Web UI（React + Vite）

仓库内**唯一**的 Web 界面源码。生产构建产物在 `dist/`，由根项目 `npm run server` / `npm start` 在 **3000** 端口通过 Express 托管。

## 常用命令

```bash
npm install
npm run dev       # http://localhost:5173，代理 /api、/ws → http://localhost:3000
npm run build     # 输出 dist/，供后端静态托管
```

根目录一键构建前端：`npm run build:web`（会安装本目录依赖并执行 `vite build`）。
