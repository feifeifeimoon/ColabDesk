# 端口转发（Proxy）方案

> 状态：Phase 0 已验证；Phase 1 已实现（2026-11-09，`feat/port-forwarding`）· 2026-11-09
> 分支：`feat/port-forwarding`
> 目标：把 Colab 运行时里的 TCP 端口映射到本机 `127.0.0.1`，用本地浏览器或客户端访问运行时的 Gradio、vLLM、Streamlit、Jupyter 等服务。

---

## 0. 结论

**用 SSH 的本地端口转发（local forwarding / `direct-tcpip`），不引入新的代理进程或第二套传输。**

- 现有 `ColabSshConnection` 已经把运行时代理的 WebSocket 交给 `ssh2`，终端和 SFTP 都复用这一条连接。
- `ssh2` 客户端提供 `forwardOut(srcIP, srcPort, dstIP, dstPort, cb)`；它开的是一条 SSH `direct-tcpip` 通道，不额外占用运行时的 SSH 连接。
- 主进程为每个映射起一个 `net.Server`，只监听 `127.0.0.1`；每个本地连接开一条 `forwardOut` 通道，双向 pipe。
- 渲染层在状态栏右下角增加一个 **Ports 按钮 + 弹层**：按钮显示活跃映射数，点开可以看当前所有映射、打开/复制/停止，也可以直接新增。
- 前置风险：**Colab 运行时的 SSH 服务是否允许 `direct-tcpip`**。Phase 0 已在真实 CPU 运行时确认：Colab 的 SSH 端点接受这条通道，本地 `net.Server` + `forwardOut` 返回 HTTP 200（见 §8.1）。

---

## 1. 协议层是怎么工作的

### 1.1 现有连接

`src/main/ssh/connection.ts`：

- 用 `ws` 连到 `wss://<runtime host>/colab/ssh?colab-runtime-proxy-token=...`，把 WebSocket 变成 `Duplex` 交给 `ssh2.Client.connect({ sock })`。
- 一个运行时只允许一个 SSH 连接（第二个 upgrade 会 429），所以终端、SFTP 全部多路复用这一条连接。
- `Client` 是私有字段；`openShell` / `openSftp` 都走 `requireClient()`。

### 1.2 本地转发

`ssh2` 1.17 客户端：

```ts
client.forwardOut(
  "127.0.0.1",          // 源地址（仅用于 direct-tcpip 请求的元数据）
  localSocket.remotePort ?? 0,
  remoteHost,           // 运行时内的目标地址，默认 127.0.0.1
  remotePort,
  (error, channel) => { /* channel 是 Duplex，直接与本地 socket pipe */ },
);
```

对应的 SSH 层是 `direct-tcpip` 通道：运行时里的 sshd 替客户端连接 `remoteHost:remotePort`，再把字节流转回来。它不是 reverse forward，不需要改运行时配置，也不需要额外的服务端进程。

### 1.3 和现有 `ssh-config` 的关系

`colab ssh --proxy-mode` + `ssh -L` 是给 **外部 OpenSSH** 用的同一机制。应用内的端口转发不需要启动外部 `ssh`：

- 优点：复用已建立的连接、不依赖系统 OpenSSH、不额外占一个 SSH 连接、本地端口生命周期和 app 一致。
- 仍然可以在 Ports 弹层里提供“复制 `ssh -L` 命令”（P2），给需要外部终端的人。

### 1.4 可验证的风险

`direct-tcpip` 是标准 SSH 通道，但 Colab 的 `/colab/ssh` 是运行时代理，不是裸 sshd；它可能对通道类型有限制。Phase 0 用真实运行时验证：

```bash
# 在一个真实 CPU 运行时里启动一个服务
python3 -m http.server 8000 &

# 用 CLI 的 SSH 代理 + 系统 OpenSSH 测 local forwarding
ssh -o "ProxyCommand=<bundled-python> -m colab_cli.cli ssh --proxy-mode -s <session>" \
    -N -L 18000:127.0.0.1:8000 root@colab-runtime

curl http://127.0.0.1:18000/
```

