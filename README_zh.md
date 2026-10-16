<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="brand/final/variants/colabdesk-horizontal-white.svg">
  <img alt="ColabDesk Logo" src="brand/final/variants/colabdesk-horizontal-black.svg" width="380">
</picture>

### 非官方 Google Colab 桌面客户端

**把远程 GPU 运行时当本地机器用的桌面控制台**

[![Release](https://img.shields.io/badge/release-v0.2.0-0070f3.svg?style=flat-square)](https://github.com/feifeifeimoon/ColabDesk/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/feifeifeimoon/ColabDesk/ci.yml?branch=main&label=CI&style=flat-square)](https://github.com/feifeifeimoon/ColabDesk/actions/workflows/ci.yml)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-171717.svg?style=flat-square)](#下载与安装)
[![License](https://img.shields.io/badge/license-Apache--2.0-171717.svg?style=flat-square)](LICENSE)
[![Electron](https://img.shields.io/badge/electron-v44-47848F.svg?style=flat-square)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/react-v19-61DAFB.svg?style=flat-square)](https://react.dev/)

[English](README.md) • [简体中文](README_zh.md)

<br />

[![ColabDesk 工作台](screenshots/01-workbench-light.png)](screenshots/01-workbench-light.png)

</div>

---

## 为什么选择 ColabDesk？

Google Colab 提供了极高性价比的云端 GPU/TPU 算力，但网页版 Notebook 在应对严肃工程开发与模型训练时常有力不从心之处：浏览器标签易休眠掉线、文件批量传输繁琐、SSH 隧道配置频繁失效、算力点数消耗不透明。

**ColabDesk 致力于将 Google Colab 打造为本地开发机般顺滑的原生桌面体验：**

| 核心维度 | Colab 网页版 Notebook | 自建脚本 / 临时隧道 | **ColabDesk 桌面端** |
| :--- | :--- | :--- | :--- |
| **连接稳定性** | 网页标签休眠或关闭容易导致训练中断 | 脚本脆弱，依赖外部隧道工具 | **后台守护进程 + SSH 自动健康检查与断线重连** |
| **终端交互** | 网页内伪终端体验受限、快捷键冲突 | 裸终端无会话上下文与硬件感知 | **基于 xterm.js 的原生多标签终端，丰富主题调色板** |
| **文件管理** | 网页仅支持单文件慢速上传，无即时修改 | 依赖手动执行 `scp` / `rsync` 命令 | **现代化 SFTP 文件树 + 内置 CodeMirror 6 在线编辑器** |
| **算力额度 (CCU)** | 额度入口深藏，余额与消耗速度不透明 | 需手动轮询命令行接口 | **实时 CCU 余额、消耗速率指示与日/周/月历史趋势图** |
| **本地 IDE 联动** | 需繁琐的端口转发与手动密钥配置 | 需频繁手动改写 `~/.ssh/config` | **一键无缝配置，直接在 VS Code、Cursor 或 PyCharm 中打开** |

---

## 核心特性矩阵

| 特性板块 | 关键能力亮点 | 界面预览 (点击查看大图) |
| :--- | :--- | :--- |
| **⚡ GPU 会话生命周期管理**<br>*实例调度与硬件权限感知* | • **一键极速调度**：秒级创建、连接或安全释放 GPU/TPU 运行时。<br>• **算力资格感知矩阵**：自动探查账号可用硬件（T4、V100、A100、L4、H100 及 High-RAM）。<br>• **未纳管实例自动接管**：智能发现并一键接管已在云端运行的活跃会话。 | [![会话创建与调度](screenshots/04-new-session-light.png)](screenshots/04-new-session-light.png) |
| **💻 现代化多标签终端**<br>*极速响应的高性能终端控制台* | • **多标签页并发**：基于 `xterm.js` 驱动，多标签独立并行，零输入延迟。<br>• **精选主题调色板**：内置 Tokyo Night、Catppuccin、Dracula、Nord、Monokai、One Dark 等深浅主题。<br>• **外部终端直通**：一键穿透唤起系统原生 Windows Terminal 或 macOS Terminal。 | [![终端控制台与配色](screenshots/05-terminal-tokyo-night-light.png)](screenshots/05-terminal-tokyo-night-light.png) |
| **📁 远程 SFTP 与内置轻量编辑器**<br>*文件树、传输队列与免同步即时编辑* | • **可视化文件树**：拖拽批量上传/下载，内置并发流控队列与文件冲突保留策略。<br>• **内置 CodeMirror 6 编辑器**：无需本地同步，在桌面内即时查看与编辑远端脚本与配置。<br>• **严谨安全保护**：大文件日志智能两端截断防护，远端文件并发修改冲突告警。 | [![远程文件管理与编辑器](screenshots/08-file-tab-light.png)](screenshots/08-file-tab-light.png) |
| **📊 算力点数与用量趋势看板**<br>*实时 CCU 余额与消耗分析* | • **实时额度感知**：动态显示 Compute Units (CCU) 剩余余额与实时燃烧速率。<br>• **多维趋势分析**：按日、按周、按月统计算力历史消耗，支持交互式柱状图回溯。<br>• **阈值预警提醒**：避免因算力点数耗尽而导致漫长训练任务意外中断。 | [![算力用量趋势统计](screenshots/06-settings-usage-light.png)](screenshots/06-settings-usage-light.png) |
| **🔌 本地 IDE 一键联动桥接**<br>*原生融入 VS Code 与 Cursor 工作流* | • **自动化配置维护**：全自动注入并管理本地 `~/.ssh/config` 主机别名与认证密钥。<br>• **无缝 IDE 直连**：一键直连 **VS Code (Remote-SSH)**、**Cursor** 或 **PyCharm Remote**。<br>• **端口转发友好**：轻松配合 Jupyter、TensorBoard 及各种 WebUI 工具链。 | [![外部工具与 IDE 联动](screenshots/06-settings-external-light.png)](screenshots/06-settings-external-light.png) |

---

## 设计哲学与界面画廊

ColabDesk 遵循一套克制、严谨、安静的工程设计规范（详见 [`docs/DESIGN.md`](docs/DESIGN.md)）。软件外壳保持低侵略性，把视觉舞台完整留给代码逻辑与终端输出。

| 浅色模式 (工程精确) | 深色模式 (沉浸聚焦) |
| :---: | :---: |
| [![起始页浅色模式](screenshots/00-start-page-light.png)](screenshots/00-start-page-light.png) | [![起始页深色模式](screenshots/00-start-page-dark.png)](screenshots/00-start-page-dark.png) |

| 全屏专注模式 (纯粹终端体验) | 多样化终端配色引擎 |
| :---: | :---: |
| [![专注模式](screenshots/02-focus-dark.png)](screenshots/02-focus-dark.png) | [![终端主题对比](screenshots/05-terminal-catppuccin-mocha-light.png)](screenshots/05-terminal-catppuccin-mocha-light.png) |

---

## 快速上手

### 1. 下载并安装
从 [Releases 发布页面](https://github.com/feifeifeimoon/ColabDesk/releases) 获取适配你操作系统的最新安装程序。

### 2. 授权连接 Google 账号
1. 启动 ColabDesk，点击 **使用 Google 账号登录**。
2. 在默认系统浏览器中完成 OAuth 安全授权。
3. ColabDesk 在本地加密保存凭证，并实时探测当前账号拥有的硬件分配资格与可用算力单元。

### 3. 分配 GPU 并开始开发
1. 点击 **新建会话**，选择所需的算力加速卡（如 `NVIDIA A100`、`L4` 或 `T4`），并选择标准或高内存规格。
2. 数秒内自动建立终端交互式连接。
3. 可以在侧边栏直接拖拽数据集上传，或点击 **在 VS Code 中打开** 一键切入熟悉的本地编辑器环境。

---

## 下载与安装

ColabDesk 提供适用于 **Windows** 与 **macOS** 的预构建发行包：

| 平台支持 | 处理器架构 | 安装包格式 | 系统要求与说明 |
| :--- | :--- | :--- | :--- |
| **Windows** | x64 (64位) | `.exe` (NSIS 安装包 / 便携版) | 支持 Windows 10 / 11 |
| **macOS** | Apple Silicon (`arm64`) | `.dmg` | 原生适配 M1 / M2 / M3 / M4 系列芯片 |
| **macOS** | Intel (`x64`) | `.dmg` | 兼容 macOS 12+ (Monterey 或更高版本) |

> 应用内置基于 `electron-updater` 的自动更新能力，新版本发布时将温和提示并支持一键升级。

---

## 技术架构

ColabDesk 强调极佳的运行性能、严格的类型安全以及端到端的环境可测性：

- **桌面运行时与外壳**：[Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/) 构建管道
- **界面与状态管理**：[React 19](https://react.dev/) + [Zustand](https://github.com/pmndrs/zustand)（轻量领域分片）
- **终端模拟器核心**：[xterm.js](https://xtermjs.org/)，集成 Fit、Search、Unicode 11 与 WebLinks 插件
- **代码与文本预览器**：[CodeMirror 6](https://codemirror.net/)，支持语法着色与大文件智能截断防护
- **远端协议通信**：原生 [ssh2](https://github.com/mscdex/ssh2) 与流式 SFTP 管道，配备并发限流控制
- **工程质量与验证**：TypeScript 全面类型覆盖 + [Oxlint](https://oxc.rs/docs/guide/usage/linter.html) + [Vitest](https://vitest.dev/) + [Playwright](https://playwright.dev/)

---

## 本地开发与贡献指南

欢迎社区开发者参与贡献！在本地克隆并运行 ColabDesk 的步骤如下：

### 环境要求
- Node.js >= 20.0.0
- npm >= 10.0.0

### 开发工作流
```bash
# 1. 克隆代码仓库
git clone https://github.com/feifeifeimoon/ColabDesk.git
cd colabdesk-electron

# 2. 安装项目依赖
npm install

# 3. 启动本地开发服务 (支持 HMR 热更新)
npm run dev

# 4. 质量验证与自动化测试
npm run typecheck    # 静态类型检查
npm run lint         # Oxlint 规范验证
npm test             # Vitest 单元与静态渲染断言
npm run e2e          # Playwright 完整端到端测试
```

> **无需真实 Google 账号也能运行测试？**  
> ColabDesk 在 `src/main/e2e/` 中内置了一套轻量级的 SSH 与 WebSocket 模拟双工服务。执行 `npm run e2e` 时会自动在沙箱环境中拉起本地仿真后端，不产生任何真实网络请求或扣费。

---

## 常见问题 (FAQ)

<details>
<summary><b>使用 ColabDesk 需要订阅 Colab Pro / Pro+ 吗？</b></summary>
<br>
不需要。免费的普通 Google 账号开箱即用，可分配标准 CPU 以及 T4 GPU。如果你拥有 Colab Pro / Pro+ 订阅，ColabDesk 会自动解锁高级卡型选项（V100、A100、L4、TPU）以及高内存运行模式。
</details>

<details>
<summary><b>我的 Google 账号和 Token 安全吗？</b></summary>
<br>
绝对安全。ColabDesk 为纯客户端架构，代码 100% 开源。所有 OAuth Token 和机器连接信息仅保存在你本地机器的安全存储中，直接与 Google 官方端点安全通信，没有任何中间代理服务器或隐私埋点行为。
</details>

<details>
<summary><b>如果本地网络闪断或关机，远端正在跑的训练会中断吗？</b></summary>
<br>
不会。Google Colab 实例独立托管在云端。即使你的笔记本休眠、断网或软件关闭，后台进程依然在云端独立运行。重新打开 ColabDesk 后，应用会自动重新附着（Attach）到当前运行中的实例，恢复终端及状态视图。
</details>

---

## 免责声明 (Disclaimer)

**ColabDesk 是一个独立的开源项目，与 Google LLC 没有任何官方从属、赞助或背书关系。**  
*Google Colab* 及 *Google* 相关标识为 Google LLC 的注册商标。使用本客户端请自觉遵守 [Google Colab 服务条款](https://research.google.com/colaboratory/faq.html)。

---

## 开源协议

本项目采用 [Apache License 2.0](LICENSE) 开源协议。
