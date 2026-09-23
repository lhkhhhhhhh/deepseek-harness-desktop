# 贡献指南

感谢你想改进 DeepSeek Harness 桌面客户端。这个仓库只做一件事：**把 Harness 装进一个
正常的 Windows 应用窗口**。请尽量让改动保持在这个范围内。

## 开发环境

- Windows 10 / 11 (x64)
- Node.js ≥ 20
- 不需要 Rust、不需要 Visual Studio

```powershell
npm install
npm run fetch:runtime   # 约 200 MB，首次需要联网
npm run doctor          # 确认 Node / 运行时 / DSH_HOME 都能解析
npm start
```

## 提交前请自测

```powershell
npm run doctor     # 环境自检
npm run smoke      # 无窗口验证启动链路与认证握手
npm start          # 真实窗口验证：能启动、能对话、关窗后无残留进程
```

如果改动了打包相关文件，再跑一次：

```powershell
npm run dist       # 产物在 release/
```

请在 Pull Request 里说明你验证到了哪一步。

## 代码约定

- 纯 CommonJS，保持 `'use strict'`，不引入构建步骤（源码即产物）。
- 主进程只用 Electron 官方 API，不开 `nodeIntegration`、不用远程模块。
- 新增子进程时**必须**带 `windowsHide: true`，且不要给用户弹出控制台窗口。
- 不要修改、补丁或复制 Harness 本体的代码；桌面层只通过公开接口（CLI 参数、stdout
  中的启动 URL、HTTP 探测）与它交互。
- 注释解释「为什么」，不复述「做了什么」。
- 一个 Pull Request 一件事。

## 不要提交的内容

- `runtime/`、`node_modules/`、`release/`（已在 `.gitignore` 中忽略）
- `%APPDATA%\DeepSeek Harness\desktop.log` 里的个人路径
- 任何真实 API Key、令牌或会话数据

## 报告问题

请附上：

1. Windows 版本与 Node 版本（`node -v`）
2. `npm run doctor` 的输出
3. 复现步骤，以及 `Service → Open log file` 里的相关日志（**先删掉个人信息**）
4. 是安装包版本还是源码运行

## 许可证

提交代码即表示你同意以本仓库的 [MIT 许可证](LICENSE) 授权你的贡献。