如果 18000 能拿到目录列表，`direct-tcpip` 就被允许；之后应用内的 `ssh2.forwardOut` 走的是同一种通道。若被拒绝，见 §2.1 的 fallback。

---

## 2. 目标与非目标

### 目标

- 每个 session 可建多个映射：`运行时 host:port` → `127.0.0.1:<local port>`。
- 本地端口可自动分配，也可指定固定端口；冲突时给出可行动的提示。
- 本地地址生成 `http://127.0.0.1:<port>` / `https://...`，可一键在系统浏览器打开、复制。
- 映射在 app 运行期间保持；运行时连接断开时明确停止；关闭全部标签时停止（保留已停止的行），会话停止时删除。
- 复用现有 SSH 连接，不增加第二个运行时连接。
- 跨平台（Windows / macOS / Linux）；本地只监听 loopback。

### 非目标（MVP）

- 不做 `0.0.0.0` 局域网暴露；后续作为显式开关 + 警告。
- 不做 SSH 反向转发（`remote forward` / `-R`）；P3 再考虑。
- 不做 HTTP 反向代理/域名改写；端口转发是 TCP 级，Host 头原样传递。
- 不做端口自动发现（解析终端输出）；P2 的“终端链接映射”是入口优化，不是自动建。
- 不做“跨 app 重启持久化 + 自动恢复”；P2 再做。
- 不做多个运行时的连接合并；每个映射属于一个 session。

### 2.1 如果 `direct-tcpip` 被拒绝

> 实测（2026-11-09）：未被拒绝。以下保留，作为如果 Colab 以后收紧该通道的预案。

按优先级：

1. **Colab 运行时代理的 HTTP/WebSocket 入口**：如果 `<port>-<endpoint>` 形态的代理 URL 可用，可以在本地起一个 HTTP/WS 反向代理，转发到该 URL。它只覆盖 HTTP/WS，不是任意 TCP。
2. **外部 OpenSSH**：生成 `ssh -L` 命令让用户在系统终端运行；应用不参与转发生命周期。体验差，但可用。
3. **运行时内 relay**：用 `colab exec` 起一个 TCP relay，通过一个专用 SSH shell channel 传字节；复杂、脆弱，只作为最后手段。

Phase 0 通过后再写 Phase 1 的 UI；不要在通道能力未确认前投入完整界面。

---

## 3. 总体架构

```
┌──────────────────────────── renderer ────────────────────────────┐
│ PortsControl（状态栏右下角：按钮 + 上方弹层）                      │
│   ├─ 按钮：PlugIcon + 活跃/启动中数量；0 时仍显示，错误加点        │
│   ├─ 添加：remote host/port → local port(自动/固定) → 添加        │
│   ├─ 列表：按 session 分组，行内 打开/复制/停止/删除               │
│   └─ 空状态 / 连接未就绪 / 错误                                    │
│ store/slices/ports.ts  bySession: Record<string, PortForward[]>   │
│ AppShell 状态栏：更新提示（有版本时）+ Ports 按钮 + 终端计数       │
└───────────────────────────────┬───────────────────────────────────┘
                                │ IPC invoke + ports:changed
┌───────────────────────────────▼───────────────────────────────────┐
│ main                                                               │
│ ipc/handlers/ports.ts     list/create/start/stop/remove            │
│ ssh/port-forward.ts       PortForwardManager：监听、通道、生命周期 │
│ ssh/connection.ts         + forwardOut(dstHost, dstPort, srcPort)  │
│ ssh/manager.ts            acquire(session) → 复用的 SSH 连接       │
└────────────────────────────────────────────────────────────────────┘
```

### 3.1 主进程职责

- `ColabSshConnection.forwardOut`：只加一个方法，复用 `requireClient()`；连接未 ready 时抛错。
- `PortForwardManager`：持有每个映射的 `net.Server`、本地 socket 集合、`active` 连接和状态；输出变化通过回调给 IPC 广播。
- 它不关心 UI 文案；错误码 + detail 交给渲染层映射。
- 它不做自动重连：运行时连接断开后映射进入 `error`，由用户重启；避免在后台反复占用端口。

