# ColabDesk 工程约定

## 设计系统

所有界面工作——布局、颜色、排版、间距、组件选择、交互行为——必须遵循 [`docs/DESIGN.md`](docs/DESIGN.md)。
令牌的唯一真源是 `src/renderer/src/assets/tokens.css`；UI 原语在 `src/renderer/src/components/ui/`。
**不要发明新的颜色值、字号或阴影层级**——文档里已有角色覆盖时就用它。文档沉默时，按本文档的目录约定就近解决并把新规则补回 DESIGN.md。

## 复用优先

写任何新逻辑之前（一个函数、组件、IPC 通道、状态存储或整条流程），先找已有的实现；能扩展就扩展，
不要并行造一份。检查的深度与事情的大小成比例：改一行不算，做一个新面板要查。

## 命名

禁止 `helpers`、`utils`、`common`、`misc` 这类名字——它们不携带信息且必然变成垃圾场。
按**领域概念**命名文件：`ssh-config.ts` 而不是 `ssh-utils.ts`，`transfer-progress` 而不是 `file-helpers`。
如果你觉得"该叫 helpers"，通常说明这个文件有两个职责、应该拆开。

## 目录

- `src/main/` —— 主进程。`colab/`（CLI 与领域状态）、`ssh/`（连接、身份、SFTP）、`ipc/`（通道注册与处理器）、
  `e2e/`（`COLABDESK_E2E_MOCK` 下的 CLI 桩与本地运行时）、`window.ts` / `runtime-paths.ts` 各自单一职责。
- `src/preload/` —— contextBridge 实现，类型来自 `@shared/api`。
- `src/renderer/src/` —— `app-shell/`（外壳）、`features/<domain>/`（页面）、`components/ui/`（原语）、
  `store/`（状态，按领域分 slice）、`lib/`（api、格式化、失败文案）、`assets/`（tokens.css、main.css）。
- `src/shared/` —— 主进程与渲染层共享的**契约**（`types.ts`、`ipc.ts`、`api.ts`）。
- `tests/e2e/` —— Playwright 端到端用例；夹具、沙箱与就绪等待在 `app-launch.ts`。
- `config/` —— 工具配置（vitest、electron-builder、playwright）。`docs/` —— 设计系统与参考文档。
- 测试与源码同目录（`*.test.ts`），不建 `__tests__`；端到端用例例外，统一放 `tests/e2e/`。

## 状态

渲染层的状态在 `src/renderer/src/store/`：**一个 store，按领域分 slice**。加状态优先加 slice；
**只有"与 `AppState` 耦合有害或无价值"时才建第二个 store，并且把理由写在文件头部**。

外壳（`App.tsx`）自己**不持有也不订阅任何状态**——每个部分订阅自己要用的 slice，否则一个小状态变更
就会重渲染整棵树。读状态一律走 selector，只取真正需要的字段：

```tsx
const tabs = useAppStore((state) => state.tabs);
```

- **不要在 selector 里造新对象或数组**（`filter` / `map` / `{ ... }`）。store 每次写入都会重跑所有
  selector，返回新引用 = 在无关写入上重渲染。多字段用 `useShallow`；跨领域的派生放
  `store/selectors.ts`，并让它返回基本类型或 store 里已有的引用。
- **高频事件不进 store**：终端字节走 IPC → 面板回调（不经 store）；传输进度要按会话节流/合并后再入，
  否则一次上传会以上千次/秒的节奏跑遍全应用所有 selector。
- React 之外（快捷键处理器、主进程推送的事件）用 `useAppStore.getState()` **现取**，
  不要用闭包捕获某一次渲染的状态。
- slice 之间的调用走 `get()`（`openTab` 会关掉设置层就是这样）；不要为了"解耦"再造一层事件总线。

## 注释

只写"为什么"，不写"是什么"。能一行就一行。不复述代码，不写"下面这行做了 X"。

## 验证

```bash
npm run typecheck      # tsc --noEmit（主进程 + 渲染层两个项目）
npm test               # vitest（主进程逻辑 + 渲染断言，见下）
npm run build          # electron-vite build
npm run e2e            # Playwright 端到端（会先构建；`SKIP_BUILD=1` 复用已有 out/）
npm run gallery        # 出图到 screenshots/ 给人看，不进 CI（`@gallery` 标签）
```

界面改动必须用 `npm run e2e` 验证，不要用桌面截图工具：这台机器的 VDI 合成器会让外部截图不稳定，
而 Playwright 走 CDP 截图与应用自己的 DOM。

**设计规则写成渲染断言，不靠看图。** `renderToStaticMarkup` 渲染真组件**不需要 DOM**，所以
「图标之间必须能互相区分」「空态必须说明下一步做什么」「停靠的面板必须 `hidden` + `inert`」这类
看得见但能用代码判断的规则，放 `*.test.tsx` 里用 `npm test` 跑——毫秒级、进 CI、不产生需要维护的图片。
`npm run gallery` 只负责"我就是想看一眼"，**没有图片基线**：图是评审时的证据，不是测试。
需要 DOM 的交互测试（点击、聚焦、循环回归）现在没有先例；真要写就先给 vitest 开 happy-dom。

E2E 不需要账号、会话或 Python：`COLABDESK_E2E_MOCK=1` 让主进程用 `src/main/e2e/` 的桩接管 CLI 与运行时
（本地 `ssh2.Server` + WebSocket 隧道，跑的是同一条生产代码路径），并把 HOME 挪进一次性沙箱
（`COLABDESK_E2E_HOME`，用完即删）。两条约定：

- **断言只写在用户看得见的地方**（DOM 文本、可见性、状态栏读数）。夹具里等的是界面就绪，不是内部状态；
  绕过界面直接读 store 的用例会在真的渲染崩了的时候照样通过。
- 桩对**未实现的 CLI 子命令直接失败**——这是故意的。以后新增 CLI 调用会在这里红，而不是静默通过。

## 跨平台

目标是 Windows + macOS（Linux 顺带）。平台相关行为必须走运行时判断：

- 路径用 `path.join`，不要假设 `/` 或 `\`；SSH 配置里反过来必须用正斜杠（见 `ssh-config.ts`）。
- Windows 不认 `/dev/null`（要 `NUL`）；没有 SIGHUP；`~` 展开靠 `os.homedir()`。
- 外部终端：Windows `cmd /c start`、macOS `osascript`、Linux 依次尝试若干终端模拟器。
- `windowsHide: true` 是所有子进程的默认（`colab/cli.ts` 与 `colab/login.ts` 已封装）。

## 远程与网络

到 `colab.research.google.com` 的连接会间歇性被重置（`SSLEOFError`）。规则：

- **只读命令重试一次**（额度、会话同步、SSH 握手），**有副作用的命令绝不重试**（创建、停止）。
- 失败必须给出可操作的话，不要只说"失败了"：HTTP 状态映射在 `ssh/connection.ts` 的
  `explainHandshakeFailure`，网络类文案在 `lib/failure.ts`。
