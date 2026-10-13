# 打包 / 安装 / 更新机制设计

日期：2026-10-13 · 状态：待评审 · 参考实现：`D:\odyssey\orca`

---

## 0. 结论摘要

Electron 生态里"打包 + 安装 + 更新"的成熟组合只有一套被广泛验证：**electron-builder 负责产出安装包与更新元数据，electron-updater 负责运行时检查、下载与安装**。Electron 内置的 `autoUpdater` 需要自建 Squirrel 服务器，`electron-forge` 的 maker 体系没有等价的更新元数据链路，都不适合。Orca 用的就是这套。

ColabDesk 现在只做了这套里最小的一半：能产出安装包，但**完全没有更新链路**——没有 `publish` 配置，因此不发 `app-update.yml`，也不生成 `latest.yml`。而且当前配置下**一旦加上 `publish`，Windows 构建会直接失败**（原因见 §2.2）。这是本次设计要解决的核心。

三个已确认的前提决定了设计的形状：

| 前提 | 后果 |
|---|---|
| 两个平台都没有签名证书 | macOS **不做**自动更新——不是不想，是 Squirrel.Mac 在未签名应用上直接抛异常，做不到（§2.3）。Windows 未签名**可以**自动更新，是第一个跑通的平台，但这条路的寿命挂在 electron-builder v28 上（§8.6） |
| 内置运行时 190MB 继续打进安装包 | 更新能不能压到几 MB，取决于 `resources/cli` 的**字节稳定性**——这是当前 `tools/bundle-cli.mjs` 的一个真实缺陷 |
| 仓库公开、无 tag、无 release | GitHub Releases 是唯一分发渠道，GitHub-hosted runner 对公开仓库免费（含 macOS） |

交付分三阶段：**阶段 1 能发版能装，阶段 2 自动更新（Windows/Linux），阶段 3 签名到位后补全 macOS 并打开校验**。

签名不阻塞前两个阶段，但它有一条时间线：Apple Developer Program $99/年（个人可注册，无替代品），Windows 侧 Artifact Signing $9.99/月**但只对美国/加拿大的个人开放**，否则只能走 SignPath Foundation 的免费开源方案（代价是发布者显示为 SignPath Foundation）。完整取舍见 **§8**。

---

## 1. 现状

### 1.1 已有的

- `config/electron-builder.config.cjs`：Windows NSIS（x64，per-user，可选安装目录）、macOS dmg（x64+arm64）、Linux AppImage。
- `tools/bundle-cli.mjs`：用 `uv` 拉 standalone CPython 3.12 + `pip install google-colab-cli` 到 `resources/cli/`，由 `extraResources` 进包。产物 190MB（56M python + 134M site）。
- `resources/cli/manifest.json`：`{cliVersion, pythonVersion, platform, arch, bundledAt}`。
- `src/main/colab/cli.ts` 的 `resolveCli()`：override → bundled → PATH → 标准安装位置（uv tool / pip / homebrew），`readManifestVersion()` 读 `manifest.json` 的 `cliVersion`。
- `.github/workflows/e2e.yml`：typecheck + vitest + Playwright，跑在 Linux。
- 版本 `0.2.0`，公开仓库 `feifeifeimoon/ColabDesk`，**无 tag、无 release**。

### 1.2 缺的

- **没有 `publish` 配置**。`PublishManager.getAppUpdatePublishConfiguration()` 在没有 publish 配置、且 `package.json` 无 `repository` 字段时返回 `null`，于是 `app-update.yml` 不写入、`latest.yml` 不生成。装出来的应用里没有更新元数据，electron-updater 一启动就会因找不到 `app-update.yml` 失败。
- **没有 updater 代码**：`src/` 里 `autoUpdater` / `electron-updater` 零命中。
- **没有任何地方显示版本号**：`app.getVersion()` 全仓未被调用。
- **macOS 缺 zip target**：见 §2.3。
- **没有发布工作流**：CI 只有 e2e 一条。

---

## 2. 三个必须先说清楚的技术事实

这三条是设计的地基，都从本机安装的 `electron-builder@26.15.3` 源码里读出来的，不是凭印象。

### 2.1 没有 `publish` 就什么都没有

`app-builder-lib/out/publish/PublishManager.js`：

```js
const publishConfig = await getAppUpdatePublishConfiguration(packager, null, event.arch, this.isPublish);
if (publishConfig != null) {
    await writeFile(path.join(packager.getResourcesDir(event.appOutDir), "app-update.yml"), serializeToYaml(publishConfig));
}
```

`getAppUpdatePublishConfiguration` 在 publish 列表为空时会退回探测 `package.json` 的 `repository` 字段；ColabDesk 没有这个字段，于是返回 `null`。同时 `updateInfoBuilder.js:37` 的 `const currentChannel = publishConfig.channel || "latest"` 说明 `latest.yml` 也依赖同一条链路。**加 `publish` 是整件事的第一步，不是可选项。**

### 2.2 未签名 + 默认 `verifyUpdateCodeSignature` = Windows 构建失败

这是最容易踩的坑，链路如下：

`app-builder-lib/out/winPackager.js:26`：
```js
get isForceCodeSigningVerification() {
    return this.platformSpecificBuildOptions.verifyUpdateCodeSignature !== false;
}
```
默认 **true**。

`PublishManager.js:202`：
```js
if (packager.platform === Platform.WINDOWS && publishConfig.publisherName == null) {
    const publisherName = winPackager.isForceCodeSigningVerification
        ? await (await winPackager.signingManager.value).computedPublisherName.value
        : undefined;
    if (publisherName != null) publishConfig.publisherName = publisherName;
}
```