### 3.2 渲染层职责

- `ports` slice 镜像每个 session 的映射列表；事件更新。
- `PortsButton`（状态栏）+ `PortsPopover` 负责表单、行操作、打开/复制；不自己持有 socket。
- 按钮显示全局活跃/启动中数量；弹层是视图，关闭弹层不停止映射；“关闭全部标签”才显式停止。

---

## 4. 数据模型与状态机

```ts
export type PortForwardStatus = "starting" | "active" | "stopped" | "error";

export interface PortForward {
  id: string;
  session: string;
  /** 运行时内的目标；默认 "127.0.0.1"。 */
  remote_host: string;
  remote_port: number;
  /** 本机监听地址；MVP 固定 "127.0.0.1"。 */
  local_host: "127.0.0.1";
  /** 实际端口；starting/active 时才有值。 */
  local_port: number | null;
  /** 用户指定的端口；null 表示自动分配。 */
  requested_local_port: number | null;
  /** 只用于“打开”的 URL，不改变 TCP 转发本身。 */
  scheme: "http" | "https";
  status: PortForwardStatus;
  error: string | null;
}

export interface PortForwardRequest {
  session: string;
  remote_host?: string;
  remote_port: number;
  local_port?: number | null;
  scheme?: "http" | "https";
}
```

状态机：

```
idle ──create/start──> starting ──listening──> active
                          │                     │
                          └──error<─────────────┘
active ──stop──> stopped
active ──connection closed / session stop──> error
stopped ──start──> starting
```

- `local_port` 在 `listening` 之前是 `null`；UI 显示“分配中…”。
- `error` 的 `detail` 是给人看的短句（端口占用、连接未就绪、远端拒绝），完整原因进日志。
- 每次变化广播 `{ session, forwards: PortForward[] }`，渲染层整体替换该 session 的列表。

---

## 5. 本地监听与连接生命周期

### 5.1 启动一个映射

1. 校验请求：`remote_port` 1–65535；`local_port` 为 null 或 1024–65535；`remote_host` 默认 `127.0.0.1`，只允许合法 hostname/IP；`scheme` 枚举。
2. 状态 `starting`，广播。
3. `await ssh.acquire(session)`：复用终端/SFTP 的连接；没有则完成 SSH 握手。
4. 连接 ready 后 `net.createServer`，`listen({ host: "127.0.0.1", port: requested ?? 0, exclusive: true })`。
5. `listening` 后记录实际端口，状态 `active`，广播。
6. 如果 `acquire` 或 `listen` 失败：状态 `error`，关闭已建资源，广播；不自动重试。

> 先 acquire 再 listen 的原因：运行时不可达时不应该在本地留下一个“看起来可用、实际全失败”的端口。代价是固定端口在握手期间可能被别的程序抢走；失败后用户重试即可，自动端口没有这个问题。

### 5.2 每个本地连接

```ts
server.on("connection", (socket) => {
  socket.setNoDelay(true);
  connection.forwardOut(remoteHost, remotePort, socket.remotePort ?? 0)
    .then((channel) => {
      sockets.add(socket);
      socket.pipe(channel).pipe(socket);
      const close = () => {
        sockets.delete(socket);
        socket.destroy();
        channel.destroy();
      };
      socket.on("error", close);
      socket.on("close", close);
      channel.on("error", close);
      channel.on("close", close);
    })
    .catch((error) => {
      record.last_error = shortReason(error);
      socket.destroy();
    });
});
```

- 单个连接失败不把整个映射标成 `error`：监听器仍可用，浏览器可能只是访问了一个没启动的服务。最近一次连接错误可显示在行的 tooltip/详情里。
- 远端通道的窗口/背压由 `pipe` 处理；不额外缓存。
- 本地 socket 与 SSH channel 任一端关闭，另一端立即 destroy，避免半开连接堆积。

### 5.3 停止

- `server.close()` 停止接受新连接；遍历 `sockets` 逐个 destroy；每条 `forwardOut` 通道随之关闭。
- 状态 `stopped`，广播；本地端口释放。
- `remove` = stop + 从列表删除；如果删除时还在 `starting`，先取消启动（关闭已建资源）。

