---
version: alpha
name: colabdesk-design-system
description: ColabDesk 的设计语言——把团队在 GitSquad 里确立的那套系统（ink 主色、浅色表面阶梯、堆叠阴影、Geist 字体、点+文字的状态）搬到一个桌面工作台上：界面外壳是浅色的工程表面，唯一的高饱和色是指示动作与链接的蓝，一切机器汇报的值走等宽字体，终端面板永久深色。
source: 移植自 D:\odyssey\GitSquad 的 DESIGN.md（该系统的原始定义），并针对桌面控制台做了增删

colors:
  # 品牌与强调
  primary: "#171717"          # 唯一的 ink 主色：肯定动作、导航激活指示
  on-primary: "#ffffff"
  link: "#0070f3"             # 行内链接，以及"信息 / 健康"语义
  link-deep: "#0761d1"
  link-bg-soft: "#d3e5ff"
  success: "{colors.link}"    # 刻意与 link 同值：这套系统里没有绿色
  # 表面阶梯：从后到前
  chrome: "#ffffff"           # 页面框架（顶栏、标签条、面板头）
  page: "#fafafa"             # 内容所在的平面（body）
  canvas: "#ffffff"           # 卡片、面板、对话框、输入框
  canvas-soft: "#f5f5f5"      # 井与内嵌区（表头行、空态、内联代码），绝不是卡片
  canvas-soft-2: "#efefef"    # 第二级内嵌（原始输出块、进度条底色）
  hairline: "#ebebeb"         # 所有 1px 分隔线与边框
  hairline-strong: "#a1a1a1"  # 悬停边框、焦点环、拖拽条
  # 文字
  ink: "#171717"
  body: "#4d4d4d"
  mute: "#888888"
  # 语义（每个都有 soft 变体：底色 + 可读文字色成对出现）
  warning: "#f5a623"
  warning-soft: "#ffefcf"
  warning-deep: "#ab570a"
  error: "#ee0000"
  error-soft: "#f7d4d6"
  violet: "#7928ca"
  violet-soft: "#d8ccf1"
  cyan-deep: "#29bc9b"
  cyan-soft: "#aaffec"
  # 终端有一根自己的轴：调色板在 terminal-themes.css，不在这份令牌表里

typography:
  font-sans:
    fontFamily: Geist, Inter, system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif
    note: "字重集合 400 / 500 / 600；600 是显示上限，永不用 700"
  font-mono:
    fontFamily: Geist Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, monospace
    note: "一切机器汇报的值：路径、时间、字节、百分比、退出码、原始输出"
  display: { fontSize: 26px, fontWeight: 600, letterSpacing: -0.96px }
  title: { fontSize: 19px, fontWeight: 600, letterSpacing: -0.6px }
  title-sm: { fontSize: 16px, fontWeight: 600, letterSpacing: -0.4px }
  copy: { fontSize: 14px, fontWeight: 400, letterSpacing: -0.28px }
  label: { fontSize: 13px, fontWeight: 400 }
  caption: { fontSize: 12px, fontWeight: 400 }
  micro: { fontSize: 11px, fontWeight: 400 }

rounded:
  xs: 4px      # 代码片段、键位提示、面包屑片段
  sm: 6px      # 所有应用内控件：按钮、输入框
  md: 8px      # callout、原始输出块、空态框
  lg: 12px     # 卡片、面板、表格容器、工作面板
  xl: 16px
  full: 9999px # 徽标、状态点

spacing:
  "1": 4px
  "2": 8px
  "3": 12px
  "4": 16px
  "5": 24px
  "6": 32px
  "7": 40px
  "8": 48px

elevation:
  "1": "inset 0 0 0 1px #00000014"
  "2": "Level 1 + 0 1px 1px #00000005, 0 2px 2px #0000000a"   # 默认卡片
  "3": "Level 1 + 0 2px 2px #0000000a, 0 8px 8px -8px #0000000a"  # 悬停/拖拽
  "4": "Level 1 + 0 2px 2px #0000000a, 0 8px 16px -4px #0000000a"  # 浮层
  "5": "Level 1 + 0 1px 1px #00000005, 0 8px 16px -4px #0000000a, 0 24px 32px -8px #0000000f"  # 对话框

components:
  button:
    variants: [default, primary, secondary, outline, ghost, destructive, link]
    sizes: [md 32px, sm 28px, lg 36px, icon 32px]
    rounded: "{rounded.sm}"
    note: "primary 一屏一个；ghost 用于密集行；destructive 只给不可逆动作"
  input: { height: 32px, rounded: "{rounded.sm}", backgroundColor: "{colors.canvas}", borderColor: "{colors.hairline}" }
  card: { backgroundColor: "{colors.canvas}", rounded: "{rounded.lg}", shadow: "Level 2", padding: "{spacing.5}" }
  panel: { note: "一节一张卡；行与行之间用 hairline 分隔（不是一行一张卡）" }
  panel-row: { padding: "{spacing.3} {spacing.5}", structure: "左：标签+说明；右：mono 值或动作" }
  badge: { shape: "pill", backgroundColor: "{colors.canvas-soft}", typography: "caption + mono" }
  badge-off: { note: "这个账号拿不到的东西（无权申请的加速器）：{colors.mute} + 删除线。删除线承担语义，颜色只是附和——和 status 同一条规矩" }
  status: { structure: "6px 圆点 + 文字标签", rule: "状态不得仅用颜色表达" }
  callout: { backgroundColor: "{colors.link-bg-soft}", textColor: "{colors.link-deep}", rounded: "{rounded.md}" }
  metric: { backgroundColor: "{colors.canvas-soft}", rounded: "{rounded.lg}", value: "{typography.display}" }
  empty: { padding: "{spacing.8} {spacing.5}", rounded: "{rounded.md}", textColor: "{colors.mute}" }
  start-page: { layout: "居中一列（760px）：品牌锁版 → 主张 → 下一步 → 动作 → 四条能力（auto-fit 网格）→ star 页脚", note: "正门与空态是同一屏；名字是锁版图形不是字，字号阶梯不变；能力条说用户要做的事，机制留给说明行" }
  pane: { note: "工作面（终端、文件）：chrome 头 + canvas 体", rounded: "{rounded.lg}", shadow: "Level 2" }
  progress: { height: 4px, fill: "{colors.ink}" }
  raw-output: { backgroundColor: "{colors.canvas-soft-2}", typography: "mono", note: "折叠但永远存在" }
  chart: { plot: "{colors.canvas-soft} 井", bar: "{colors.ink}", unmeasured: "基线虚线 {colors.hairline-strong}", scale: "{typography.caption} + {colors.mute}", note: "柱状，只表达量" }
  segmented: { note: "小集合互斥选择：一排 Button，激活项 primary、其余 outline；超时时长的字号与趋势粒度都用它" }
  settings-page: { nav: "260px 分节栏（与左栏同宽同色）+ 一次一节地显示正文", entry: "左栏底部一行", exit: "分节栏首行 + Esc", note: "是图层不是对话框：底下的终端保持挂载" }