`codeSign/windowsSignToolManager.js:101`——没有证书时 `lazyCertInfo` 为 `null`，于是：
```js
const publisher = publisherName || (certInfo == null ? null : certInfo.bloodyMicrosoftSubjectDn);
if (publisher == null) {
    throw new Error("Internal error: cannot compute subject using certificate info");
}
```

调用点没有 try/catch。**结论：加了 `publish` 之后，未签名的 Windows 构建会在生成 `app-update.yml` 时抛错。必须显式写 `win.verifyUpdateCodeSignature: false`。**

这正是 Orca 给未签名 dev channel 设的值（`config/electron-builder.config.cjs:346-355`，release channel 则保留默认并配 `signtoolOptions.publisherName: 'SignPath Foundation'`）。

要诚实地说清代价：关掉之后 electron-updater 不再校验安装包的 Authenticode 签名。但在"没有证书"这个前提下本来就没有签名可校验——这不是降低安全性，是承认现状。**签名到位后必须把它打开**，这是阶段 3 的硬要求，不是可选项。

### 2.3 macOS 必须有 zip，而且必须有签名

**zip**：`electron-updater` 的 `MacUpdater` 用 `findFile(files, "zip", ["pkg", "dmg"])` 挑选产物，找不到就抛 `ZIP file not provided`。当前 mac target 只有 `dmg`，必须补 `zip`。dmg 是给人手动装的，zip 是给 Squirrel.Mac 用的，两个都要。