### 5.4 连接/会话生命周期

- `PortForwardManager.start` 对取得的 `ColabSshConnection` 挂一个 `status` 监听；`closed` / `error` 时：
  - 关闭该 session 的所有 listener 和 socket；
  - 映射状态 `error`，detail “运行时连接已断开，重新连接后可重启映射”；
  - 不自动重连（和 SSH 的重连策略分开）。
- 会话停止（`stopSession` 成功）：主进程 `forget(session)`，停止并删除该 session 的所有映射；渲染层同时清空。
- 会话从 rail 消失（`pruneTabs`）：渲染层调用 `forgetPortForwards(session)`，主进程删除定义。不能只在渲染层 `clearPorts`——主进程保留的定义会在下一次 `ports:changed` 里把 stopped 的幽灵行重新广播回来。
- 关闭全部标签：先停止该 session 的映射（行保留为 `stopped`，再次打开会话可重启），再 `sshDisconnect`；这是显式挂断。
- App 退出：`PortForwardManager.dispose()` 关闭所有 listener，端口释放。

### 5.5 连接消费者（需要拍板）

现有规则是“最后一个 tab 关闭 = 放掉 SSH 连接”（`workspace.ts` 的 `release`）。端口映射是第三个连接消费者：

- **推荐**：只要该 session 还有活跃映射，最后一个 tab 关闭也不 `sshDisconnect`；映射继续跑，状态栏的 Ports 按钮显示数量；用户点右下角按钮即可管理。
- **简化版**：映射不持有连接，最后一个 tab 关闭就停止；用户需要保留一个 tab 才能保持映射。
- “关闭全部标签”始终显式停止映射并挂断，不受上面选择影响。

推荐前者：端口映射本来就是为了“后台跑一个服务、在本地浏览器用”，不应该要求一直开着一个终端 tab。实现上是让 `release` 先问 `ports` slice/主进程是否还有活跃映射。

---

## 6. UI

### 6.1 入口：右下角 Ports 按钮 + 弹层

不新增工作台 tab；入口固定在状态栏右下角，和终端计数同一组：

- 状态栏右侧增加一个真正的按钮：`PlugIcon` + 活跃/启动中的映射总数；0 时仍然显示（灰色），有错误时加一个小警示点。
- 点击在按钮上方打开一个**非模态弹层**（没有遮罩，不 inert 终端）：列出当前所有 session 的映射，按 session 分组，当前选中的 session 在最上面。
- 弹层内直接新增：`添加到 <selected session>` + 远程端口 + 本地端口（自动）+ `添加`；远程主机/协议折叠在“更多选项”。
- 点击外部 / Escape / 再点按钮关闭；弹层不阻断终端；行内操作（打开/复制/停止/删除）就在弹层里。
- 没有选中 session 时按钮仍然可见；弹层显示“先打开一个会话才能新增”，已有的映射仍可查看/停止。
- 不再在 session 行 `⋯` 菜单里加“端口转发…”：右下角按钮是唯一入口，避免两个入口。

**为什么不是 Ports tab / 右栏：**

- 端口是“随时看一眼、随手加一个”的工具，不是持续编辑的工作区；tab 会占一个 tab 位，用户为了加端口还要切 tab。
- Orca 的交互证明了这种入口更轻：按钮上的数字就是状态，点开就是列表和添加；关掉后终端还在原位。
- 右栏是运行时的文件系统，220–560px；端口表放进去会挤，且会把“文件”这个单一职责稀释掉。
- 省掉第三种 `WorkspaceTab`、`PaneSurface`/`GroupStrip`/`GroupTab`/`TabDragProvider` 的改动，Phase 1 的实现面小很多。

**状态栏规则变化（实现时写回 DESIGN.md）：**

现有规则是“更新提示是状态栏唯一的控件”。端口按钮是第二个工具控件；更新提示仍然是“有下载/新版本时才出现”的控件。新的表述：

> 状态栏右侧是运行时的边缘：更新提示（有版本时）、端口按钮（始终）、终端计数（读数）。端口按钮打开一个非模态弹层；终端计数仍然只是读数。