---

## Overview

ColabDesk 是一个**把远程 GPU 运行时当本地机器用的桌面控制台**：左边一个交互终端，右边是运行时的文件系统，后面站着会话管理与计算单元额度。它的大部分屏幕时间都在替别人托管界面（xterm、文件列表），所以它自己的壳应该**后退、框住内容**，而不是抢戏。

这套语言直接移植自团队在 GitSquad 里确立的系统，因为那套系统解决的是同一类问题——**用克制的灰阶承载大量机器状态**——而它给出的答案是现成的：一个 ink 主色承担全部肯定动作；一套五级表面阶梯让卡片"坐在页面上"而不是"浮在页面上面"；一个毫不含糊的排版分工，让人一眼分辨"产品在说话"还是"机器在说话"。

移植时做的三处调整，都是桌面控制台特有的：

1. **Geist 常规体替代展示体。** 没有营销页，所以 `display-xl`/`display-lg` 都被去掉，最高一级是 26px 的 `{typography.display}`——它只出现在额度数值上。起始页（见「起始页」）后来带回了一点品牌材料，但**那不是字**：名字用的是标识套件里的锁版图形，字号阶梯一格没动。
2. **终端有自己的轴。** GitSquad 用 `.dark` 局部固定深色来渲染终端 mockup：终端模拟的是机器，不该跟随读者的主题。这里保留了这句话的结论，但换了做法——终端的颜色是**用户选的调色板**（`terminal-themes.css` 的七套，`titanium` 与当年那四个令牌逐字相同），而不是"钉死的深色"。它仍然不从 `data-theme` 继承：`ls`、`git`、`htop` 在 16 个 ANSI 槽位里填什么色是远端决定的，让终端跟着正片翻转就等于要求两套极性各自都可读。详见「终端配色」。
3. **状态语义按本产品重排。** `{colors.success}` 仍是链接蓝（"已连接"），`{colors.warning}` 是"运行中 / 连接中"，`{colors.error}` 只给失败与不可逆动作。

## 唯一真源

| 关注点 | 权威位置 |
| --- | --- |
| 设计令牌（颜色、字体、间距、圆角、阴影） | `src/renderer/src/assets/tokens.css` |
| 终端调色板（七套 × 21 个通道） | `src/renderer/src/assets/terminal-themes.css`；契约与钳制在 `lib/terminal-appearance.ts`，读取在 `lib/terminal-theme.ts` |
| 基础样式与组件类 | `src/renderer/src/assets/main.css` |
| UI 原语 | `src/renderer/src/components/ui/`（`Button` / `Card`·`Panel`·`PanelRow` / `Badge`·`Status` / `Field` / `Callout`·`EmptyState` / `Menu` / `PanelDivider` / `ProgressBar` / `RawOutput` / `icons`） |
| 应用外壳 | `src/renderer/src/app-shell/AppShell.tsx` |
| 起始页与品牌锁版 | `src/renderer/src/features/workspace/StartPage.tsx`、`src/renderer/src/app-shell/BrandLockup.tsx` |
| 设置页 | `src/renderer/src/app-shell/SettingsPage.tsx` |
| 主题偏好 | `src/renderer/src/lib/theme.ts` |
| 功能页面 | `src/renderer/src/features/*` |
| 渲染层目视（给人看） | `npm run gallery`：在 mock 后端上跑**真实应用**并出图到 `screenshots/`。**没有图片基线**——图是评审时的证据，不是测试 |
| 设计规则的回归网 | 渲染断言：真组件 + `renderToStaticMarkup`（不需要 DOM，走 `npm test`）。例：`components/ui/icons.test.tsx`（图标之间必须能互相区分）、`features/workspace/Workbench.test.tsx`（停靠面板必须 `hidden` + `inert`） |

规则：**组件代码里不出现十六进制颜色。** 需要新令牌时先加进 `tokens.css`（浅色与深色两个块都要有），再引用；角色说明补进本文件。**先找原语，再写自定义 CSS。** 唯一的例外是上面那行终端调色板：那是**数据**（别的项目的色值表，逐条可核对），它自己的文件里全是十六进制，而组件仍然一个都不写；`lib/terminal-theme.ts` 里只有一个"读不到就用它"的兜底前景色，那不是配色决定，是失败时的退路。

## Colors

### 表面阶梯

五级，从后到前。卡片 `{colors.canvas}` 坐在页面 `{colors.page}` 上，由框架 `{colors.chrome}` 框住——这就是"卡片看起来是抬起的、却不需要靠边框说明"的原因。

| 令牌 | 浅色 | 深色 | 用途 |
| --- | --- | --- | --- |
| `{colors.chrome}` | `#ffffff` | `#0a0a0a` | 顶栏、标签条、面板头 |
| `{colors.page}` | `#fafafa` | `#0f0f0f` | 内容平面（body） |
| `{colors.canvas}` | `#ffffff` | `#171717` | 卡片、面板、对话框、输入框 |
| `{colors.canvas-soft}` | `#f5f5f5` | `#0a0a0a` | 井与内嵌：表头行、空态、指标块底 |
| `{colors.canvas-soft-2}` | `#efefef` | `#262626` | 第二级内嵌：原始输出块、进度条底 |
| `{colors.hairline}` | `#ebebeb` | `#ffffff14` | 所有 1px 分隔线 |
| `{colors.hairline-strong}` | `#a1a1a1` | `#ffffff2e` | 悬停边框、焦点环 |

深色下边框变成半透明白（`#ffffff14`），这样"卡片上的 hairline"和"页面上的 hairline"读起来一致——这正是 GitSquad 记录下的那条经验。

### 文字

`{colors.ink}` 标题与主要文本；`{colors.body}` 次级文本与表格单元格；`{colors.mute}` 提示、字段说明、表头；`{colors.on-primary}` 只出现在 ink 主按钮上。

### Accent 与语义

