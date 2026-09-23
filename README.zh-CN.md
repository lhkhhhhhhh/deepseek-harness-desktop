# 把 DeepSeek Harness 变成 Windows 桌面应用

[English](README.md) | 中文

**双击图标就能打开 DeepSeek Harness，不用浏览器、不用终端、不用敲命令。**

这个项目是 DeepSeek Harness 的**桌面外壳**：不修改、不裁剪、不重写 Harness 本体，
而是像 CLI 一样启动它（`dsh web`），再把 Harness 的界面装进一个正常的 Windows
应用窗口里 —— 有自己的图标、任务栏按钮和安装包。

> **非官方项目。** DeepSeek Harness 由 DeepSeek 开发，仓库在
> [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)，
> 与本项目没有隶属关系。

---

## 下载安装

到 [Releases](../../releases) 页面下载：

| 文件 | 说明 |
| --- | --- |
| `DeepSeek-Harness-Setup-<版本>.exe` | 安装包：自动创建桌面快捷方式、开始菜单项和卸载项。 |
| `DeepSeek-Harness-Portable-<版本>.exe` | 免安装版：双击即用，不写入系统。 |

安装是**当前用户级**的：不需要管理员权限，装在
`%LOCALAPPDATA%\Programs\DeepSeek Harness`。Harness 运行时会一并打包进去，
所以首次启动不需要联网。