### 6.2 弹层布局

```
状态栏右下角：   [更新提示]  [🔌 2]  [▣ 3]

点击 [🔌 2] 后（弹层在状态栏上方）：

┌─ 端口转发 ─────────────────────────── 2 个运行中 ─┐
│ 添加到 [e2e-alpha]   远程端口 [8000    ]           │
│ 本地端口 [自动      ]  [添加]                       │
│ 更多选项 ▸  远程主机 [127.0.0.1]  协议 [http ▾]     │
├────────────────────────────────────────────────────┤
│ e2e-alpha                                          │
│  127.0.0.1:8000 → 127.0.0.1:52431  已映射          │
│  打开 · 复制 · 停止                                 │
│ e2e-beta                                           │
│  127.0.0.1:7860 → 127.0.0.1:52432  启动中…         │
│  打开 · 复制 · 停止                                 │
└────────────────────────────────────────────────────┘
```

- 弹层宽度约 380px；`max-height: min(60vh, 520px)`，列表内部滚动；右对齐到端口按钮。
- 分组标题是 session 名；当前 session 的分组排第一；没有当前 session 时按名字排序。
- 行：`remote_host:remote_port → local_host:local_port`，本地地址 mono；状态在右；操作是文字链接/小按钮。
- `error` 行：短原因 + `重试` + `删除`；`starting` 显示“分配中…”，操作禁用；`stopped` 可以 `重启`/`删除`。
- 本地端口固定冲突：行内错误 + “改用自动/换端口”的提示。
- 连接未就绪：弹层顶部一条 `Callout` “启动映射会先连接运行时”；不阻止添加，只阻止 `active`。
- 空状态：一句“把运行时的端口映射到本机。例如 Gradio 7860、vLLM 8000。”，并把焦点放到远程端口输入框。
- 添加成功后不关闭弹层：用户能马上看到本地地址；`打开`/`复制` 在行里。
- 按钮上的数字：`starting + active` 的总数；`error` 不改变数字，但按钮加警示点；`stopped` 不计。

### 6.3 状态栏与可访问性

- 按钮是真 `<button>`，`aria-haspopup="dialog"`、`aria-expanded`、`aria-label`/`title` 带数量；`0` 时也可见。
- 弹层是 `role="dialog"` 的非模态层：`aria-label="端口转发"`；打开后焦点到远程端口输入框（或第一行）；Escape 关闭并把焦点还给按钮；点击外部关闭。
- 不设遮罩，不 `inert` 终端：用户可以从弹层复制 URL 后继续在终端操作；弹层是浮层，不是页面。
- 终端计数在端口按钮右侧，是纯读数，不抢按钮的点击。
- 键盘：非模态不强制 focus trap；所有操作是按钮/链接，有可见焦点。

### 6.4 打开与复制

- `打开` 使用每行的 `scheme`：`http://127.0.0.1:<local>` 或 `https://...`；系统浏览器。
- 不做内嵌 BrowserView（MVP）；WebSocket/SSE 在系统浏览器里工作。
- HTTPS 服务是自签证书时浏览器会警告；`Host` 头是 `127.0.0.1:<local>`，某些框架（Django `ALLOWED_HOSTS`、Vite 的 host 检查）可能需要用户额外配置；UI 的说明里提一句，不尝试改写 HTTP。
- `复制` 复制完整 URL；P2 增加“复制 `ssh -L` 命令”。

### 6.5 终端链接（P2）

终端的 `WebLinksAddon` 目前把所有链接交给系统浏览器。运行 `vllm serve` / `gradio` 时打印的 `http://127.0.0.1:8000` 会打开**本机**的 8000，而不是运行时。

P2：给 `WebLinksAddon` 一个自定义 handler：

- 识别 `http(s)://(localhost|127.0.0.1):<port>`；
- 弹出/内联提示“将此端口映射到本地并打开”；
- 复用 Ports slice 的 create/start；成功后打开本地 URL；
- 对已经存在同 remote_port 的映射，直接打开；
- 不改变普通外网链接的行为。