- **Ink**（`{colors.primary}`，浅色 `#171717` / 深色 `#ededed`）：每一个肯定动作、导航激活指示。深色下它自动翻转成"浅底深字"，这是极性翻转的直接结果，不是另一个令牌。
- **Link**（`{colors.link}`）：行内链接、"信息"语气、以及**成功**——`{colors.success}` 就是它，这套系统没有绿色。
- **Warning**（`{colors.warning}`）：进行中、待确认、超时。**Error**（`{colors.error}`）：失败与删除类动作。
- 每个语义色都有 `-soft`（底）与 `-deep`（可读文字）配对，callout 与徽标直接成对使用，不需要第二套调色板。

### 深色主题

深色是**同一阶梯的极性翻转**：`lib/theme.ts` 把解析后的主题写到 `:root[data-theme]`，来源可能是系统偏好（默认）或用户明确选的那一项（见「主题」）。终端**不参与这次翻转**，它有自己的一根轴（见「终端配色」）——`tokens.css` 里已经没有终端色，那四个老令牌搬去了 `terminal-themes.css` 的 `titanium`，一词未改。

**硬规则：任何出现在组件里的颜色，必须在浅色与深色两个块里都有值。** 只在一边定义的颜色，是一个等着被"切换系统主题"触发的 bug。

### 主题偏好

- **三态**：`system`（默认，跟系统）/ `light` / `dark`，存在 localStorage（`lib/theme.ts`）。选了具体一项之后**它压过系统**。
- **唯一的入口是设置 → 外观**（跟随系统 / 浅色 / 深色，用 `segmented`）。顶栏右端不再有那个"当前主题的反面"图标按钮——上一版在这里放过它，一个整窗的偏好在工作台里放了一个副本，设置页打开时两个入口还说同一件事。
- **落地方式**：`data-theme` 写到 `<html>` 上，`tokens.css` 里浅色一套、深色一套；`color-scheme` 跟着一起写，免得滚动条与原生控件在深色下还是亮的。

### 终端配色

终端是这台产品里**唯一内容由别人绘制**的表面：16 个 ANSI 槽位填什么色，是远端程序（`ls`、`git`、`htop`、`tmux`）按自己的判断决定的。所以它的颜色不是"跟随主题"的问题，而是**要有一套完整的调色板**——xterm 缺哪个通道就回落它内置的那套（浅底 Tango），于是 ANSI 黑和深蓝糊在暗底上，这正是这个轴存在的原因。

- **一根轴，一个属性**：`data-terminal-theme` 写在 `<html>` 上（`main.tsx` 首帧前写、`setTerminalAppearance` 之后重写）。七套调色板各自是一整块 `:root`/`[data-terminal-theme="…"]` 规则，每块 21 个变量：5 个表面（`bg`/`fg`/`cursor`/`cursor-accent`/`selection`）加 16 个 ANSI。
- **画布与框架同源**：`.terminal-area` 的背景就是 `var(--terminal-bg)`，xterm 的 `theme` 由 `lib/terminal-theme.ts` 从同一批变量读出来。两处不可能各说各话——早先"画布换了、留白环没换"就是两种黑并排的 bug。
- **`titanium` 是默认，也是老样子**：它的五个表面值逐字等于这个轴出现之前的四个令牌（`#0a0a0a`/`#ededed`/`#aaffec`/`#262626`），所以从没打开过设置的人看到的还是同一块屏。其余六套是各项目**官方发布**的终端调色板，逐条可核对；上游在 bright 行重复色值时这里也照抄，不自作主张提亮。
- **`black` 与 `brightBlack` 分工**：`black` 是"最深的墨"，可以贴近背景（这正是惯例）；负责暗淡文字的是 `brightBlack`，七套都用各自主题的注释灰。
- **七套**全是暗色，这是本轮的范围而不是规则：加一套浅色就是再加一个数据块。真正让浅色可用的是另一件事——`bat`/`delta`/`eza` 这类工具会问 `OSC 11`"你背景是亮还是暗"，而 **xterm 不回答**（它只把查询 fire 给宿主，库内没有回话），所以浅色终端下它们会继续按暗底画。要加浅色，先接上那句回话。
- **留白是偏好，不是这一层的决定**：`.terminal-host` 的四边留白由 `[data-terminal-padding]` 给出，三档都落在 `--space-*` 刻度上（4 / 8+12 / 16），`normal` 就是终端一直以来的那圈（比上下略宽的 8×12）。改它会重算列宽——这是终端自己的事，不需要新规则。
- **回归网**：`lib/terminal-theme.test.ts` 直接解析 `terminal-themes.css`，要求每套都齐 21 个通道、且值是纯十六进制——`color-mix()` 这类东西在自定义属性里不会求值，xterm 解析不了就会悄悄用回自己那套浅色调色板。

## Typography

| 角色 | 字号 / 字重 | 用途 |
| --- | --- | --- |
| `{typography.display}` | 26px / 600 / -0.96px | 额度数值——全产品唯一的大字号 |
| `{typography.title}` | 19px / 600 | 页面级标题 |
| `{typography.title-sm}` | 16px / 600 | 卡片与面板标题、品牌名 |
| `{typography.copy}` | 14px / 400 | 正文、表格单元格、按钮标签 |
| `{typography.label}` | 13px / 400 | 字段标签、面板标题、文件行 |
| `{typography.caption}` | 12px / 400 | 提示、说明、徽标、表头文字 |
| `{typography.micro}` | 11px / 400 | 卡片元信息：文件大小、路径片段 |

原则：

- **等宽体是机器之声。** 端点、令牌到期、字节数、传输百分比、路径、退出码、CLI 原始输出、以及**表头**（mono 大写是"这是一个标识符"的语气）。人写给人看的句子一律无衬线。
- **字重上限 600。** 界面安静的一半来自这条。
- **数字用 tabular-nums。** 额度值、文件大小、百分比——跳动的数字不该让布局抖动。
- **不缩小字号来表达层级。** 层级由字号+颜色+字重共同承担，且相邻两级至少差两档。

## Layout

### 间距

4px 基准，`--space-1`…`--space-8`（4/8/12/16/24/32/40/48）。同级元素 `--space-2`，卡片内部 `--space-3`~`--space-4`，页面分块 `--space-4`。**不要均匀堆叠**：组间间距要比组内大一档。

### 应用外壳：一块工作台，不是一组页面

界面按终端工具的习惯组织（参照 Orca / Termius / PyCharm）：**没有"页面"可导航**，所有东西同时在场；**应用自绘窗口标题栏**，而且**顶部只有这一条栏**——它是标题栏、标签栏、工具栏和窗口控制的合体，桌面应用不该在它上面再叠一行。