**签名**：这不是"Gatekeeper 多弹一次警告"的问题，而是**自动更新在未签名应用上根本不成立**。`MacUpdater` 自己不做签名校验，它把活交给原生 Squirrel.Mac；而 Squirrel.Mac 在拿到运行中应用的 designated requirement 时就会失败——`Squirrel/SQRLUpdater.m:266-274`（[源码](https://github.com/Squirrel/Squirrel.Mac/blob/master/Squirrel/SQRLUpdater.m)）：

```objc
_signature = [SQRLCodeSignature currentApplicationSignature:&error];
if (_signature == nil) {
#if DEBUG
    NSLog(@"Could not get code signature for running application, application updates are disabled: %@", error);
    return nil;
#else
    @throw [NSException exceptionWithName:NSInternalInconsistencyException
        reason:@"Could not get code signature for running application" userInfo:exceptionInfo];
#endif
}
```

未签名代码拿不到 designated requirement，于是 **release 构建在 updater 构造时直接抛异常**，没有任何绕过开关。即使绕过，`verifyUpdate:fromBundle:` 也会要求新包满足与运行中应用**同一个** SecRequirement。所以 macOS 在拿到 Developer ID 之前不做自动更新——做也做不成。

（更正一个常见说法：未签名应用不是弹"已损坏"，那是被篡改或撤销签名的表现。未签名/未公证的提示是"无法验证是否含恶意软件"，用户可以去 系统设置 → 隐私与安全性 → 仍要打开。[Apple HT102445](https://support.apple.com/en-us/102445)）

---

## 3. 190MB 运行时与差分更新

### 3.1 差分是怎么工作的，前提是什么

`NsisTarget.js:67` 确认 `differentialPackage` 默认开启：
```js
return !this.isPortable && this.options.differentialPackage !== false;
```

开启后 electron-builder 为安装包生成 `.blockmap`，`latest.yml` 里带上 `sha512` / `size` / `blockMapSize`（`NsisTarget.js:309` 的 `createBlockmap`）。更新时 electron-updater 只下载变化的块，其余复用本地已有安装包的对应块。

**这套机制的全部价值取决于字节稳定性**：同样的输入必须产出同样的字节，否则块全变，差分退化成全量下载。当前 `tools/bundle-cli.mjs` 有三处破坏它：

1. `manifest.json` 写入 `bundledAt: new Date().toISOString()`——每次构建必然不同。（`src/` 里没有任何代码读这个字段，只有 `readManifestVersion` 读 `cliVersion`，所以删掉它是零风险的。）
2. `uv pip install --target` 产出的 `RECORD` / `INSTALLER` / `direct_url.json` 含安装时间与路径；
3. 拷贝 Python 时用了 `dereference: true`，且没有清理 `__pycache__`（虽然设了 `PYTHONDONTWRITEBYTECODE=1`，但那只管本次进程）。

外加两条会削弱发布可重现性的问题：

4. `pip install google-colab-cli` **没有锁版本**——同一个 tag 的两次构建可能装到不同的 CLI；
5. `patchWindowsConsole()` 无条件执行（只判断文件内容），在 macOS/Linux 上也会改 `console.py`，尽管它是 Windows 专用 workaround。

### 3.2 设计

把"这次构建的运行时是不是变了"变成一个**显式信号**，而不是靠人记：

- `manifest.json` 去掉 `bundledAt`，改成 `runtimeHash`——对 `python/` + `site/` 全部文件内容按路径排序后取 SHA-256。它同时是字节稳定性的自检：同样的 CLI 版本 + Python 版本必须得到同一个 hash。
- `pip install` 锁到具体版本（`google-colab-cli==0.7.4`），Python 锁到 `3.12`。两个版本号进 manifest。
- 装完清理 `__pycache__`、`*.pyc`，并对 `RECORD` 做归一化（排序、去掉构建机绝对路径）。
- `patchWindowsConsole()` 加上 `isWin` 判断。
- `electron-builder.config.cjs` 里 `extraResources` 的 `existsSync` 兜底**保留给开发**，但 CI 加 `COLABDESK_REQUIRE_BUNDLED_CLI=1` 时缺 `resources/cli` 必须硬失败。否则一次疏漏就会发一个"不装 Python 也能用"这句承诺不成立的包，而且不会有人发现。

### 3.3 顺带定下的契约

NSIS 的差分只在**同一套安装方式**内有效。以下选项一旦发布就不能再改，改了老用户就只能全量下载（以及更糟的：更新后出现两份安装）：

| 选项 | 值 | 理由 |
|---|---|---|
| `oneClick` | `false` | 允许选安装目录，也让"安装中"是一个可见的步骤 |
| `perMachine` | `false` | 免 UAC；CLI 的状态本来就在用户目录下 |
| `allowToChangeInstallationDirectory` | `true` | 已有行为 |
| `differentialPackage` | `true`（默认） | 显式写下，防止被"优化"掉 |
| `deleteAppDataOnUninstall` | `false`（默认） | **必须显式写**：卸载不能删掉用户的用量历史、SSH 配置与授权令牌（`app.getPath("userData")` 下的东西） |

`artifactName` 也要一次定好并保持不变，因为 `latest.yml` 里记的是文件名：Windows `colabdesk-setup-${version}.${ext}`，macOS `colabdesk-${version}-${arch}.${ext}`（**必须带 `${arch}`**，两个架构会撞名）。当前是默认模板，趁没有存量用户先固定下来。

---

## 4. Orca 是怎么做的

已经完整读过源码，这是事实陈述，不是印象。

### 4.1 打包与分发

- `electron-builder@26`，配置在 `config/electron-builder.config.cjs`（709 行，一份配置，无 Forge）。
- `publish: { provider: 'github', owner: 'stablyai', repo, releaseType }`——**构建期**用 github provider 上传。
- 运行期**另设** generic feed（`src/main/updater/updater-setup.ts:155-160`）：
  ```js
  autoUpdater.setFeedURL({ provider: 'generic', url: 'https://github.com/stablyai/orca/releases/latest/download' })
  ```
  这样运行时只是一次静态 GET `latest.yml`，完全不碰 GitHub API（无速率限制、无需 token）。
- 版本号由 CI 算出来写进 `package.json`（`npm version`），再打 `v<version>` tag；mac 的自动更新额外需要 zip（`target: [dmg, zip]`），win 用 NSIS。
- 发布是 **draft → 校验 → published**：`release-cut.yml` 建 draft，构建矩阵上传，`verify-release-required-assets.mjs` 校验每个 manifest 与安装包都在，最后一个 job 才 `gh release edit --draft=false`。还有 `release-policy.yml` 在 release 事件上复核，越权的发布会被重新 draft 掉。
- dev 通道（hourly/daily/adhoc）各自一个**独立仓库**，因为 GitHub 的 releases atom feed 只暴露最新 10 条。
- macOS 签名/公证收在 `isMacRelease` 开关后（`hardenedRuntime` / `notarize` / `forceCodeSigning` 全部由它控制），本地构建走 ad-hoc identity `'-'`。CI 侧有 `verify-macos-release-env.mjs` 做 fail-fast：五个签名环境变量缺一个就退出 1。
- Windows 不由 electron-builder 签名，而是打包后经 SignPath 两段式签名，签完再回填 `latest.yml` 的 `sha512` / `size` / `blockMapSize`。

### 4.2 更新运行时

- `electron-updater@6.8.9`，代码在 `src/main/updater/`，**一个文件一个关注点**地拆成十多个类（`updater-state` → `updater-status` → … → `updater-setup`）。
- 关键设置（`updater-setup.ts`）：`autoDownload = false`（**检查自动、下载必须用户点**）、`autoInstallOnAppQuit` / `autoRunAppAfterInstall` 随交互模式开、`disableDifferentialDownload = false`、`autoUpdater.logger` 接到诊断日志。
- 有一句注释值得原样照办：
  > `Security: never re-add a verifyUpdateCodeSignature override — a no-op disables electron-updater's built-in Authenticode check and accepts any installer.`

  我们情况相反：因为我们没有证书，只能在**配置里**关掉它（§2.2），而不是在运行时改。这条纪律要说清楚。
- 节奏常量（`updater-state.ts`）：检查 `24h`；失败重试 `1h`，指数退避到 `6h` 封顶，任何一次成功检查清零；`QUIT_AND_INSTALL_DELAY_MS = 100`（给渲染层 flush 的机会）；检查挂 `powerMonitor 'resume'` 与 `app 'browser-window-focus'`（仅在陈旧时）；`lastUpdateCheckAt` 持久化，跨重启不重复查。
- 状态契约是一个 discriminated union（`src/shared/update-status-types.ts`）：`idle | checking | available | not-available | downloading{percent} | downloaded | error`，主进程通过 `updater:status` 推给渲染层。
- 安装：`quitAndInstall()` 延迟 100ms 后调原生 `quitAndInstall`，并**上一道 20 秒强制退出看门狗**——因为 ShipIt/NSIS 需要进程真的退干净才能替换文件，而 teardown 可能卡住。
- UI 落三处：菜单项 `Check for Updates…`、设置页的 Updates 一节、以及一张 `UpdateCard`；另外状态栏有一段。卡片侧的交互是：用户点「更新」→ 下载 → **下载完成后卡片自动触发 `quitAndInstall`**；从设置页进来的路径则要求用户再点一次「重启以更新」。
- 没有"自动检查"开关，也没有强制升级闸门。`autoDownload = false` 与 24h 是写死的策略。

### 4.3 该抄什么、不该抄什么

**抄（这些是通用的，跟 Orca 的规模无关）**

1. `autoDownload = false` + 用户确认下载 + 下载完提示重启的交互（§5.4）。
2. 共享的 `UpdateStatus` union 作为主↔渲染的唯一契约，走事件推送，而不是渲染层去轮询。
3. publish 用 `provider: github`。**这一点抄一半**：Orca 是"构建期 github 上传 + 运行期用 generic feed 指 GitHub 的静态下载路径"，因为它要控预发布和多通道。我们没有这个需求，而 **Multica 证明 `provider: github` 全程够用**（§8.4）——`app-update.yml` 自给自足，不需要任何运行期 `setFeedURL`。少一个模块，少一处会在更新时出错的地方。generic 作为备选记在 §5.2。
4. 24h 检查 + 失败退避（1h 起、6h 封顶、成功清零）。`lastUpdateCheckAt` 的持久化不抄，理由见 §5.3。
5. `quitAndInstall` 的延迟 + 强制退出看门狗。
6. `!app.isPackaged` 直接 return，dev 永不参与更新。
7. draft → 校验资产 → publish 的发布闸门；发布是不可逆的外向动作，值得独立一个 job。
8. fail-fast 的签名环境变量校验（阶段 3 用）。
9. **更新路径的端到端测试**（Orca 有 `win-update-e2e.yml` / `win-update-survival-e2e.yml` / `win-crash-survival-e2e.yml`）。这条最容易被省，也最值得留（§6.2）。
10. updater 的模块按关注点拆分，而不是一个大文件（与本仓"按领域概念命名"的约定一致）。

**不抄（我们的规模不支持，属于 YAGNI）**

- 独立仓库的多通道（hourly/daily/adhoc）——没有这个需求。
- 读 releases atom feed + HEAD 探针 + 把 feed 钉到具体 tag（`updater-release-feed.ts`，一百多行）。那是为了在"预发布 + 多通道 + 可回退到指定构建"之间选择才需要。我们用 `/releases/latest/download` 就够，代价是**只能走稳定版**——预发布不会出现在 `latest` 里。这是有意的取舍。
- 本地构建选择（mac 专用，另一个 loopback feed server）。
- nudge 活动、telemetry span、crash breadcrumb。
- Linux deb/rpm 的 root 包安装与 polkit 恢复分类（我们只有 AppImage）。
- Homebrew cask 自动化（阶段 3 可选）。
- 强制升级 / 最低版本闸门——Orca 也没有，我们也不做。
- 自动更新开关设置——Orca 也没有。固定策略比一个没人改的开关更好解释。

---

## 5. 架构

### 5.1 分发与版本

- **渠道**：GitHub Releases，唯一渠道。公开仓库 + GitHub-hosted runner 免费（含 macOS）。
- **版本真源**：git tag `v0.3.0`。CI 断言 `package.json.version === tag` 去掉 `v`，不一致就失败。
  > 与 Orca 不同。Orca 是 CI 算版本号再写回 `package.json` 并自动提交（`release-cut.yml` 的 `npm version` 那一段），那是它需要维护 rc/patch/minor/major 四种切法加 RC 历史的结果。我们手工定版本号，tag 就是真源，少一层状态。
- **发布流程**（`.github/workflows/release.yml`）：
  1. 触发：`push` tag `v*.*.*`。
  2. matrix：`windows-latest` / `macos-latest`，各自跑 `npm run bundle:cli && npm run build && electron-builder --<platform> --publish never`。**`bundle:cli` 必须各平台各跑一次**——产物是平台相关的（`python/python.exe` vs `python/bin/python3`，manifest 里有 `platform` / `arch`），不能交叉编译。
  3. 各平台上传 artifact；同时建一个 **draft** release 并上传。
  4. 一个独立 job 校验必需资产齐全：每个 `latest*.yml`、每个安装包、每个 `.blockmap`。缺任何一个 → 失败，draft 留着。
  5. 全绿后最后一步 `gh release edit --draft=false`。

  先 draft 再发布的理由：`/releases/latest/download` 是个**自动生效**的更新源，一个只有半个平台的 release 一旦 published，那个平台的用户就会拿到 404 的更新检查。

- **第一个带 `app-update.yml` 的版本是更新链路的地板。** 在那之前发布的安装包里没有这个文件，electron-updater 找不到配置，**永远无法自动更新到任何版本**。现在没有存量用户，所以这条不造成损失——但它意味着阶段 1 的那次发布必须是"值得让人手动重装一次"的版本，否则第一批用户就被永久留在了地板上。

### 5.2 打包配置的改动

`config/electron-builder.config.cjs`：

- 加 `publish: [{ provider: "github", owner: "feifeifeimoon", repo: "ColabDesk", releaseType: "release" }]`。
  > **必须是显式写死的字面量，不能让它从 `package.json` 的 `repository` 推断。** SakuraCat 就是这么翻车的：它的 `app-update.yml` 里 owner/repo 是 `electron-react-boilerplate/electron-react-boilerplate`（§8.4），脚手架默认值没改就发出去了，而且没有任何东西报错。所以 §5.2 之外还要一条**契约测试**把这个字面量钉住——Orca 的 `electron-builder-config.test.mjs` 就是干这个的。
  >
  > 备选：运行期改用 `provider: generic` + `https://github.com/feifeifeimoon/ColabDesk/releases/latest/download`（Orca 的做法）。好处是运行时完全不碰 GitHub API、不受速率限制。代价是多一个模块、多一处可能出错。**当前不需要，等真要控制预发布通道时再换。**
- 加 `win.verifyUpdateCodeSignature: false`，并写清楚"这是未签名状态的临时值，签名到位后必须删掉"（§2.2）。
- mac `target` 补 `zip`（§2.3），artifactName 带 `${arch}`。
- 固定 `artifactName` 与 §3.3 表里的 nsis 选项。
- `extraResources` 的兜底加 `COLABDESK_REQUIRE_BUNDLED_CLI=1` 时的硬失败分支。
- `npm run package:win` / `package:mac` 保留为本地打包入口，但**不再是发布路径**——发布只走 CI，因为只有 CI 上有确定的 uv / Python / 依赖。

### 5.3 主进程：`src/main/updater/`

按关注点拆，与 Orca 的粒度一致，但只保留我们需要的：

| 文件 | 职责 |
|---|---|
| `updater.ts` | 组装与对外方法：`setupUpdater` / `checkForUpdates` / `downloadUpdate` / `quitAndInstall` / `getUpdateStatus` |
| `updater-feed.ts` | 只做一件事：E2E 时把 feed 覆盖到本地桩（§6.1）。**生产路径不碰它**——`app-update.yml` 已经够用（§5.2），"为什么用 github provider 而不是 generic"这个决定写在打包配置的注释里，不在这里 |
| `updater-events.ts` | electron-updater 的七个事件 → `UpdateStatus` 的映射，全仓唯一一处 `broadcast(EVENTS.updateStatus)` |
| `updater-schedule.ts` | 24h 计时器、1h→6h 退避、resume/focus 补查 |
| `updater-install.ts` | `quitAndInstall`：去重、100ms 延迟、20s 强制退出看门狗 |

要点：

```ts
if (!app.isPackaged) return;          // dev 永不参与更新
if (process.platform === "darwin") return;  // 见下：签名到位前 mac 不参与
autoUpdater.autoDownload = false;     // 检查自动，下载要用户点
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.autoRunAppAfterInstall = true;
autoUpdater.disableDifferentialDownload = false;
autoUpdater.logger = <接到应用日志>;
```

**macOS 必须是一行显式 return，而不是"界面上不显示更新按钮"。** 未签名时更新链路走通了也装不上（§2.3），让它运行只会在用户机器上留下一堆失败的检查与半截的下载。阶段 3 拿到证书时删掉这一行。

**不做 `lastUpdateCheckAt` 持久化。** Orca 要持久化是因为它还要维护 nudge id、preflight 回退、检查提升（后台检查被用户点击"提升"为用户发起）那一整套状态机，跨重启的一致性才有意义；我们只是"别查太勤"，一个进程内 24h 计时器加"每次启动查一次"就够了——一次检查是一次静态 GET，成本可忽略。而且主进程现在**没有**任何设置存储：`preferences` slice 是渲染层的 `localStorage`（`store/slices/preferences.ts` 顶部注释写得很清楚），主进程读不到。为一个数字新造一层主进程设置存储不值得。将来真发现启动太频繁，再写进 `userData` 下的一个小 JSON——`usage-history.jsonl` 已经是这个位置的先例。

接线位置：`src/main/index.ts` 的 `app.whenReady()` 里，窗口创建之后调 `setupUpdater()`。

### 5.4 渲染层

**契约**（`src/shared/`）：

```ts
// types.ts
export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking"; userInitiated?: boolean }
  | { state: "available"; version: string; releaseUrl?: string | null }
  | { state: "not-available"; userInitiated?: boolean }
  | { state: "downloading"; percent: number; version: string }
  | { state: "downloaded"; version: string }
  | { state: "error"; message: string; userInitiated?: boolean };

// ipc.ts
IPC.updateCheck / IPC.updateDownload / IPC.updateInstall / IPC.appVersion
EVENTS.updateStatus

// api.ts
ColabDeskApi 增加 updateCheck() / updateDownload() / updateInstall() / appVersion() / onUpdateStatus()
```

比 Orca 少了：changelog 富文本、nudge、Linux root 包恢复、本地构建源、`source` 判别。发布说明只给一个跳转链接。

**状态**：新增 `store/slices/update.ts`，订阅 `EVENTS.updateStatus` 存 `status` 与 `dismissedVersion`。

> selector 纪律（AGENTS.md）：状态栏那一段只订阅 `state.update.status.state` 这类**基本类型**。`downloading` 的百分比由 `UpdateCard` 自己订阅——它只在设置页里挂着，而状态栏在整棵树的根上，让百分比穿透到根会让每次进度回调重渲染整个工作台。

**UI 三处**：

1. **设置页新增一节**，`SectionId = "about"`，放在「运行时」分组下，排在"运行环境"之后。内容：应用版本（`app.getVersion()`，目前全仓没用过）、更新状态、一个按钮（检查 / 下载 / 重启以更新，随状态变）、发布说明链接。样式用现成的 `Panel` / `PanelRow` / `Button`。
2. **`features/updates/UpdateCard.tsx`**：可用 / 下载中 / 已下载 / 错误四态。沿用 Orca 的交互——从卡片发起的下载完成后自动触发 `quitAndInstall`，从设置页发起的要求用户再点一次。错误态**必须给一句可操作的话**（本仓已有的 `lib/failure.ts` 就是干这个的）。
3. **状态栏一段**，只在 `available` / `downloaded` 时出现，点击进设置页的 about 节。按 AGENTS.md 的要求，这是新的界面规则，要补回 `docs/DESIGN.md`。

---

## 6. 验证

### 6.1 探针

`COLABDESK_E2E_MOCK=1` 已经能把主进程切成桩模式。给 updater 加一个：

- `COLABDESK_E2E_UPDATE_FEED` 指向 `src/main/e2e/` 起的本地静态服务（提供一份 `latest.yml` 与一个假安装包），让"检查 → 有新版 → 下载 → 已下载"四态能在 Playwright 里走完。
- **断言只写在用户看得见的地方**：设置页 about 节的文案、按钮是否可点、状态栏那段的出现与消失。不读 store。
- 桩对本仓的约定是"未实现的子命令直接失败"。同一条纪律适用于 updater：**未接的更新相关通道必须显式失败，不能静默通过。**

### 6.2 设计规则的渲染断言（`*.test.tsx` + `renderToStaticMarkup`）

- `downloading` 时安装按钮不可点。
- `error` 态必须带一句可操作的话，不能只显示"更新失败"。
- 未签名平台的文案不能承诺自动更新（macOS 在阶段 2 必须说清"请手动下载"，而不是给一个点了没用的按钮）。
- `dismissedVersion` 等于当前可用版本时卡片不渲染。

### 6.3 必须人工做一次的真机验证

CI 覆盖不到，且这四条的失败模式都很安静：

1. 装 `0.2.0`（未签名），手搓一个 `0.2.1` release，走完检查 → 下载 → 重启安装 → 起来是 `0.2.1`。
2. **差分是否真的生效**：看 electron-updater 日志里下载的字节数，对比安装包体积。如果等于全量，说明 §3.2 的字节稳定化没做到位。
3. **覆盖安装后 `resources/cli` 还在**，且能开终端——`extraResources` 在更新后是否被正确替换，只有装了才知道。
4. macOS：dmg 装完能不能打开（quarantine 流程），以及卸载后用户数据是否还在。

---

## 7. 分阶段

### 阶段 1：能发版、能装（不碰更新）

- electron-builder 配置：`publish`、`win.verifyUpdateCodeSignature: false`、mac 补 `zip`、固定 `artifactName` 与 nsis 选项。
- `tools/bundle-cli.mjs` 字节稳定化：去 `bundledAt`、加 `runtimeHash`、锁 CLI 与 Python 版本、清 `__pycache__` / 归一化 `RECORD`、`patchWindowsConsole` 加 `isWin` 判断。
- `.github/workflows/release.yml`：tag → 双平台构建 → draft → 校验资产 → publish。
- **打包配置的契约测试**（照 Orca 的 `electron-builder-config.test.mjs`）：断言 publish 的 owner/repo 是写死的字面量而不是推断来的、`verifyUpdateCodeSignature` 是 `false`、mac target 含 `zip`、artifactName 模板带 `${arch}`、`deleteAppDataOnUninstall` 没被打开。这几条都是"改错了不报错、发出去才发现"的类型——SakuraCat 就是活例（§8.4）。
- 应用里显示版本号（about 节的最小版本：一个 `PanelRow`）。
- **验收**：从一个 tag 能出一条 release；Windows 安装包能装、能开终端；mac dmg 能拉开。

### 阶段 2：自动更新（Windows + Linux）

- `src/main/updater/` 五个模块 + 契约 + update slice + about 节完整版 + UpdateCard + 状态栏那段。
- 主进程里那行 `if (process.platform === "darwin") return`——mac 在阶段 3 之前不参与更新。
- E2E 桩 feed 与渲染断言。
- **验收**：真机从阶段 1 那个版本升到下一个版本，差分生效（§6.3 的 1、2、3）。

### 阶段 3：签名到位后补全

选哪条签名路径、各自的门槛和代价，见 **§8**。两个平台可以分开推进，互不阻塞：

- **Windows 签名**：`verifyUpdateCodeSignature` 恢复默认（打开）、设 `signtoolOptions.publisherName`、CI 里签名后回填 `latest.yml` 的 `sha512` / `size` / `blockMapSize`。
- **macOS 签名 + 公证**：`hardenedRuntime` + `notarize` + entitlements + `forceCodeSigning` 全部收在一个开关后（照 Orca 的 `ORCA_MAC_RELEASE`），开关打开时走 `verify-macos-release-env.mjs` 式的 fail-fast；主进程里那行 `process.platform === "darwin"` 的 return 这时候删掉，macOS 自动更新才开。
- 可选：Homebrew cask。

---

## 8. 签名

阶段 1、2 都不需要签名——Windows 未签名能装、能自动更新。签名的意义是"少吓用户一次"和"macOS 能不能做更新"，是独立的第三条线。

### 8.1 三条路

**A. 什么都不做**（阶段 1、2 的状态）
- Windows：用户看到 SmartScreen「未识别的应用」警告，可以「更多信息 → 仍要运行」绕过（微软自己的策略文档写明默认就是允许绕过的：「By default, Microsoft Defender SmartScreen allows users to bypass warnings」，[available-settings](https://learn.microsoft.com/en-us/windows/security/operating-system-security/virus-and-threat-protection/microsoft-defender-smartscreen/available-settings)）。但信誉是按文件哈希与证书累积的，未签名的包每次都从零开始，永远弹。
- macOS：用户必须去 系统设置 → 隐私与安全性 → 仍要打开；自动更新完全不成立（§2.3）。
- 代价是诚实说清就没事：README 里写怎么绕过。

**B. SignPath Foundation（免费，开源项目专用）**

[条件](https://signpath.org/terms.html)比"是个开源项目"严格得多：OSI 认可许可且**不能有商业双授权**、**不能含非开源组件**、活跃维护、必须是发布形态、全体成员在 SignPath 和代码仓库上开 MFA、要有 Authors / Reviewers / Approvers 的正式角色划分、**每次签名请求都要人工审批**、主页必须有一节「Code signing policy」并原样包含 *"Free code signing provided by SignPath.io, certificate by SignPath Foundation"*。

最要紧的一条：**证书签发给 SignPath Foundation，也就是说"发布者"是他们，不是你。** Windows 上用户看到的发布者是 SignPath Foundation。Orca 走的就是这条（它 MIT 许可、背后是 Lovecast Inc.，配置里 `signtoolOptions.publisherName: 'SignPath Foundation'`）。

> ColabDesk 是 Apache-2.0 公开仓库，形式上符合。但有一个需要申请时确认的点：我们捆绑了内置 CPython 与 google-colab-cli，「无非开源组件」这条对**捆绑的运行时**怎么算，SignPath 的措辞留了后手——他们「reserve the right to require that signed packages only include signed program and library files in the future」。这是一条真实的不确定性，不是形式问题。

**C. 自己买证书**

Windows 侧唯一对个人友好的选项是 **Artifact Signing**（原名 Azure Trusted Signing，2026 年已改名）。**它的地理限制是决定性的**——公开信任证书只对美、加、欧盟、英、澳、新西兰、日、韩、新、瑞士、挪、以的组织开放，**个人开发者必须在美国或加拿大**（[quickstart](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart)）。中国大陆不在名单内，这条对我们可能直接用不了。

传统 CA 的 OV/EV 证书要求组织验证（营业执照等），个人拿不到；DigiCert OV 一年 $696–996、EV $972–1272。

macOS 侧只有一条路：**Apple Developer Program，$99/年，个人身份即可注册，不需要公司**（[enroll](https://developer.apple.com/programs/enroll/)）。没有替代品——公证必须由 Apple 签发。

### 8.2 准入与价格

| 选项 | 价格 | 个人（无公司）可用？ | 买到什么 |
|---|---|---|---|
| Apple Developer Program | $99/年 | **可以**（个人 / 个体经营者，不需要 D-U-N-S） | Developer ID 证书 + 公证；macOS 自动更新的**唯一**前提 |
| Artifact Signing（原 Azure Trusted Signing） | Basic **$9.99/月**（含 5000 次签名），Premium $99.99/月 | 可以，**但限美国 / 加拿大** | 微软托管的 Authenticode 证书，链是 Microsoft ID Verified |
| SignPath Foundation | **免费** | 是（限开源项目） | OV 证书，但**发布者是 SignPath Foundation** |
| DigiCert OV | $696–996/年 | 否（要组织验证） | 完整 OV 链 |
| DigiCert EV | $972–1272/年 | 否 | EV 链 |
| Linux AppImage | 不需要 | — | 不存在系统级闸门，GPG 签名是可选的 |

一个要破掉的迷思：**「EV 证书立刻有 SmartScreen 信誉」在 2026 年的微软文档里查不到任何依据。** 能证实的只有"证书级信誉"这一机制存在（[SmartScreen 文档](https://learn.microsoft.com/en-us/windows/security/operating-system-security/virus-and-threat-protection/microsoft-defender-smartscreen/)）。别为这句话多花一倍的钱。

### 8.3 别人是怎么做的

对每个应用**直接解析它当前发布的安装包的 Authenticode 证书链**得到的结论，不是看文档：

| 应用 | Windows | macOS |
|---|---|---|
| VS Code | 微软自己的企业 PCA（走 Azure Pipelines + Inno Setup，**不用 electron-builder**） | Developer ID + 公证，自写 `build/darwin/sign.ts` 调 `@electron/osx-sign`，每个 helper 单独的 entitlements |
| Obsidian | **Artifact Signing**（证书字段 `Microsoft ID Verified CS AOC CA 04`，有效期 3 天——这是它的指纹） | 未验证 |
| Notion | **Artifact Signing**（同样是 3 天有效期的 Microsoft ID Verified 链） | 未验证 |
| Signal Desktop | **GlobalSign EV**，并做证书指纹 pinning（`certificateSha1`） | Developer ID + 公证 |
| Bitwarden | 两条路都支持：`ELECTRON_BUILDER_SIGN=1` 时用 azuresigntool，否则用本地 pfx | Developer ID + 公证 |
| Joplin | **SSL.com OV**，用 eSigner 云签名（不落私钥） | `@electron/notarize`，走 `afterSign` |
| Standard Notes | **Sectigo EV**（Proton AG） | `afterSign` 里公证 |
| Slack / Discord | DigiCert OV 级 | 未验证 |
| Hyper | DigiCert OV（叶子已过期，靠时间戳维持有效） | electron-builder |

三个可操作的结论：

1. **大厂都签名**，抽样里每一个 Windows 产物都有有效的 Authenticode 签名。
2. **electron-builder 的签名链路是标准做法**，只有 VS Code 因为体量自己造了轮子。
3. **Obsidian 和 Notion 选了 Artifact Signing**，说明这条路（在准入地区内）是当前对新项目最省事的：不用管私钥、不用管 HSM、$9.99/月。

### 8.4 这台机器上就装着五个样本

上面那张表是远程调查，下面这张是**直接读本机已安装应用的 `resources/app-update.yml` 与 PE 签名**得到的——同一台机器，同一套 Windows，比任何文档都硬：

| 应用 | Electron? | 安装方式 | Windows 签名 | 更新机制 |
|---|---|---|---|---|
| **Multica**（52.6k star） | 是 | NSIS（平铺目录 + `Uninstall Multica.exe`） | **NotSigned** | electron-updater，`provider: github` → `multica-ai/multica` |
| **Pebrel**（3.3k star） | **否**（Rust / GPUI） | Inno Setup（`unins000.exe`）+ 便携 zip + Scoop | **NotSigned** | 自研，**仅 Windows** |
| Orca | 是 | NSIS | **Valid**，`CN=SignPath Foundation` | electron-updater，github provider + 运行期 generic feed |
| Notion | 是 | — | **Valid**，`Notion Labs, Inc.` | `provider: generic`，自建 CDN `desktop-release.notion-static.com` |
| Termius | 是 | — | **Valid**，`Termius Corporation`（旧证书是 `Crystalnix Limited`，两个都在 `publisherName` 里） | `provider: s3`，私有桶 |
| SakuraCat | 是 | — | — | `provider: github` → **`electron-react-boilerplate/electron-react-boilerplate`** |

**Multica 是最贴近 ColabDesk 的先例**：52.6k star 的 Electron 应用，Windows **未签名**，`app-update.yml` 里**没有 `publisherName`**，靠 `provider: github` 直接把自动更新跑起来了。这证明 §5 的方案在真实世界里成立，而且不是只有小项目在跑。它同时还发一个独立的 `multica-cli-*` 包和 `checksums.txt`——和我们的"应用 + 内置 CLI"结构一样。

**Pebrel 是另一种做法的完整样本**（Rust/GPUI，用不了 electron-updater，所以自研）。它的取舍几乎就是我给 ColabDesk 的推荐：

- Windows 用 Inno Setup 而不是 NSIS，另外给**便携 zip** 和 **Scoop bucket** 两个渠道；
- macOS 是 **ad-hoc 签名、不公证**，并在 `docs/INSTALL.md` 里直说"可能需要 系统设置 → 隐私与安全性 → 仍要打开"，同时补上两句成熟的判断——"**不要全局关掉 Gatekeeper**"、"Developer ID/公证构建会在 release notes 里明确标注，那条路需要维护者的 Apple 凭证，缺了就直接失败而不是退回 ad-hoc"；
- 自动更新**只做 Windows**，README 里写明 Linux/macOS 不支持自动更新安装。

**SakuraCat 是一个值得记下的真实事故**：它的 publish 配置指向 `electron-react-boilerplate/electron-react-boilerplate`——脚手架默认值没改就发出去了，而且**没有任何东西报错**。这正好印证 §2.1 说的"publish 配置会从 `package.json` 的 `repository` 自动推断"，以及错误配置是静默的。对 ColabDesk 的教训：`publish` 必须显式写死，并且要有断言把它钉住（Orca 就有 `electron-builder-config.test.mjs` 这类契约测试）。

顺带一个观察：这台机器的 `%LOCALAPPDATA%` 下有 **10 个 `*-updater` 目录**（`@multicadesktop`、`antigravity`、`bitbrowser`、`notion`、`orca`、`sakuracat`、`termius`、`@deepseek-aidsh-desktop`、`@opencode-aidesktop`、`@zcodedesktop`）。`*-updater` 是 electron-updater 的缓存目录命名约定，也就是说这台机器上十个 Electron 应用全都用 electron-updater——它就是这个领域的默认答案，没有第二个候选。

### 8.5 对 ColabDesk 的推荐

- **Windows**：先确认地理位置这一关。在美/加 → **Artifact Signing**，$9.99/月，最正规，还能顺带解掉 §8.6 的倒计时。不在 → **SignPath Foundation**，接受"发布者是 SignPath Foundation"这个代价（Orca 接受了）。两条都走不通 → 维持未签名，并把绕过步骤写进 README——**Multica 就是这么干的，而且它有 52.6k star**（§8.4）。
- **macOS**：$99/年，没有替代方案。想清楚要不要覆盖 mac 用户再决定；如果决定要，它同时解锁了"不再需要教用户去隐私与安全性里点仍要打开"和自动更新两件事。
- 两者互不依赖，可以先只有 Windows 签名。

### 8.6 倒计时：未签名的 Windows 自动更新有保质期

`electron-updater` 当前在 `app-update.yml` 里没有 `publisherName` 时的行为（[NsisUpdater.ts](https://github.com/electron-userland/electron-builder/blob/master/packages/electron-updater/src/NsisUpdater.ts)）：

```ts
publisherName = (await this.configOnDisk.value).publisherName
if (publisherName == null) {
  this._logger.warn(
    "Signature verification of the downloaded update was skipped because no publisherName is present in app-update.yml. " +
    "Sign your build so electron-builder can derive publisherName from the code signing certificate automatically, or set win.sign.publisherName explicitly. " +
    "This fail-open behavior is deprecated: electron-builder v28 will treat a missing publisherName as a verification failure (fail-closed)."
  )
  return { response: "success" }
}
```

翻译成对我们的约束：**未签名的 Windows 自动更新现在能用，但等到 electron-builder v28 就变成"校验失败"，装不上。** 我们锁在 26.15.3。

这意味着两件事：

1. **不要在没有签名的情况下升 electron-builder 的大版本。** 升到 v28 之前必须先有 `publisherName`（也就是先签名）。
2. 在这之前发布的未签名版本，将来升级到 v28 构建后，收到再下一个更新时会失败——除非那时签名已经到位。**这是"地板"的第二层**，和 §5.1 里"第一个带 `app-update.yml` 的版本是地板"是两回事，但叠加起来说明：签名这件事不该拖太久。

另外两个细节值得记下：`NsisUpdater` 在**每次启动时会重新校验已缓存安装包的签名**才会安装；而校验被跳过时，`latest.yml` 里的 sha512 是唯一的完整性防线。

---

## 9. 未决与风险

- **需要确认**：ColabDesk 的实际所在地是否落在 Artifact Signing 的准入地区内（§8.1）。这一条决定 Windows 签名走 $9.99/月还是走 SignPath 免费方案。
- **需要确认**：SignPath Foundation 对"捆绑的内置 CPython + google-colab-cli"是否算「非开源组件」（§8.1）。申请时问清楚，不要假设。
- **风险**：`bundle:cli` 依赖 `uv` 从 GitHub / PyPI 拉 190MB。本机到 GitHub 的下载是间歇性失败的，CI 侧同样可能抖。阶段 1 的缓解是固定 Python 版本 + 让失败显式退出；如果实际频繁抖，再考虑把 `resources/cli` 按（CLI 版本 + Python 版本 + 平台）做成 release asset 缓存。**不阻塞第一版。**
- **风险**：`latest.yml` 引用的文件名、以及 §3.3 表里的 nsis 选项，一旦有存量用户就是不可逆的。趁现在没有存量用户先定死。
- **观察项**：阶段 2 上线后，如果差分实际效果不好（比如每次都要下 190MB），回头再考虑"运行时包独立更新"那条路——`manifest.json` 里的 `runtimeHash` 正是为那一天留的口子。