这是使用流程上最有价值的一步：用户不需要记住端口，也不需要手动添加。

---

## 7. 安全与边界

- **本地只监听 `127.0.0.1`**，MVP 不提供 `0.0.0.0`；局域网访问作为 P2 的显式开关 + 警告。
- **远端目标默认 `127.0.0.1`**；高级字段允许运行时内其它主机/IP，但 UI 说明“会从运行时发起连接”，并记录日志。不要把它做成隐形的任意网络代理。
- 本地端口没有额外认证：访问控制由远端服务自己负责；监听在 loopback，已经排除了局域网。若远端服务无认证，任何本机进程都能访问它——这和用户直接在本机跑服务是同一风险等级。
- 不记录转发的字节内容；日志只记录映射的建立/停止/错误摘要。
- 本地端口不使用特权端口（MVP 建议 1024–65535；80/443 需要管理员权限，错误时提示）。
- 端口占用的竞态：`exclusive: true`；固定端口被占用时直接报错，建议自动分配或换端口。
- 运行时连接断开时立即关闭本地端口，避免留下一个打不通的监听器。
- 不持久化运行时 token；映射定义如果持久化，只存 host/port/scheme，不存任何凭据。

---

## 8. 测试计划

### 8.1 Phase 0：真实运行时 spike（必须先做）

1. 创建 CPU 运行时；在 VM 里 `python3 -m http.server 8000`（后台）。
2. 用 CLI 的 `ssh --proxy-mode` 作为 OpenSSH ProxyCommand，`ssh -L 18000:127.0.0.1:8000`；`curl http://127.0.0.1:18000/`。
3. 如果成功：确认 `direct-tcpip` 可用；再启动一个 Gradio/vLLM 服务，验证 HTTP + WebSocket/SSE 通过转发正常。
4. 断开 SSH，确认本地 18000 关闭；重连后重启 `-L` 正常。
5. 记录 Colab 代理的连接空闲/超时行为；现有 `ssh2` keepalive 是 20s，观察转发空闲时是否被代理断开。
6. 如果 `direct-tcpip` 被拒绝：停止 UI 投入，按 §2.1 评估 fallback。

**实测结果（2026-11-09，CPU）**

环境：Windows，应用内置 CLI 0.7.5，临时 CPU 会话 `colabdesk-port-spike`（已停止，服务端无活动会话）。

- VM 内：`python3 -m http.server 8765` 服务 `/content/port-spike.txt`，VM 内部 `urllib` 已能取到内容。
- 验证脚本走**和应用完全相同的路径**：`ws` 连 `wss://<host>/colab/ssh`，`ssh2.Client` 用 `~/.ssh/id_ed25519` 完成握手；本地 `net.Server` 监听 `127.0.0.1:62623`；每个本地连接调用 `forwardOut("127.0.0.1", srcPort, "127.0.0.1", 8765)` 并双向 pipe；本地 HTTP GET `/port-spike.txt`。
- 输出：

```
SSH_READY
LOCAL_PORT 62623
LOCAL_CONNECTION
FORWARD_OPEN
HTTP_STATUS 200
HTTP_BODY colabdesk port forwarding spike
SPIKE_OK
```

结论：

- `direct-tcpip` 可用；§2.1 的 fallback 不需要。
- 本地监听 + `forwardOut` + 远端 HTTP 的完整链路通过；这验证了设计里的主路径，不只是协议层。
- 仍需在 Phase 1/e2e/手动验收覆盖：长连接 WebSocket/SSE 的空闲行为、真实 Gradio/vLLM、应用内 `PortForwardManager`、端口冲突与连接断开。

清理：临时 CPU 会话已 `colab stop`；验证脚本已删除。

### 8.2 单元测试（`src/main/ssh/port-forward.test.ts`）

用一个假的 `ForwardingConnection`（`forwardOut` 返回回显 channel）驱动 `PortForwardManager`：