```
┌ 窗口标题栏 = 顶栏 ── [▭] │ 标签… + │ [▥] [☾] │ − □ × ─────────────────┐
├─ 左栏 ────────┬──────────────────────────────────┬─ 右栏 ──────────────┤
│ 会话列表      │                                  │ 文件（SFTP）        │
│ · 状态点+名称 │   终端（中间，占满剩余空间）      │ 面包屑 + 列表        │
│ · 加速器徽标  │                                  │ 上传 / 下载 / 删除   │
│ ────────────  │                                  │                     │
│ ⚙ 设置        │                                  │                     │
├───────────────┴──────────────────────────────────┴─────────────────────┤
│ 状态栏：[进度条 · 计算单元] · 消耗速率 · 活跃会话 ─────────────── 终端总数 │
└─────────────────────────────────────────────────────────────────────────┘
```

- **顶栏（40px，唯一的顶部栏，同时是窗口标题栏）**：最左端是**品牌符号**（`app-shell/BrandMark.tsx`，18px，`--ink`）。**没有品牌字标**——应用自己画标题栏，不必再用一行文字重复窗口标题；符号在、字标不在，这一条没有被推翻。符号用的是**小尺寸切口**而不是母版：母版的下限是 24px，这条栏只有 40px（见 `brand/guidelines.md` 的最小尺寸表）。它是这条栏里唯一**不**声明 `no-drag` 的非控件元素——它不承载动作，所以拖拽区不该在这里被打断。**这条栏按窗口的分栏分三段，和下面的布局一一对齐**：最左一段**与会话栏同宽**（品牌符号 + 会话栏开关），所以中间的标签条**正好从终端上方开始**。那一段的宽度是**从会话栏量出来的**（`Sidebar.tsx` 把渲染宽度发布成 `--rail-width`），不是在这里重算一遍——窗口变窄时会让位的是会话栏，量它才能跟着让位；写第二份算法，两边第一次改动就会漂仪。会话栏收起时变量消失，这一段缩回自己的两个控件。**分栏处画一条 1px 的竖线**（`{colors.hairline}`），和下面那条分界是同一条：左边由这一段自己的 `border-right` 画——它的宽度就是会话栏宽度，所以边框正好落在会话栏 `border-right` 那一列上；右边落在文件面板的左缘（`--files-width` 同样是量出来的，`FilePane.tsx` 发布）。会话栏收起时左边那条线不画：那里没有分界，线就没有对象。中间是标签条——**它是"选中会话的工作区"**：一个终端一个标签（`终端 1`、`终端 2`…），行尾一个 `+` 再开一个终端。左栏只有一个会话时，这条栏就是那个运行时的全部 shell；换会话，整条栏跟着换。**标签上不再画状态点**：同一条栏里的标签共享同一条 SSH 连接，连接状态已经在左栏那行和状态栏里各写了一遍，再画第三遍是同一个事实说三次。右端是**文件面板开关**与**主题切换**，最右是**窗口控制**（最小化 / 最大化-还原 / 关闭）——这一组不随右栏宽度移动，开关离窗口控制太远就成了两处。Windows/Linux 上完全不画系统边框（`frame: false`），macOS 上保留内嵌的红绿灯（`titleBarStyle: "hiddenInset"`，左侧留 78px）。整条栏是拖拽区（`-webkit-app-region: drag`），栏内每个**控件**都反向声明 `no-drag`；双击同一片区域最大化，和系统标题栏一致。**"每个控件 no-drag"不等于"每条容器 no-drag"**：标签条横跨栏的中间且 `flex: 1`，它必须保持拖拽区，只有标签自身（`+` 在内）退出——容器一旦整条 `no-drag`，两端的控件之间就没有可抓的地方了，窗口会完全拖不动。窗口控制是我们画在栏里的，所以它必须是 `<button>` + IPC，而不是"看起来像按钮"。**设置页打开时，两个面板开关退场**（它们作用在那一刻不在屏上的布局），标签条与主题切换留下：标签是回到终端的路，主题是整窗的事。
- **左栏（默认 260px，可拖拽 180–420，`chrome` 底 + 右 hairline，可完全收起）**：会话列表——**这是主机列表，不是菜单**。每行是"状态点 + 名称 + 加速器徽标"（开了多个终端时前面再加一枚 `N 终端`），**点击即选中这个会话**——它没有终端就开一个，有就聚焦最后一个，标签条随之切换；非静息状态（连接中/已连接/失败）在行内写出文字。**行内动作藏在悬停才出现的 `⋯` 菜单里**（打开/聚焦终端 · **新建终端** · 重启内核 · 写入 SSH 配置 · 复制 ssh 命令 · **关闭全部终端** · **停止会话**）——静息时动作不占空间，指向它才出现；`停止会话` 是破坏性项，用 `{colors.error}` 着色并先确认。**"关闭全部终端"是唯一会挂断连接的那个**：关掉一个终端只是关掉一条 shell，同一个运行时的其它 shell 还在这条连接上跑（一个运行时只接受一条 SSH 连接，关一条 shell 不该把别人的活带走）。栏脚是应用自己的角落：**设置**（带齿轮图标、悬停提示 `Ctrl+,` 的真按钮）。设置入口在这条栏的最底部，因为它是这个工具的边角，不是工作台的一部分（额度与速率已整合至底部常驻状态栏）。
- **中间：终端。** 它占满剩余的**全部**空间，没有额外的边框或标题——终端工具的屏幕属于终端。没有终端在屏上时，这块面积换成**起始页**（见「起始页」）。终端的**内容区**是固定的 `{colors.terminal-bg}`（页面里唯一比 canvas 更暗的区域，"机器"与"界面"因此一眼分开）；断开时底部出现一条只有"重试"的细条，原因已经写在终端里了。**一个会话可以有多条终端**——每条是这条 SSH 连接上的一条 shell，有各自的 PTY 尺寸，所以"一个标签跑训练、另开一个标签看文件"不需要第二条连接（运行时也只会给一条）。选中会话的终端叠在同一块面积上：只有当前那条在布局里，其余停靠但**继续跑**，切终端、换会话都不重连——这是终端工具的底线，也是 `Workbench.tsx` 里两级停靠（会话一级、终端一级）的原因。
- **右栏（默认 340px，可拖拽 220–560，可完全收起）**：运行时的文件系统。与终端**共用同一条 SSH 连接**，所以它必须与终端同屏——这正是不把它做成独立页面的原因。它按**会话**一个，不按终端：一个运行时只有一个文件系统，两条 shell 看的是同一个。
- **两条栏的边界是拖拽条**（`components/ui/PanelDivider.tsx`）：它骑在面板自己的 hairline 上（9px 宽、左右各探出 4px），**静息时什么都不画**——边界就是面板原来那条 hairline——**悬停、聚焦或正在拖动时那条线变成 `{colors.hairline-strong}`**。界线由面板的 hairline 画，所以拖拽条不占布局宽度，拖动时也不会有东西"跳"。键盘同样是调整手段：`role="separator"` + 方向键（按住 `Shift` 一大步），并把 `aria-valuemin` / `aria-valuemax` 报给辅助技术。**窄窗口下先收窄两条栏、终端的地板是 360px**：拖出来的宽度是偏好而不是保证（`lib/panel-width.ts` 是唯一真源）。
- **两侧收起后**，终端独占整行，就是"专注模式"。
- **状态栏（26px，mono）**：左侧是算力驾驶舱——胶囊微型进度条（阶梯自适应算法：<=100 CU / <=500 CU 满格基准，低于 15% 警示）、当前计算单元余额（`42.50 CU`）、预估扣费速率（`~1.25/h`）与云端活跃计费会话数（`<ActivityIcon />` + 纯数字计数），悬停给出预计可用时长；中间弹性留白；右侧是全局打开的终端总数（`<TerminalIcon />` + 纯数字计数）。SSH 别名复制由左栏 `⋯` 菜单提供，不再平铺占用底栏。
- **设置**：一个**页面**，`Ctrl+,` 或左栏底部的齿轮进入。它不是对话框：没有遮罩、没有点外关闭，工作台也**不被卸载**——底下的终端是活着的 SSH 会话，为读一个设置把它们拆掉是错的。详见下面的「设置页」。