**唯一前置要求：** [Node.js](https://nodejs.org) 20 或更高版本。Harness 本身是
Node 程序；如果检测不到 Node，应用会明确提示并给出下载地址。

## 它做了什么

- **双击即用。** 自动检测本地 Harness 服务，没运行就启动，就绪后再显示窗口。
- **真正的应用窗口。** 独立图标、标题栏、任务栏按钮
  （`AppUserModelId: ai.deepseek.harness.desktop`），记忆窗口大小和位置。
- **不弹黑框。** 服务进程隐藏启动，不会闪出 CMD / PowerShell 窗口。
- **Harness 功能完整保留。** 与 `dsh web` 同一个 profile、同一套插件、同样的能力。
- **数据不用迁移。** 凭据、API Key、设置、会话都在标准 `~/.dsh` 目录，与命令行共用。
- **永不抢端口。** 服务使用系统分配的空闲端口。
- **退出即清理。** 关窗口会结束服务进程，不留后台残留。

## 启动流程

```
双击图标
  └─ 启动画面（无控制台窗口）
      ├─ 1. 探测 Node.js            （PATH、Program Files、nvm、Volta、scoop……）
      ├─ 2. 定位 Harness 运行时      （安装包内置 resources/dsh-runtime，其次 npm 缓存）
      ├─ 3. 定位 DSH_HOME            （默认 ~/.dsh，与命令行共用）
      ├─ 4. 本地服务是否已在运行？
      │       ├─ 是 → 直接复用
      │       └─ 否 → 启动 `dsh web --port 0 --no-open`（隐藏、不打开浏览器）
      ├─ 5. 等待服务就绪              （解析启动 URL，轮询 HTTP 层）
      ├─ 6. 完成启动令牌交换          （获取浏览器会话 Cookie）
      └─ 7. 显示 Harness 主窗口
```

Harness 默认拒绝未认证请求：每个进程生成随机启动令牌，`GET /?token=...` 会换取
一个与主机绑定的签名会话 Cookie。客户端启动时自动完成这次交换，并把 Cookie 保存在
自己独立的 Electron 分区里 —— 所以你不需要反复登录，窗口地址也始终是干净的
`http://127.0.0.1/`。

## 从源码构建

```powershell
git clone https://github.com/<you>/dsh-desktop.git
cd dsh-desktop

npm install                 # electron + electron-builder
npm run fetch:runtime       # 拉取固定版本的 Harness 运行时（约 200 MB）
npm run doctor              # 环境自检

npm start                   # 运行
npm run dist                # 生成安装包和免安装版到 release/
```

`npm run dist` 会先执行 `tools/verify-assets.js`：图标或运行时缺失时立即报错，
不会产出装不起来的安装包。

运行时版本固定在 `package.json`：

```json
"dshRuntime": { "version": "0.1.5-rc.2" }
```

常用命令：

| 命令 | 作用 |
| --- | --- |
| `npm start` | 从源码运行桌面客户端。 |
| `npm run dev` | 同上，另带控制台日志并跳过首次工作目录选择。 |
| `npm run doctor` | 输出 Node、运行时、DSH_HOME、工作目录、端口的解析结果。 |
| `npm run smoke` | 不开窗口，直接验证服务启动与认证握手。 |
| `npm run fetch:runtime` | 安装固定版本的 Harness 运行时；`--from-npx` 可离线复用本地副本。 |
| `npm run dist` / `dist:portable` | 打包。 |

## 数据与配置

客户端没有自建配置体系，全部沿用 Harness 自己的位置：

| 内容 | 位置 |
| --- | --- |
| API Key / 凭据 | `~/.dsh/.credentials.yaml` |
| Harness 设置 | `~/.dsh/settings.yaml` |
| 会话历史 | `~/.dsh/sessions/` |
| 插件与 profile | `~/.dsh/profiles/` |
| 浏览器会话 Cookie | `%APPDATA%\DeepSeek Harness\Partitions\dsh-desktop\` |
| 桌面端设置（工作目录、窗口、主题） | `%APPDATA%\DeepSeek Harness\desktop.json` |
| 启动日志 | `%APPDATA%\DeepSeek Harness\desktop.log` |

因为 `DSH_HOME` 是共用的，命令行和桌面端看到的是同一份凭据、设置、插件和历史记录，
两边可以随时切换。

## 菜单

- **File** —— 复制 GUI 链接、选择工作目录、打开 Harness 数据目录、退出
- **View** —— 重新加载、缩放、全屏、外观（跟随系统 / 浅色 / 深色）
- **Service** —— 重启本地 Harness 服务、打开日志
- **Help** —— Harness 文档、关于

界面里的外部链接会用系统默认浏览器打开；Harness 界面本身始终留在应用窗口内。
重复启动只会聚焦已有窗口，不会起第二个服务。

## 环境变量

全部可选，仅用于排障。

| 变量 | 作用 |
| --- | --- |
| `DSH_DESKTOP_NODE` | 指定 `node.exe`。 |
| `DSH_DESKTOP_RUNTIME` | 指定 Harness 运行时目录（包含 `@deepseek-ai` 的那一层）。 |
| `DSH_HOME` | Harness 数据目录。 |
| `DSH_DESKTOP_SETTINGS_DIR` | 桌面端设置目录。 |
| `DSH_DESKTOP_GPU=1` | 启用硬件加速（默认关闭，避免部分显卡/远程桌面下白屏）。 |
| `--dsh-dev` | 开发模式：跳过工作目录选择，并把服务输出打到控制台。 |

## 常见问题

| 现象 | 处理 |
| --- | --- |
| 提示找不到 Node.js | 安装 [Node.js](https://nodejs.org) 20+；弹窗会列出所有尝试过的路径。 |
| 窗口白屏 | 用 `DSH_DESKTOP_GPU=1` 启动试试，或查看 `desktop.log`。 |
| 首次启动较慢 | 首次会初始化 profile 与插件树（15–30 秒），之后只需几秒。 |
| 其它问题 | 菜单 `Service → Open log file`，或运行 `npm run doctor`。 |

## 为什么用 Electron 而不是 Tauri

- Harness 界面本身就是 `dsh web` 提供的完整 Web 应用，外壳只需要「启动进程 + 承载窗口」。
  用 Tauri 会额外引入 Rust/MSVC 工具链，却省不掉 Node 服务。
- Harness 项目自己就把 `desktop` 这个 profile 名字保留给 Electron 外壳，方向一致。
- Electron 自带固定版本 Chromium，渲染效果不依赖用户装了什么浏览器。

## 许可证

本桌面客户端使用 [MIT](LICENSE)。

DeepSeek Harness 是 DeepSeek 的独立项目（同样是 MIT 许可）；它的软件包在构建时拉取，
本仓库不再分发。「DeepSeek」「DeepSeek Harness」是其权利人的商标，此处仅用于说明本
客户端运行的是什么。