- 自动本地端口 + 双向字节：本地 `net.connect` → 写入 → 回显 → 读回。
- 固定本地端口冲突：第二个映射 `error`，第一个不受影响。
- 停止：已打开的本地连接和它的 SSH channel 一起关闭；本地端口拒绝新连接。
- `starting` 期间 stop-then-start：不开启第二个 attempt（`record.starting` 门）；这次点击记在 `pendingStart`，第一次落定后自动执行。
- accept 之后、`forwardOut` 返回之前客户端 reset：accepted socket 在打开通道前就有 `error` listener，不会成为主进程的未捕获异常。
- 运行时连接关闭：映射进入 `error`，本地端口关闭、拒绝新连接。
- 非法端口/主机被拒绝（非字符串 host、`":"`、无效 dotted quad）。
- `forget(session)` / `dispose()` 清理所有资源。

渲染侧的连接消费者规则在 `src/renderer/src/store/connection-consumers.ts`，由 workspace 的 `release` 与 ports 的 `releaseIfIdle` 共用。`ports.test.ts` 覆盖：最后一个映射停止且没有 tab 时 `sshDisconnect`；有 active 映射或有 tab 时不断开；`stopAllPorts` 停止但保留 stopped 行；`forgetPorts` 同时清空渲染层并调用主进程。

### 8.3 Render 断言（`PortsControl.test.tsx`）

- 状态栏按钮：显示数量；0 时仍可见；error 时警示点；`aria-haspopup` / `aria-expanded`；error 时无障碍名称带“有失败”。
- 点击后弹层：空状态说明“把运行时的端口映射到本机”并给示例。
- 弹层按 session 分组，当前 session 第一；没有选中 session 时新增区禁用并说明原因。
- 一行 active：显示 remote → local、本地 URL、打开/复制/停止。
- 一行 error：显示可行动原因 + 重试/删除。
- 一行 starting：显示“分配中…”，操作禁用。
- 连接未就绪：说明会先连接运行时。
- 按钮上的数量只统计 starting/active；error 不改数字但加警示点。
- 英文渲染守门：English catalog 下没有中文。

### 8.4 E2E（`tests/e2e/ports.spec.ts`）

在 mock SSH server（`src/main/e2e/runtime-server.ts`）的 `Connection` 上加：

```ts
client.on("tcpip", (accept, _reject, info) => {
  const channel = accept();
  // 证明目标端口确实传到了“服务端”
  channel.write(`remote:${info.destIP}:${info.destPort}\n`);
  channel.end();
});
```

MVP 用例（已实现）：

1. 打开 `e2e-alpha`，点击状态栏右下角的 Ports 按钮，弹层打开。
2. 在弹层里添加远程端口 `8000`，本地端口自动；添加；行变成“已映射”，显示 `127.0.0.1:<port>`；按钮数量变成 1。
3. 测试进程用 `net.connect(<local port>, "127.0.0.1")` 连接，读到 `remote:127.0.0.1:8000`；证明本地监听、SSH `forwardOut`、mock `tcpip` 三段都通了。
4. 停止；行变成“已停止”；再连接本地端口应被拒绝；按钮数量回到 0。

Phase 2 e2e 补充：关闭最后一个 tab 后映射仍可用、关闭全部标签/停止会话的端口释放、固定端口冲突的 UI 文案。MVP 用 `ports.test.ts` 覆盖连接消费者的反向规则。

跨平台：e2e 在 ubuntu/windows/macos 都跑；`net.connect` 是 Node 标准库。

### 8.5 真实账号手动验收

- vLLM / Gradio：启动服务 → 点右下角 Ports 按钮 → 添加映射 → 系统浏览器打开 → 页面、WebSocket、SSE 正常。
- 停止映射 → 浏览器刷新失败；重启映射 → 恢复。
- 关闭 app → 本地端口释放。
- 运行时连接断开 → 行显示断开原因；重连后重试成功。
- Windows + macOS 各一次。

---

## 9. 分阶段落地

### Phase 0：Spike（已完成，2026-11-09）

- 真实运行时验证 `direct-tcpip`：已通过（§8.1）。
- mock SSH server 的 `tcpip` 可用性验证：Phase 1 随 e2e 一起做。
- 不做 UI。

### Phase 1：MVP（约 3–5 天）