图标一律用内联 SVG（`components/ui/icons.tsx`）：`▤`/`▥`/`⚙` 这类字形在不同平台会落到不同字体的不同形状上，而顶栏整条都是图标。**图标之间必须能互相区分**：齿轮是"环 + 齿 + 轴心"，不是"圆 + 放射线"——后者在 15px 上和主题切换的太阳是同一个形状（这条是踩出来的）。**纯图标按钮必须另外给名字**：`IconButton` 的 `label` 同时落到 `aria-label` 和 `title`——字形给不出这个名字。

### 设置页

设置是**工作台上的一层**，不是工作台之外的一个地方（`app-shell/SettingsPage.tsx`）：

```
┌ 返回工作台 ─────────────────┬──────────────────────────────────────────┐
│ 账号                        │  ㊢ 账号与额度                            │
│  · 账号与额度    ← 当前     │  授权状态、余额与速率……                  │
│  · 用量趋势                 │ ──────────────────────────────────────── │
│ 工作台                      │  ┌ 指标 · 登录 ─────────────────────────┐ │
│  · 外观                     │  └──────────────────────────────────────┘ │
│  · 终端                     │                                          │
│ 运行时                      │                                          │
│  · 运行环境                 │                                          │
│  · 外部工具                 │                                          │
│ 应用                        │                                          │
│  · 关于                     │                                          │
└─────────────────────────────┴──────────────────────────────────────────┘
```

- **分节栏（260px）**：与左栏**同宽、同底、同 hairline、同行样式**，所以进入设置读起来是"这条栏换了内容"，而不是"弹出了一个新窗口"。首行是**返回工作台**（`PanelLeft` 那种左向 chevron + 文字，整行宽的 ghost 按钮），以下是分组的节：`{typography.micro}` 大写组名（账号 / 工作台 / 运行时），下面是"图标 + 标题"的行，激活项用 `{colors.canvas-soft}` 底 + hairline + ink 字重 500——与左栏会话行的激活态同一套。
- **正文：一次一节。** 不是把所有设置堆成一列滚动，而是分节栏选中的那一节独占正文（`max-width: 760px` 居中）。每节自带 `{typography.title}` 标题 + 一行 `{typography.mute}` 说明 + 一条 hairline，下面才是内容（`Card` 或 `Panel`）。**没有"设置"这个页面标题**——每节说的是自己的事。
- **进出**：进——左栏底部的齿轮、`Ctrl+,`；出——分节栏首行、`Esc`、或点顶栏的任一会话标签（标签是回到终端的路，点它就回到工作台并聚焦那个终端）。
- **焦点交接**：页面打开时把焦点从底下的终端收上来，关闭时交还给原来那个元素。否则用户对着设置打字，字会打进看不见的终端里。**改终端外观时同样不能碰焦点**：终端面板仍在这层之下活着，替它 `focus()` 就等于把键盘交回给一个看不见的面板——热更新那条路径因此不聚焦，只有用户真的点了终端才聚焦。
- **一节内部也可以有画面**：「终端」一节在最上面放一个只读沙箱（`features/workspace/TerminalPreview.tsx`），用的是**同一个 xterm、同一批选项、同一份调色板**，而不是一张仿制的图。它仍然是**一列**：正文宽度（760px）与"一次一节"的规矩不因为多了个预览就破例，两边并排的双栏是另一种页面形状。
- **动效**：入场 180ms `ease-out`（透明度 0→1 + 上移 8px），`prefers-reduced-motion` 下关闭。**设置页的这一入场是全产品唯一的"换了一层"动效**——它用来把"换了一层"和"界面抖了一下"分开。唯一的另一处动效是消息提示的 120ms 淡入上浮（同样在 `prefers-reduced-motion` 下关掉）：它标的是"刚出现的"，不是"换了一层"。
- **日志**：应用自己的日志在 `userData/logs/colabdesk.log`——**不是安装目录**：那可能是 Program Files（要管理员才可写）、macOS 上是签名 bundle（不可写），卸载还会连同它一起删掉，而这份日志要能活过一次卸载，和旁边的用量历史一样。行格式是 `时间戳 [scope] 正文`，一次调用一条：CLI 的 argv、退出码、耗时与原始输出（`colab/`）、登录流程的每一步、主进程的未捕获异常与未处理 rejection（`process-guards.ts`），启动时另写一行版本 / 平台 / 安装目录 / CLI 来源——一份粘贴出来的日志要能自己说明它是哪个构建、装在哪。**写入前一律脱敏**（OAuth 的 `code`/`state`、`token`/`secret`/`password` 形式的键值、`Bearer`），因为这份文件是拿来发出去的；写失败一律吞掉（fail-open），2 MB 轮转一份 `.1`。用户入口只有一个：**设置 → 关于** 的「运行日志」一行，显示路径 + 「打开日志」——路径本身要露出来，因为提交问题时它常常要跟着一起写。**但界面从不指路到日志**：没有人会为了看一个按钮为什么没反应去翻安装目录里的文件。失败要**当场把原因说清楚**——用 CLI 自己最后那句人话（`failureReason`），配一个「复制详情」把完整输出交到用户手里；日志是给维护者事后读的，不是给用户的作业。

### 键盘

终端优先：应用级快捷键一律带 `Shift`，不占用 shell 需要的组合（`Ctrl+C` 永远是 SIGINT）。

| 快捷键 | 作用 |
| --- | --- |
| `Ctrl/Cmd+Shift+C` / `Cmd+C` | 复制选中内容 |
| `Ctrl/Cmd+Shift+V` / `Cmd+V` | 粘贴 |
| 右键 | 有选中就复制，否则粘贴 |
| `Ctrl+Shift+=` / `-` | 终端字号（记忆到 localStorage） |
| `Ctrl/Cmd+Shift+T` | 在当前会话里新建终端 |
| `Ctrl/Cmd+Shift+N` | 新建会话（申请运行时） |
| `Ctrl/Cmd+Shift+W` | 关闭当前终端（会话的最后一个终端才挂断 SSH） |
| `Ctrl/Cmd+Shift+1…9` | 切换当前会话的终端 |
| `Ctrl/Cmd+Shift+E` | 显示 / 隐藏会话栏 |
| `Ctrl/Cmd+Shift+B` | 显示 / 隐藏文件面板 |
| `Ctrl/Cmd+,` | 打开设置 |
| `Esc` | 关闭设置（设置没开时 `Esc` 归终端，不拦截） |

### 起始页（中间没有终端时）

中间没有终端时不是空白，而是这台应用的**正门**（`features/workspace/StartPage.tsx`）：

```
              品牌锁版：符号 + 名字（图形，200px）
                 把远程 GPU 运行时当本地机器用
                 选一个会话，或新建一个运行时。        ← 下一步
                    [ 新建会话 ]   [ 展开会话栏 ]
   连接 GPU 机器   跑训练和推理   传输文件   查看用量
       ───────────────────────────────────────────────
                    ☆ 在 GitHub 上点个 Star            ← 页脚
```

- **这一屏既是营销页也是空态。** 上半是产品的主张（品牌锁版 + 一句话），下半仍然守空态的老规矩：说明**这一步**该做什么。只有装饰而不指路，是比朴素空态更差的空态。
- **名字是图形，不是字。** 锁版来自标识套件（`app-shell/BrandLockup.tsx`：母版符号 + 转曲字标，`brand/` 不入库所以几何内联）。因此这一屏**没有更大的字号**——阶梯最高仍是 26px 的 `{typography.display}`。锁版走 `currentColor`：浅色是 ink，深色自动反白。
- **两种情形共用一列。** **还没选会话**（启动时就是这一屏）：锁版 + 主张 + "选一个会话，或新建一个运行时"（本地一个会话都没有时是"新建一个运行时开始使用"），动作是**新建会话**，会话栏收起时补一个**展开会话栏**。**选中了会话但它还没有终端**：同一个容器只留"「&lt;会话&gt;」还没有终端 + 新建终端"——来的人要的是终端而不是品牌故事，所以这一屏**不画锁版、也不出现 star**。
- **一屏一个 primary。** 肯定是**新建会话**（或**新建终端**）；star 是 `outline` 的小药丸，任何时候都不与它争。
- **star 只问一次。** 页脚那颗药丸指向源码仓库（`lib/star-prompt.ts`）。应用没有办法核实谁真的点了 star（这里没有 GitHub 账号，也没有 `gh`），所以点开即算回答：此后那颗药丸换成 mono 的仓库地址，链接还在、不再央求。文案只说"点个 Star"，从不声称已经加过。
- **每条是"你能拿它做什么"，不是"它内部长什么样"。** 图标 + 标题 + 一行说明，无底色无阴影，横排一条——正门上一排抬起来的盒子会是全应用最吵的东西。标题写成**动词 + 对象**（*连接 GPU 机器 · 跑训练和推理 · 传输文件 · 查看用量*），一条一件事；"一个会话装多条终端""文件与终端共用一条连接"这类机制属于说明那一行，它才是补事实的地方——**机制换个说法当标题就成了黑话**。条数跟着内容走，布局让步：`.startpage__features` 是 `auto-fit` 网格（每条 ≈160px），栏窄了自己降到两三条一行。
- **「跑训练和推理」说的是那台机器，不是这个应用。** 这里没有 Run 按钮，所以图标是终端而不是播放键——播放键等于承诺一个不存在的功能。凡是"机器能做到、应用只负责把机器交给你"的事，都按这条写：标题落在用户要做的事上，说明行交代它在哪儿发生。

**空态不许声称"没有"。** 列表有两个来源（本地记录、服务器）时，只说得出本地那半就只写"本地还没有会话"，服务器那半没读到就再写一行"读不到服务器上的运行时列表 + 去哪重试"——"什么都没有"是一句只有在两半都读到、而且都是空的时候才成立的话。

### 密度与点击面积

桌面控制台以紧凑取胜：表格行 `--space-3` 上下留白，按钮 32px、小号 28px。**低于 28px 高的可点区域算缺陷**，行内图标按钮除外（它们成组出现且间距足够）。

## Elevation & Depth

五级，全部实现为**堆叠的小偏移 + 一圈内嵌 hairline**（见 frontmatter 的 elevation）。等级 2 是默认卡片；等级 3 是悬停与拖拽中；等级 4/5 留给真正悬浮的层（下拉、对话框）。

**永远不要用单个大模糊投影。** 那会让工作台看起来像仪表盘；"坐在页面上"而不是"浮在页面上面"才是这套系统的重量感来源。**也永远不要给表格行加投影**——行靠 hairline 和 `{colors.canvas-soft}` 的悬停底色表达。

## Shapes

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `{rounded.xs}` | 4px | 面包屑片段、键位提示 |
| `{rounded.sm}` | 6px | **所有应用内控件**：按钮、输入框、callout 内的控件 |
| `{rounded.md}` | 8px | callout、原始输出块、空态框 |
| `{rounded.lg}` | 12px | 卡片、面板、表格容器、工作面板 |
| `{rounded.full}` | 9999px | 徽标、状态点 |