- `ColabSshConnection.forwardOut`。
- `PortForwardManager` + 单元测试。
- shared contract / IPC / preload / `ports` slice / 事件。
- 状态栏 Ports 按钮 + 弹层（`PortsControl`、表单、行、空/错/连接态）；不新增 `WorkspaceTab` kind。
- 活跃映射持有连接（§5.5 推荐模型）；关闭全部标签显式停止。
- e2e mock `tcpip` + spec；render 断言。
- 真实账号手动验收。

### Phase 2：流程优化（约 2 天）

- 终端 localhost 链接 → “映射并打开”。
- 复制 `ssh -L` 命令。
- 映射定义持久化 + 打开会话时自动启动（可选设置）。
- 固定本地端口冲突的自动建议。

### Phase 3：可选

- `0.0.0.0` 局域网开关（显式警告）。
- 反向转发（`remote forward`）。
- 内嵌 BrowserView 预览（安全/维护成本高，暂不推荐）。

---

## 10. 需要拍板的决策

| 决策 | 推荐默认 | 备选 |
| --- | --- | --- |
| UI 入口 | 状态栏右下角 Ports 按钮 + 弹层（已按反馈定） | Ports tab / 右栏第二面板 / 对话框 |
| 映射与连接 | 关闭弹层不停止；关闭全部标签才停止（保留行） | 关闭最后一个 tab 就停止 |
| 状态栏控件 | 更新提示（有版本时）+ 端口按钮 + 终端读数 | 端口只做只读计数 |
| 远端主机 | 默认 `127.0.0.1`，高级字段可改 | MVP 固定 loopback |
| 本地监听 | 仅 `127.0.0.1` | 提供局域网开关 |
| 本地端口 | 默认自动；可选固定 1024–65535 | 只允许自动 |
| 协议 | 每个映射 http/https，仅影响“打开” | 只生成 `host:port` |
| 持久化/自动启动 | MVP 不做；P2 加 | MVP 就做 |
| 终端链接 | P2 | 不做 |
| 复制 ssh -L | P2 | 不做 |
| 反向转发 | P3 | 不做 |

---

## 11. 验收标准

- 用户能在终端启动一个运行时内的 Web 服务，在状态栏 Ports 按钮/弹层添加映射，用系统浏览器打开本地 URL；页面和 WebSocket/SSE 正常。
- 本地端口只监听 loopback；停止/关闭会话/app 退出后端口释放。
- 端口冲突、运行时未连接、远端拒绝都有可行动文案，不出现“静默失败”。
- 复用现有 SSH 连接；不新增第二个运行时连接。
- e2e 在 ubuntu/windows/macos 全绿；单元与 render 断言覆盖状态、错误、按钮数量和弹层分组。
- 不在日志中记录转发内容或凭据。

---

## 附录 A：涉及文件

**新增**

- `src/main/ssh/port-forward.ts` — `PortForwardManager`
- `src/main/ipc/handlers/ports.ts` — IPC
- `src/renderer/src/store/slices/ports.ts` — per-session 状态
- `src/renderer/src/features/ports/PortsControl.tsx` — 状态栏按钮 + 弹层
- `src/main/ssh/port-forward.test.ts` / `src/renderer/src/features/ports/PortsControl.test.tsx` / `tests/e2e/ports.spec.ts`

**修改**

- `src/main/ssh/connection.ts` — `forwardOut`
- `src/main/ipc/register.ts` / `src/main/index.ts` — 注册与退出清理
- `src/shared/types.ts` / `api.ts` / `ipc.ts` — 契约
- `src/preload/index.ts` — bridge
- `src/renderer/src/store/types.ts` / `index.ts` / `slices/workspace.ts` — `PortsSlice`、连接消费者
- `src/renderer/src/app-shell/AppShell.tsx` — 状态栏接入 `PortsControl`
- `src/main/e2e/runtime-server.ts` — mock `tcpip`
- `src/renderer/src/i18n/locales/{zh,en}.json` — `ports.*`
- `docs/DESIGN.md` — 状态栏右侧新规则（更新提示 + 端口按钮 + 终端读数）