两套尺度分工明确：**控件 6px，容器 12px**。同一屏里不要用两种半径表达同一种东西。状态点是 6px 圆，进度条 4px 高全圆角。

## Components

### Button

`components/ui/Button.tsx`，七个变体、四个尺寸（md 32 / sm 28 / lg 36 / icon 32）。

- `primary` —— ink 实底 + `on-primary` 文字。**每个流程只有一个**（创建、打开工作区、上传、登录、提交）。
- `secondary` —— canvas 底 + Level 1 阴影，与 primary 配对的非承诺动作（重读、同步、刷新、连接）。
- `outline` —— canvas 底 + 可见 hairline 边框，用于密集工具栏（SSH 配置、写入 ~/.ssh/config、下载）。
- `ghost` —— 无底无框，悬停 `{colors.canvas-soft}`；表格行与文件行的辅助动作（重启内核、断开、删除文件）。
- `destructive` —— `{colors.error}` 实底白字；只给不可逆动作（停止会话）。
- `link` —— 链接蓝文字，悬停下划线；用于"查看环境"这类行内跳转。

所有按钮 `active` 下沉 1px，`:focus-visible` 用 `--focus-ring`（3px 半透明 hairline-strong），禁用态 45% 透明度但**保持可见**——用户需要知道那里有个动作。

### Field / Input / Select / Checkbox

控件高 32px、canvas 底、`{rounded.sm}`。标签在控件上方（13px/500 ink），可选说明以 `{typography.caption}` + `{colors.mute}` 跟在标签后；行内场景用 `field--inline`。焦点态是 `{colors.hairline-strong}` 边框 + 3px 半透明环，不做硬 outline。

### Card 与 Panel

- **`Card`**：页面内容容器（新建会话、会话列表、额度）。头部是"标题 + 说明 + 动作"三件套，说明永远是一句话、最多 62ch。
- **`Panel` + `PanelRow`**：**一节一张卡，行与行用 hairline 分隔**——这是事实与设置的形态。左列是"这是什么"（标签 + 可选说明），右列是"怎么读 / 怎么改"（mono 值或动作）。环境页整页就是这个形态；一行一卡会把一页四件事变成四屏。

### 快捷键对照表

设置 → 终端 里那张表是一张 `.table`：**无边框**，`td` 之间 hairline、末行不画线，单元格不折行。左列是键位，键帽用 `.kbd`（mono + `{colors.muted}` 底 + `{rounded.xs}`）；右列说这一步在做什么。它**不是通用的列表形态**——没有表头、没有动作、不可点，会话列表是 `.session-row`（见「功能组件」）。

### Callout / EmptyState / Metric / ProgressBar / RawOutput

- **`Callout`**：`-soft` 底 + `-deep` 文字的软填充块，级别由底色区分（info = link-bg-soft、warn = warning-soft、danger = error-soft）。解释、告警、失败都在这里说，**不用弹窗**。
- **`EmptyState`**：所有可能为空的列表都有；标题说"没有什么"，正文说"下一步做什么"。
- **`Metric`**：KPI 块——`{typography.display}` 数值 + `{typography.caption}` 标签，底色 `{colors.canvas-soft}`。免费版的 `—` 是合法显示，不是错误。
- **`ProgressBar`**：4px、ink 填充，只出现在传输进行中。
- **`RawOutput`**：折叠的原始文本，`{colors.canvas-soft-2}` 底 + mono，默认收起。它**只服务于"这段内容用户可能想读"**——现在唯一的用处是设置里那份写进 `~/.ssh/config` 的配置块。**CLI 的原始输出既不走这里、也不在界面上露头**：那些进日志（见「设置页」的「日志」），用户要的是"为什么失败"，由失败文案当场回答，「复制详情」负责把完整输出交出去。
- **`CopyButton`**：复制一段文本，标签就地变成「已复制」两秒后变回来。剪贴板写入是无声的，而为一个复制动作再发一条消息比这件事本身还重——**标签就是全部的确认**。它存在是因为"把证据交给别人"这件事不该要求用户先找到某个文件。

### 功能组件

- **会话行（左栏）**：状态点 + 名称 + 加速器徽标；`session-row--active` 用 `{colors.muted}` 底标出当前标签；悬停出现 `{colors.canvas-soft}`。连接状态在行内以文字写出（`已连接` / `连接中` / `失败`），静息的"已断开"不写。行尾是 `⋯` 菜单触发器（悬停或键盘聚焦才显形），破坏性项在菜单里排最后并用 `{colors.error}`。
- **未在本地记录的行（左栏，`.session-row--untracked`）**：服务器上有、本地记录里没有的运行时——`colab sessions` 把这些打成一行 `[?]`——排在会话行之后。它没有名字，所以行内用 **mono** 写 endpoint；状态是 `status--warn` 点 + 文字"未在本地记录"。**没有 `⋯` 菜单、没有悬停底色、指针不是手型**——这个应用对它无能为力，一行就不该看起来可点。"要关掉它请到 Colab 网页版"这句在 tooltip 里，不在行内。
- **菜单（`Menu`）**：`canvas` 底 + Level 4 阴影 + 8px 圆角的小浮层，靠触发器的右下角对齐；`Escape` 或点击别处关闭。它承载"属于这一行、但不常用"的动作，因此**永远不占静息布局的空间**。
- **图表（柱状，`.trend__*`）**：只表达量，不做多序列。绘图区是 `{colors.canvas-soft}` 的井（1px `{colors.hairline}` + `{rounded.lg}`），柱是 `{colors.ink}`——**图里不出现第二个颜色**，语义由文字承担。三条规则：
  - **量级必须有参照**：图上方一行 `{typography.caption}` 写区间与峰值，否则柱高无从读起。
  - **"没测到"不等于"没消耗"**：没有读数的区间在基线画 `1px dashed {colors.hairline-strong}`，柱照常画（消耗是按相邻读数摊出来的），并在图下的说明里写出这一段是推算的。**不得**用空柱表示零。
  - 横轴标签 `{font-mono}` + `{typography.micro}` + `{colors.mute}`，桶多了就每 N 个标一个，绝不折行、绝不旋转。
- **分段选择（`.row` + `Button`）**：小集合互斥选择（终端字号、趋势的天/周/月）用一排 `Button`，激活项 `primary`、其余 `outline`，`size="sm"`。它不是"一屏一个 primary"的那类动作按钮，是状态指示，因此不受该约束。
- **消息提示（toast）**：行内动作的结果落在**右下角**，用 `Callout` 的三级色浮一层（Level 4 阴影、`rounded.md`、400px 宽），**自己走开**（info 4s / warn 8s / danger 12s），带一个 `IconButton` 的 `×`（有可访问名称），**同文替换而不是叠一条**，最多 3 条，`prefers-reduced-motion` 下不做入场。它是 `role="status"` + `aria-live="polite"`——**报告，不打断**。它和横幅的分工是这条规则的全部：消息属于**一个动作**（"已复制""已停止"），横幅属于**一种状态**（更新待装、环境读不到）——状态要等到被处理，所以它不能自己消失，也就不能是 toast。**成功永不用弹窗**。
- **终端标签**：状态点 + 名称 + `×`；激活标签是 `canvas` 底 + ink 下划线；中键关闭是终端用户的肌肉记忆，必须支持。
- **文件行**：图标 + 名称（占满剩余宽度）+ mono 大小（micro、右对齐）+ **悬停才出现**的动作（下载 / 删除）。文件名点击的默认行为是下载；删除永远不抢主位。
- **传输行**：`↑/↓ + 文件名` 一行，百分比在右（mono、tabular），进行中显示 4px 进度条，失败就地用 `{colors.error}` 报告；进行中的传输数会出现在状态栏。
- **面包屑**：mono、`{colors.canvas-soft}` 底、片段可点、最右是"↑ 上级"。
- **状态**：`Status` 永远是"点 + 文字"（已连接 / 连接中… / 运行中 / 未授权）。**颜色从不单独承载语义。**
- **对话框**：`Dialog` = `canvas` 底 + Level 5 阴影 + 半透明遮罩；点遮罩或右上角的 `×` 退出（`IconButton` + `CloseIcon`，和终端标签上的关闭是同一个字形）。**只有新建会话用它**——一个真正的中途岔路。设置不是对话框，它是页面（见「设置页」）。**新建会话里的加速器选项会标注本账号拿不到的那些**：加 `disabled` 并在文字后缀"（当前账号不可用）"，不去掉整个选项——"这台机器有过 H100，只是这个账号拿不到"才是要看的信息；标题的 hint 同时列出可用的清单，因为一串删除线不说明还剩什么。后端没回答时（离线、响应读不懂）全部可选：`colab new` 才是唯一真正做决定的地方，界面不替它拒绝。账号与可用加速器在设置页的「账号与额度」里，一行一个：邮箱一行、可用加速器一行（不可用的用 `badge-off`）。

## Do's and Don'ts

### Do

- 用 `{colors.primary}`（ink）承担每一个肯定动作；深色下它自动翻转。
- 用 `{colors.page}` → `{colors.canvas}` → `{colors.canvas-soft}` 的阶梯表达层次，卡片配 Level 2 阴影。
- 机器汇报的每个值都用 mono：路径、时间、字节、百分比、退出码。
- 每个状态都是"点 + 文字"；每个可能为空的列表都有 `EmptyState`。
- 事实与设置用 `Panel` + `PanelRow`；列表用 `.session-row`（左栏）；解释用 `Callout`；量的对比用柱状图（`.trend__*`）。
- 时间戳转成本地时间短格式，原始值放 tooltip。
- 新令牌先落地 `tokens.css`（浅色 + 深色），再在组件里用。
- 设置改成一整片界面（页面、图层），用**分节栏 + 一次一节**；主题这类整窗的偏好也住在设置里（「外观」），不另设顶栏按钮。

### Don't

- 不要引入第二个高饱和色；也没有绿色——`{colors.success}` 就是链接蓝。
- 不要用单个大模糊投影，也不要给表格行加投影。
- 不要把正文或标签放进 mono 大写（那是"标识符"的语气，`令牌到期` 不是标识符，`ENDPOINT` 是）。
- 不要用颜色单独表达状态。
- 不要给终端面板做浅色——**除非先把 `OSC 11` 的回话接上**（见「终端配色」）：远端工具问不到底色时会按暗底画，浅色下就成了糊。
- 不要让同一屏出现两个 primary 按钮，也不要让可点区域低于 28px。
- 不要一行一张卡地堆事实；用 `Panel` 的 hairline 分行。
- 不要在组件里写死十六进制颜色——即使是"临时"的。
- 不要为了显示一屏设置去卸载工作台（终端、文件面板）；设置是**盖在上面的一层**。
- 不要让顶栏出现第二个形状相近的图标：主题切换是日/月，齿轮就必须是别的形状。
- 不要写省掉 `type` 的裸 `<button>`：HTML 的默认值是 `submit`，落在表单里就会替用户再提交一次——"有副作用的命令绝不重试"这条，在界面上同样成立。门禁是 `react/button-has-type`，唯一例外是转发 `type` 的 `Button` 自己。

## Provenance

这套系统**移植自团队在 `D:\odyssey\GitSquad` 的 `DESIGN.md`**：表面阶梯、ink 主色、堆叠阴影的五个等级、Geist 字体族与"mono 是机器之声"的分工、`-soft`/`-deep` 成对的语义色、"状态是点加文字"、"深色是一次极性翻转而非第二套调色板"、"一节一张卡 + hairline 分行"——都来自那份文档，那里是这些决定的原始出处与理由（包括几条从事故里写出来的规则，例如"只在一边定义的颜色是一个 bug"）。

GitSquad 自己声明它的这套视觉语言是对 Vercel 营销站语言的一次诠释。本节只说明本文件的谱系：**ColabDesk 没有独立发明颜色或层级，它把 GitSquad 的系统应用到一台远程机器的控制台上**，并按控制台的需要做了三处增删（去掉展示级字号、把终端面板固定深色、重排状态语义）——这三处都记在 Overview 里。

终端那一条后来长成了自己的轴：`terminal-themes.css` 的六套外来调色板各自带着出处（Tokyo Night、Catppuccin、One Dark、Dracula、Nord、Monokai 的官方终端配色），只有 `titanium` 是这套系统自己的——它的表面对是这个文件里原本那四个令牌，色相取自 `tokens.css` 的语义色，bright 行按"在 `#0a0a0a` 上可读"提亮。机制本身仍是 GitSquad 那条：`D:\odyssey\GitSquad\DESIGN.md` 用 `.dark` 包一层来渲染终端 mockup，理由是"它是终端的**图片**，不该跟随读者主题，而 `bg-primary` 从来不是表达这件事的方式，因为 primary 会翻转"。这里保留了理由、换掉了机制（可选项比单一钉死更符合"终端是机器"）。
