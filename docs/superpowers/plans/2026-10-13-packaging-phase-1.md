# 打包 · 阶段 1：能发版、能装 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 ColabDesk 能从一个 git tag 产出一条完整的 GitHub Release（Windows NSIS + macOS dmg/zip），并且打出来的包里有更新元数据、内置运行时字节稳定、应用里能看到自己的版本号。

**Architecture:** 三块互不依赖的改动。① `tools/bundle-cli.mjs` 从"能跑就行"变成"同样输入产出同样字节"，并算出一个 `runtimeHash` 作为自检；② `config/electron-builder.config.cjs` 修掉三处会让构建失败或让更新链断裂的配置；③ 新增 `release.yml` 走 tag → 校验版本 → 建 draft → 双平台构建上传 → 校验资产 → 发布。**本阶段不写任何更新代码**——那是阶段 2。阶段 1 的产出是"能装、能发版、且发布物里有 `app-update.yml` / `latest.yml`"。

**Tech Stack:** electron-vite 5 / electron-builder 26.15.3 / Electron 44 / vitest 5 / GitHub Actions / uv（standalone CPython）

**依据：** [`docs/superpowers/specs/2026-10-13-packaging-install-update-design.md`](../specs/2026-10-13-packaging-install-update-design.md) 的 §2、§3、§5.1、§5.2、§7 阶段 1。

## Global Constraints

- **appId** `com.colabdesk.app`，**productName** `ColabDesk`。
- **版本真源是 git tag**：`v0.3.0` ↔ `package.json.version === "0.3.0"`。CI 断言两者相等，不一致就失败。
- **publish 是写死的字面量**：`{ provider: "github", owner: "feifeifeimoon", repo: "ColabDesk", releaseType: "release" }`。**不得依赖 `package.json` 的 `repository` 字段推断**（SakuraCat 事故，spec §8.4）。
- **`win` 下不设 `verifyUpdateCodeSignature`**（spec §2.2）。它在未签名时是空操作，有了证书后却会关掉更新签名校验——两头都不该要。契约测试反过来钉住这一点。
- **nsis 契约**（一旦发布不可更改，spec §3.3）：`oneClick: false`、`perMachine: false`、`allowToChangeInstallationDirectory: true`、`differentialPackage: true`、`deleteAppDataOnUninstall: false`。
- **artifactName**：Windows `colabdesk-setup-${version}-${arch}.${ext}`；macOS `colabdesk-${version}-${arch}.${ext}`。**必须含 `${arch}`**（两个架构会撞名）。
- **mac target 是 `dmg` + `zip`**，arch `x64` + `arm64`。`zip` 是 Squirrel.Mac 唯一认的产物（spec §2.3）。
- **内置运行时**：Python `3.12`，CLI `google-colab-cli==0.7.4`。两个版本都写进 `manifest.json`。
- **注释和 commit message 一律英文**；设计文档与对话用中文。
- **禁止** `helpers` / `utils` / `common` / `misc` 这类文件名。
- **`.mjs` 测试放工具旁边**（`tools/`、`config/`），**`.ts`/`.tsx` 测试放 `src/` 里源码旁边**。
- 验证命令（每次改完都要能过）：`npm run typecheck` · `npm test` · `npm run build` · `npm run e2e`（界面改动必须跑）

---

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `config/vitest.config.ts` | 修改 | include 增加 `config/**/*.test.mjs` 与 `tools/**/*.test.mjs` |
| `tools/runtime-hash.mjs` | 新建 | 纯函数：对一个目录树算确定性 SHA-256 |
| `tools/runtime-hash.test.mjs` | 新建 | 上者的测试（顺序无关、内容敏感） |
| `tools/bundle-cli.mjs` | 修改 | 锁版本、去时间戳、清字节码、写 `runtimeHash`、补 `isWin` 判断 |
| `config/electron-builder.config.cjs` | 修改 | publish / 签名开关 / mac zip / artifactName / nsis 契约 |
| `config/electron-builder.config.test.mjs` | 新建 | 把上面那几个字面量钉死 |
| `src/shared/types.ts` | 修改 | `EnvStatus` 加 `app_version` |
| `src/main/ipc/handlers/colab.ts` | 修改 | `envStatus` 处理器补 `app.getVersion()` |
| `src/renderer/src/app-shell/SettingsPage.tsx` | 修改 | 「运行环境」加一行应用版本 |
| `src/renderer/src/app-shell/SettingsPage.test.tsx` | 新建 | 断言两个版本号都在，且区分得开 |
| `src/renderer/src/i18n/locales/{zh,en}.json` | 修改 | 新增三个 key |
| `.github/workflows/release.yml` | 新建 | tag → 校验 → draft → 构建 → 校验资产 → 发布 |
| `README.md` | 修改 | 下载、安装、未签名时的绕过步骤 |

---

## Task 1：确定性目录哈希

差分更新的全部价值取决于"同样输入产出同样字节"。这一步先把**度量它的尺子**做出来——没有这把尺子，后面所有关于字节稳定的改动都只能靠感觉。

**Files:**
- Modify: `config/vitest.config.ts`
- Create: `tools/runtime-hash.mjs`
- Test: `tools/runtime-hash.test.mjs`

**Interfaces:**
- Consumes: 无
- Produces: `hashRuntimeDir(dir: string): Promise<string>` —— 返回 64 位小写十六进制的 SHA-256；`dir` 不存在时抛 `Error`。Task 2 用它算 `manifest.json` 的 `runtimeHash`。

- [ ] **Step 1: 让 vitest 收得到工具目录的测试**

`config/vitest.config.ts` 的 `include` 目前只有 `src/**`，工具目录的测试会被静默漏掉。改成：

```ts
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      // Build tooling keeps its tests as plain ESM next to the tool, because
      // these files run under bare `node` and must not need a TS build step.
      "config/**/*.test.mjs",
      "tools/**/*.test.mjs",
    ],
```

- [ ] **Step 2: 写失败的测试**

创建 `tools/runtime-hash.test.mjs`：

```js
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashRuntimeDir } from "./runtime-hash.mjs";

let root;
const scratch = [];

/** Writes a small tree under `base`; callers pass { "relative/path": "contents" }. */
function tree(base, files) {
  for (const [relative, contents] of Object.entries(files)) {
    const full = join(base, relative);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents, "utf8");
  }
}

/** A second temp dir, cleaned up alongside `root`. */
function scratchDir() {
  const dir = mkdtempSync(join(tmpdir(), "runtime-hash-"));
  scratch.push(dir);
  return dir;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "runtime-hash-"));
});

afterEach(() => {
  for (const dir of [root, ...scratch.splice(0)]) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("hashRuntimeDir", () => {
  it("is stable across runs for an identical tree", async () => {
    tree(root, { "site/a.py": "a", "python/bin/python3": "binary" });
    expect(await hashRuntimeDir(root)).toBe(await hashRuntimeDir(root));
  });

  it("does not depend on the order the files were written", async () => {
    tree(root, { "site/a.py": "a", "site/b.py": "b" });

    const other = scratchDir();
    tree(other, { "site/b.py": "b", "site/a.py": "a" });

    expect(await hashRuntimeDir(other)).toBe(await hashRuntimeDir(root));
  });

  it("changes when a file's contents change", async () => {
    tree(root, { "site/a.py": "before" });
    const before = await hashRuntimeDir(root);
    tree(root, { "site/a.py": "after" });
    expect(await hashRuntimeDir(root)).not.toBe(before);
  });

  it("changes when a file is renamed", async () => {
    tree(root, { "site/a.py": "same" });
    const before = await hashRuntimeDir(root);
    rmSync(join(root, "site", "a.py"));
    tree(root, { "site/b.py": "same" });
    expect(await hashRuntimeDir(root)).not.toBe(before);
  });

  it("ignores __pycache__ and .pyc, which embed build-machine paths", async () => {
    tree(root, { "site/a.py": "a" });
    const clean = await hashRuntimeDir(root);
    tree(root, { "site/__pycache__/a.cpython-312.pyc": "compiled" });
    tree(root, { "site/b.pyc": "compiled" });
    expect(await hashRuntimeDir(root)).toBe(clean);
  });

  it("throws when the directory does not exist", async () => {
    await expect(hashRuntimeDir(join(root, "nope"))).rejects.toThrow();
  });
});
```

- [ ] **Step 3: 跑测试确认它失败**

Run: `npm test -- tools/runtime-hash.test.mjs`
Expected: FAIL — `Failed to resolve import "./runtime-hash.mjs"`

- [ ] **Step 4: 实现**

创建 `tools/runtime-hash.mjs`：

```js
/**
 * A content hash over a directory tree, used to answer one question: did this
 * build change the bundled runtime? Two builds of the same CLI and Python
 * version must produce the same hash, or the installer's block map will differ
 * and every update degrades into a full 190MB download.
 *
 * Exclusions are the point of the whole thing: .pyc files embed absolute source
 * paths from whatever machine compiled them.
 */

import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const IGNORED_DIRECTORIES = new Set(["__pycache__"]);

async function collect(dir, root, into) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      await collect(full, root, into);
    } else if (entry.isFile()) {
      if (entry.name.endsWith(".pyc")) continue;
      into.push(relative(root, full).split(sep).join("/"));
    }
    // Symlinks are followed by the bundler's copy, so a link here is not a file
    // this hash needs to describe.
  }
}

export async function hashRuntimeDir(dir) {
  // Fail loudly: an empty hash for a missing directory would read as "unchanged".
  await stat(dir);

  const paths = [];
  await collect(dir, dir, paths);
  paths.sort();

  const digest = createHash("sha256");
  for (const path of paths) {
    digest.update(path);
    digest.update("\0");
    digest.update(await readFile(join(dir, path)));
    digest.update("\0");
  }
  return digest.digest("hex");
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm test -- tools/runtime-hash.test.mjs`
Expected: PASS，6 个用例

- [ ] **Step 6: 提交**

```bash
git add config/vitest.config.ts tools/runtime-hash.mjs tools/runtime-hash.test.mjs
git commit -m "Add a deterministic content hash for the bundled runtime"
```

---

## Task 2：内置运行时字节稳定化

`tools/bundle-cli.mjs` 现在每次构建都产出不同字节：`manifest.json` 里写死了 `bundledAt` 时间戳，`uv pip install` 默认编译 `.pyc`（里面嵌着构建机的绝对路径），CLI 版本没锁（同一个 tag 的两次构建可能装到不同版本）。差分更新建立在字节相等上，所以这些都得修掉。

**Files:**
- Modify: `tools/bundle-cli.mjs`

**Interfaces:**
- Consumes: `hashRuntimeDir(dir)` from `tools/runtime-hash.mjs`（Task 1）
- Produces: `resources/cli/manifest.json` 的新形状 —— `{ cliVersion, pythonVersion, platform, arch, runtimeHash }`。**`bundledAt` 被移除**；`runtimeHash` 覆盖 `python/` + `site/` 合并后的内容。

- [ ] **Step 1: 锁版本并引入哈希**

在 `tools/bundle-cli.mjs` 顶部，`const force = ...` 之后加：

```js
import { hashRuntimeDir } from "./runtime-hash.mjs";

/**
 * Pinned so two builds of the same git tag ship the same runtime. An unpinned
 * `pip install` makes the release that goes out depend on the day it was built.
 */
const PYTHON_VERSION = "3.12";
const CLI_PACKAGE = "google-colab-cli";
const CLI_VERSION = "0.7.4";
```

（`import` 语句按 ESM 规则必须在文件最上方——把它放到既有 `import` 块里，不要留在使用处。）

- [ ] **Step 2: 让 Python 查找走锁定版本**

`findStandalonePython` 现在用 `uv python find`（拿到的是"碰巧装了的那个"）。替换成按版本查找，并在缺失时安装：

```js
/** Locate (installing if needed) the pinned standalone python. */
function findStandalonePython(uvPath) {
  if (!uvPath) return null;
  const install = spawnSync(uvPath, ["python", "install", PYTHON_VERSION], { encoding: "utf8" });
  if (install.status !== 0) {
    error(`uv python install ${PYTHON_VERSION} 失败: ${install.stderr || install.stdout}`);
    process.exit(1);
  }
  try {
    const output = execSync(`"${uvPath}" python find ${PYTHON_VERSION}`, { encoding: "utf8" }).trim();
    const first = output.split(/\r?\n/)[0];
    if (first && existsSync(first)) return dirname(first);
  } catch {
    // fall through to the caller's error
  }
  return null;
}
```

- [ ] **Step 3: 锁定 CLI 版本并禁止编译字节码**

把第 172 行的安装调用改成：

```js
  const installArgs = [
    "pip",
    "install",
    "--target",
    SITE_DEST,
    "--link-mode",
    "copy",
    // No .pyc: they embed the build machine's absolute source paths, so two
    // builds of the same package would never be byte-identical.
    "--no-compile",
    `${CLI_PACKAGE}==${CLI_VERSION}`,
  ];
```

- [ ] **Step 4: 清理 Python 发行版里带进来的字节码**

`prunePython` 只删目录，不动 `__pycache__`。在它后面（第 157 行 `prunePython(PYTHON_DEST);` 之后）加一次清扫：

```js
  stripBytecode(PYTHON_DEST);
  stripBytecode(SITE_DEST);
```

并在 `prunePython` 下方新增：

```js
/** Remove compiled bytecode, which carries build-machine paths into the package. */
function stripBytecode(dir) {
  let removed = 0;
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__pycache__") {
          rmSync(full, { recursive: true, force: true });
          removed += 1;
        } else {
          walk(full);
        }
      } else if (entry.name.endsWith(".pyc")) {
        rmSync(full, { force: true });
        removed += 1;
      }
    }
  };
  if (existsSync(dir)) walk(dir);
  if (removed > 0) log(`Stripped ${removed} bytecode artifacts from ${dir}`);
}
```

`readdirSync` 需要加进文件顶部 `node:fs` 的 import 列表。

- [ ] **Step 5: 把 Windows 补丁限制在 Windows**

`patchWindowsConsole(SITE_DEST)` 现在无条件执行。第 179 行改成：

```js
  // The termios/tty import is a POSIX-only concern; patching it on macOS/Linux
  // would rewrite a file that was never broken.
  if (isWin) patchWindowsConsole(SITE_DEST);
```

- [ ] **Step 6: manifest 去掉时间戳、加上 runtimeHash**

把第 197-205 行的 manifest 构造换成：

```js
  // 4. Write manifest.json
  // No timestamp: it changed on every build, which alone was enough to give two
  // builds of the same tag different bytes.
  const runtimeHash = await hashRuntimeDir(TARGET_DIR);
  const manifest = {
    cliVersion: CLI_VERSION,
    pythonVersion: PYTHON_VERSION,
    platform: process.platform,
    arch: process.arch,
    runtimeHash,
  };
  writeFileSync(MANIFEST_DEST, JSON.stringify(manifest, null, 2), "utf8");
  log(`Wrote manifest to ${MANIFEST_DEST} (runtimeHash ${runtimeHash.slice(0, 12)}…)`);
```

`hashRuntimeDir` 会读到 `manifest.json` 自己——但 manifest 还没写，所以第一次算的是"没有 manifest 的树"。为避免这个前后不一致，改为**先把 manifest 写进内存、算哈希、再落盘**会造成循环。改成：哈希只覆盖两个运行时目录：

```js
  const runtimeHash = `${await hashRuntimeDir(PYTHON_DEST)}:${await hashRuntimeDir(SITE_DEST)}`;
```

这样 `runtimeHash` 的定义是"python/ 的哈希 + site/ 的哈希"，与 manifest 本身无关，也不会自我指涉。日志那行改成只露首尾，便于人眼比对：

```js
  log(`Wrote manifest to ${MANIFEST_DEST} (runtimeHash ${runtimeHash.slice(0, 8)}…${runtimeHash.slice(-8)})`);
```

- [ ] **Step 7: 验证哈希确实可复现（本任务的验收标准）**

Run:
```bash
npm run bundle:cli -- --force && node -p "require('./resources/cli/manifest.json').runtimeHash"
npm run bundle:cli -- --force && node -p "require('./resources/cli/manifest.json').runtimeHash"
```
Expected: 两次打印**完全相同**的 129 字符字符串（`64 + 1 + 64`）。

这是整个任务唯一真正重要的验证，也是一次完整跑两遍打包（各几分钟）。如果两次不同，说明还有没清干净的非确定性来源——先解决再往下走。

- [ ] **Step 8: 确认应用仍然能用内置运行时**

Run: `npm run build && npm run e2e`
Expected: PASS（`bundle:cli` 改了目录内容，E2E 用的是 CLI 桩，但仍要确认没把它弄坏）

- [ ] **Step 9: 提交**

```bash
git add tools/bundle-cli.mjs
git commit -m "Make the bundled runtime byte-reproducible and record its hash"
```

---

## Task 3：electron-builder 配置修正

三处会咬人的地方：加 `publish` 之后未签名的 Windows 构建会**直接失败**（spec §2.2，已在 electron-builder 源码里确认）；mac 缺 `zip` 会让更新链路从根上不成立（spec §2.3）；artifactName 和 nsis 选项一旦发布就改不动了，趁没有存量用户定死（spec §3.3）。

**Files:**
- Modify: `config/electron-builder.config.cjs`
- Test: `config/electron-builder.config.test.mjs`

**Interfaces:**
- Consumes: 无
- Produces: `dist/latest.yml`、`dist/latest-mac.yml`、各平台安装包与 `.blockmap`；应用包内出现 `resources/app-update.yml`。Task 5 的发布流水线按这些名字找资产。

- [ ] **Step 1: 写契约测试**

创建 `config/electron-builder.config.test.mjs`。这几个值全都是"改错了不报错、发出去才发现"的类型——SakuraCat 的 publish 指向了脚手架的仓库而没人察觉（spec §8.4）：

```js
/**
 * Pins the packaging values that fail silently when they are wrong.
 *
 * The publish coordinates are the reason this file exists: electron-builder will
 * infer them from package.json's `repository` field, so a wrong or missing
 * literal does not error — it ships, and every install starts checking someone
 * else's repository for updates.
 */

import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const config = require("./electron-builder.config.cjs");

describe("electron-builder configuration", () => {
  it("publishes to ColabDesk, as a literal", () => {
    const [publish] = config.publish;
    expect(publish).toMatchObject({
      provider: "github",
      owner: "feifeifeimoon",
      repo: "ColabDesk",
      releaseType: "release",
    });
  });

  it("does not suppress update signature verification", () => {
    // This flag looks like something an unsigned build needs. It is not: with no
    // certificate, electron-builder resolves no publisher name either way, so it
    // changes nothing today. It would only bite later — by suppressing the
    // publisher name that enables verification once a certificate exists.
    expect(config.win.verifyUpdateCodeSignature).not.toBe(false);
  });

  it("ships a zip on macOS, which is what Squirrel.Mac installs from", () => {
    const targets = config.mac.target.flatMap((entry) => [entry.target]);
    expect(targets).toContain("zip");
    expect(targets).toContain("dmg");
  });

  it("keeps ${arch} in artifact names so the two Mac architectures cannot collide", () => {
    expect(config.win.artifactName).toContain("${arch}");
    expect(config.mac.artifactName).toContain("${arch}");
  });

  it("keeps the NSIS options differential updates depend on", () => {
    // Changing any of these invalidates block maps for everyone already
    // installed, so they are a contract rather than a preference.
    expect(config.nsis).toMatchObject({
      oneClick: false,
      perMachine: false,
      allowToChangeInstallationDirectory: true,
      differentialPackage: true,
      deleteAppDataOnUninstall: false,
    });
  });
});
```

- [ ] **Step 2: 跑测试确认它失败**

Run: `npm test -- config/electron-builder.config.test.mjs`
Expected: FAIL —— `config.publish` 是 `undefined`（TypeError），`mac.target` 里没有 `zip`，nsis 的 `differentialPackage` / `deleteAppDataOnUninstall` 都缺

- [ ] **Step 3: 改配置**

`config/electron-builder.config.cjs` 里，`extraResources` 之后插入：

```js
  // Build-time publishing. The owner/repo are written out rather than inferred
  // from package.json, because inference cannot fail — it just points somewhere
  // else and nobody notices.
  publish: [
    {
      provider: "github",
      owner: "feifeifeimoon",
      repo: "ColabDesk",
      releaseType: "release",
    },
  ],
```

`win` 块改成：

```js
  win: {
    // Per-user install: no administrator prompt, and the CLI keeps its state
    // under the user's own profile anyway.
    target: [{ target: "nsis", arch: ["x64"] }],
    artifactName: "colabdesk-setup-${version}-${arch}.${ext}",
    // Deliberately no `verifyUpdateCodeSignature: false`. It reads like a
    // prerequisite for unsigned builds and is not one: without a certificate
    // electron-builder resolves no publisher name either way, so the flag
    // changes nothing today. It would only start mattering once a certificate
    // exists — and then it would suppress the very publisher name that turns
    // update signature verification on. Confirmed by building with and without
    // it: the two app-update.yml files come out byte-identical.
  },
```

`nsis` 块改成：

```js
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    // Block-map based updates. Turning this off silently makes every update a
    // full re-download of the installer, bundled runtime included.
    differentialPackage: true,
    // Uninstalling must not take the user's usage history and Colab credentials
    // with it — they live under userData, which this flag governs.
    deleteAppDataOnUninstall: false,
  },
```

`mac` 块改成：

```js
  mac: {
    // dmg for a human, zip for Squirrel.Mac: electron-updater's MacUpdater
    // refuses to start without a zip in the release.
    target: [
      { target: "dmg", arch: ["x64", "arm64"] },
      { target: "zip", arch: ["x64", "arm64"] },
    ],
    artifactName: "colabdesk-${version}-${arch}.${ext}",
    category: "public.app-category.developer-tools",
  },
```

`linux` 块加 artifactName（保持 AppImage）：

```js
  linux: {
    target: ["AppImage"],
    artifactName: "colabdesk-${version}-${arch}.${ext}",
    category: "Development",
  },
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- config/electron-builder.config.test.mjs`
Expected: PASS，5 个用例

- [ ] **Step 5: 确认构建真的产出更新元数据**

这是本任务的**关键验证**——`app-update.yml` 与 `latest.yml` 的存在与否，是"能不能更新"和"完全不能更新"的分界：

Run: `npm run package:win`
Expected: 构建成功（不再因为 publisher name 抛错），且：

```bash
ls dist/latest.yml dist/*.blockmap
node -e "console.log(require('fs').readFileSync('dist/latest.yml','utf8'))"
```

`latest.yml` 里应包含 `version`、`files`（含 `sha512` / `size`）、`path`、`releaseDate`。

再确认打进应用里的 `app-update.yml`。它由 electron-builder 写在 `resources/` 下、`app.asar` 旁边（这也正是 electron-updater 运行时读的位置 `process.resourcesPath/app-update.yml`）：

```bash
cat dist/win-unpacked/resources/app-update.yml
```

Expected: 文件存在，内容含 `provider: github`、`owner: feifeifeimoon`、`repo: ColabDesk`、`updaterCacheDirName`，且**不含** `publisherName`（因为我们没签名）。

> 顺带一个容易被忽略的产物：`updaterCacheDirName` 的默认值来自 `productName`。Multica 的产品名泄漏成了 `@multicadesktop`，缓存目录就跟着叫 `@multicadesktop-updater`（spec §8.4）。我们的 `productName` 是 `ColabDesk`，所以正常；但**这个名字一旦发布就改不动了**——改了等于让所有已安装用户重新下载一遍，因为旧缓存目录里的块对不上。看一眼，记下它是什么。

- [ ] **Step 6: 提交**

```bash
git add config/electron-builder.config.cjs config/electron-builder.config.test.mjs
git commit -m "Fix packaging config: publish target, unsigned Windows, mac zip target"
```

---

## Task 4：应用里显示版本号

现在全仓没有一处调用 `app.getVersion()`。用户提 bug 时能说清自己用的是哪个版本，是发布机制最便宜的一半回报。工作台已经有一节「运行环境」在用 `PanelRow` 罗列事实，版本号属于同一类事实。

**Files:**
- Modify: `src/shared/types.ts`（`EnvStatus` 加字段）
- Modify: `src/main/ipc/handlers/colab.ts`（处理器补上 Electron 侧的值）
- Modify: `src/renderer/src/app-shell/SettingsPage.tsx`
- Modify: `src/renderer/src/i18n/locales/zh.json`、`src/renderer/src/i18n/locales/en.json`
- Test: `src/renderer/src/app-shell/SettingsPage.test.tsx`

**Interfaces:**
- Consumes: 无
- Produces: `EnvStatus.app_version: string`。渲染层通过既有的 `envStatus()` 拿到，**不新增 IPC 通道**——「运行环境」本来就在读 `env`。

- [ ] **Step 1: 写失败的渲染测试**

创建 `src/renderer/src/app-shell/SettingsPage.test.tsx`。要钉住的规则是：**两个版本号必须都在，而且能互相区分**——只显示 CLI 版本的话，用户报的是 CLI 的版本，对排查应用本身毫无用处。

```tsx
/**
 * The settings page's runtime section, rendered as markup.
 *
 * The rule worth pinning is that the application's own version is on screen next
 * to the CLI's. A report that only carries the CLI version cannot be acted on,
 * and the two numbers look alike enough that "one is missing" is easy to ship.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n/i18n";

const store = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("../store", () => ({
  useAppStore: (select: (state: unknown) => unknown) => select(store.current),
}));

import { SettingsPage } from "./SettingsPage";

const noop = () => {};

beforeEach(() => {
  store.current = {
    settingsOpen: true,
    closeSettings: noop,
    env: {
      cli_path: "C:\\bundled\\python.exe",
      cli_source: "bundled",
      cli_version: "0.7.4",
      config_dir: "C:\\config",
      sessions_file_exists: true,
      authenticated: true,
      account: null,
      accelerator_eligibility: null,
      token_expiry: null,
      has_refresh_token: false,
      hint: null,
      app_version: "0.3.0",
    },
    usage: null,
    selectedSession: null,
    theme: "system",
    language: "zh",
    panelWidths: { sidebar: 260, files: 320 },
    setTheme: noop,
    setLanguage: noop,
    setPanelWidth: noop,
    refreshEnvironment: noop,
  };
});

describe("the runtime section", () => {
  it("shows the application version and the CLI version, distinguishably", () => {
    const html = renderToStaticMarkup(createElement(SettingsPage, { initialSection: "runtime" }));
    const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
    expect(text).toContain("0.3.0");
    expect(text).toContain("0.7.4");
  });

  it("does not claim a version it was not given", () => {
    store.current.env = { ...store.current.env, app_version: "" };
    const html = renderToStaticMarkup(createElement(SettingsPage, { initialSection: "runtime" }));
    expect(html).not.toContain("0.3.0");
  });
});
```

> **如果这条测试在 import 阶段就炸**：`SettingsPage` 会连带引入 `LoginPanel`、`UsageTrendPanel`、`TerminalSettings` 等模块，`renderToStaticMarkup` 不跑 effect、也没有浏览器环境。静态渲染本身是安全的（`TerminalSettings.test.tsx` 已证明这一套可行），但**副作用发生在模块加载期**就另说了。真遇到，照 `TerminalSettings.test.tsx` 的做法把那个模块 `vi.mock` 掉——那里的注释写了同样的理由（font probe 问 `document.fonts`）。别为了测试去改被测组件的结构。

- [ ] **Step 2: 跑测试确认它失败**

Run: `npm test -- src/renderer/src/app-shell/SettingsPage.test.tsx`
Expected: FAIL —— 渲染文本里没有 `0.3.0`

- [ ] **Step 3: 契约加字段**

`src/shared/types.ts` 的 `EnvStatus` 里，`cli_version` 上面加：

```ts
  /** The Electron app's own version, from package.json. Not the CLI's. */
  app_version: string;
```

- [ ] **Step 4: 处理器补值**

Electron 的 `app` 属于 IPC 层，不该渗进 `colab` 领域服务，所以在处理器这一层合上。

`src/main/ipc/handlers/colab.ts`：确保顶部有 `import { app } from "electron";`，然后把第 20 行改成：

```ts
  ipcMain.handle(IPC.envStatus, async (): Promise<EnvStatus> => ({
    ...(await service.envStatus()),
    app_version: app.getVersion(),
  }));
```

（`EnvStatus` 需要加进该文件从 `@shared/types` 的类型 import。）

- [ ] **Step 5: 设置页加一行**

`src/renderer/src/app-shell/SettingsPage.tsx` 的 `runtimeBody()` 里，在「colab 命令」那一行**前面**插入：

```tsx
        <PanelRow
          label={t("settings.runtimeAppVersion", "应用版本")}
          description={t("settings.runtimeAppVersionDesc", "应用自身的版本，与内置的 colab CLI 版本是两回事。")}
          value={env?.app_version || "—"}
        />
```

- [ ] **Step 6: 补 i18n**

`src/renderer/src/i18n/locales/zh.json` 的 `settings` 下加：

```json
"runtimeAppVersion": "应用版本",
"runtimeAppVersionDesc": "应用自身的版本，与内置的 colab CLI 版本是两回事。",
```

`src/renderer/src/i18n/locales/en.json` 的 `settings` 下加：

```json
"runtimeAppVersion": "App version",
"runtimeAppVersionDesc": "The application's own version, which is not the bundled colab CLI version.",
```

- [ ] **Step 7: 跑测试确认通过**

Run: `npm test -- src/renderer/src/app-shell/SettingsPage.test.tsx`
Expected: PASS，2 个用例

- [ ] **Step 8: 跑完整门禁**

Run: `npm run typecheck && npm test && npm run build && npm run e2e`
Expected: 全绿

- [ ] **Step 9: 提交**

```bash
git add src/shared/types.ts src/main/ipc/handlers/colab.ts \
        src/renderer/src/app-shell/SettingsPage.tsx \
        src/renderer/src/app-shell/SettingsPage.test.tsx \
        src/renderer/src/i18n/locales/zh.json src/renderer/src/i18n/locales/en.json
git commit -m "Show the application version in settings alongside the CLI version"
```

---

## Task 5：发布流水线

现在只有一条 e2e 工作流，没有发布路径。目标是"打一个 tag，产出一条完整的 Release"。发布是不可逆的外向动作，所以顺序是**先 draft、再构建上传、再校验资产、最后才发布**——一个只有两个平台中之一的 Release 一旦公开，另一个平台的用户就会开始拿到坏掉的更新检查。

**Files:**
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: Task 3 产出的 `dist/latest.yml`、`dist/latest-mac.yml`、`dist/colabdesk-setup-<v>-x64.exe(.blockmap)`、`dist/colabdesk-<v>-<arch>.dmg/.zip(.blockmap)`；Task 2 产出的 `resources/cli/manifest.json`
- Produces: 一个已发布的 GitHub Release（非 prerelease）

- [ ] **Step 1: 写工作流**

创建 `.github/workflows/release.yml`：

```yaml
name: release

# A tag is the only way a release starts, and the tag is the version's source of
# truth: package.json is asserted against it, not the other way round.
on:
  push:
    tags: ["v*.*.*"]

# electron-builder's GitHub publisher creates and uploads into the draft release;
# every other job only reads.
permissions:
  contents: write

# Two releases of the same tag would race on the same assets.
concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false

jobs:
  guard:
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.check.outputs.version }}
    steps:
      - uses: actions/checkout@v4
      - name: The tag and package.json must agree
        id: check
        shell: bash
        run: |
          set -euo pipefail
          version="${GITHUB_REF_NAME#v}"
          pkg="$(node -p "require('./package.json').version")"
          if [ "$version" != "$pkg" ]; then
            echo "tag $GITHUB_REF_NAME does not match package.json $pkg" >&2
            exit 1
          fi
          echo "version=$version" >> "$GITHUB_OUTPUT"

  draft:
    needs: guard
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Open the draft release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh release create "$GITHUB_REF_NAME" \
            --draft \
            --title "$GITHUB_REF_NAME" \
            --notes "ColabDesk $GITHUB_REF_NAME"

  build:
    needs: draft
    strategy:
      # One platform failing must not cancel the other — a partial release is
      # recoverable, a half-built one is confusing.
      fail-fast: false
      matrix:
        include:
          - os: windows-latest
            args: --win
          - os: macos-latest
            args: --mac
    runs-on: ${{ matrix.os }}
    timeout-minutes: 90
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      # The bundled runtime is built per platform — python.exe on Windows,
      # python/bin/python3 elsewhere — so it cannot be cross-compiled and each
      # matrix entry runs its own bundler.
      - uses: astral-sh/setup-uv@v10

      - name: Install dependencies
        run: npm ci

      - name: Bundle the Colab runtime
        run: npm run bundle:cli

      # electron-builder tolerates a missing resources/cli and would happily ship
      # an installer that silently falls back to a system Python. The whole point
      # of the bundle is that it cannot.
      - name: Assert the runtime is actually in the build
        shell: bash
        run: |
          set -euo pipefail
          test -f resources/cli/manifest.json || { echo "resources/cli missing after bundle:cli" >&2; exit 1; }
          cat resources/cli/manifest.json

      - name: Typecheck
        run: npm run typecheck
      - name: Unit tests
        run: npm test
      - name: Build
        run: npm run build

      - name: Package and upload into the draft
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: >-
          npx electron-builder
          --config config/electron-builder.config.cjs
          ${{ matrix.args }}
          --publish always

      - name: Keep the metadata for the asset check
        uses: actions/upload-artifact@v4
        with:
          name: dist-${{ matrix.os }}
          path: |
            dist/*.yml
            dist/*.blockmap
          if-no-files-found: error

  publish:
    # `guard` is listed explicitly, not just inherited through `build`: a job can
    # only read outputs from the jobs it names in its own `needs`.
    needs: [build, guard]
    runs-on: ubuntu-latest
    steps:
      # Everything before this point is invisible to users. This job is the only
      # place a release becomes public, and it refuses to.
      - name: Verify the required assets are all present
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          VERSION: ${{ needs.guard.outputs.version }}
        shell: bash
        run: |
          set -euo pipefail
          assets="$(gh release view "$GITHUB_REF_NAME" --json assets --jq '.assets[].name')"
          echo "$assets"
          require() {
            grep -qx "$1" <<<"$assets" || { echo "missing release asset: $1" >&2; exit 1; }
          }
          require latest.yml
          require latest-mac.yml
          require "colabdesk-setup-${VERSION}-x64.exe"
          for arch in x64 arm64; do
            require "colabdesk-${VERSION}-${arch}.dmg"
            require "colabdesk-${VERSION}-${arch}.zip"
          done

          # Block maps are what make an update an incremental download instead of
          # the whole installer. Matched by pattern rather than by exact name, so
          # that a change in artifact naming cannot quietly drop the check.
          grep -q '\.exe\.blockmap$' <<<"$assets" || { echo "no .exe.blockmap published" >&2; exit 1; }
          grep -q '\.zip\.blockmap$' <<<"$assets" || { echo "no .zip.blockmap published" >&2; exit 1; }

      - name: Publish
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          # electron-builder's publisher is known to rewrite the prerelease flag;
          # assert the state we want rather than trusting the draft survived.
          gh release edit "$GITHUB_REF_NAME" --draft=false --prerelease=false --latest
```

- [ ] **Step 2: 本地把 YAML 语法过一遍**

YAML 里一个缩进错了，`gh` 要到推送之后才告诉你，而且报的是 worklow 无效——不是那一行。

Run: `npx --yes js-yaml@4 .github/workflows/release.yml > /dev/null && echo OK`
Expected: `OK`

- [ ] **Step 3: 确认版本护栏真的会拦住**

Run:
```bash
node -p "require('./package.json').version"
git tag -l | head
```
Expected: 明确知道当前 `package.json.version` 是什么（现为 `0.2.0`）。正式发版时用它打 tag，或先 bump。

- [ ] **Step 4: 提交**

```bash
git add .github/workflows/release.yml
git commit -m "Add the tag-driven release workflow with a draft-first publish gate"
```

- [ ] **Step 5: 第一次真跑

> **这一步会产生一条公开的 GitHub Release。** 推 tag 之前先确认 `package.json.version` 是这次想发的号——`guard` 会拦住不一致，但拦不住"发错了一个本来不想发的版本"。建议先用一个明显的 0.x 号试水。

```bash
node -p "require('./package.json').version"   # 先看要发的是哪个号
git tag "v$(node -p "require('./package.json').version")"
git push origin --tags
```

Expected: `guard` 通过 → `draft` 建出 draft → 两个 `build` 都成功 → `publish` 打印资产清单并发布。

失败时看 `gh run view --log-failed`。**这一步大概率会暴露本机发现不了的问题**（CI 上的 uv 行为、Windows runner 的 bash、mac 产物命名、下载 190MB 运行时的网络抖动），所以留足时间。

如果 `publish` 卡在资产校验上，draft 会留在那里不动——那是**设计如此**：先改问题，再手动 `gh release edit <tag> --draft=false`，不要删了重发（删掉的 tag 会让已经看到它的人拿到 404）。

---

## Task 6：README

未签名分发不是缺陷，但让用户自己猜怎么绕过就是。spec §8.1 明确写了"代价是诚实说清就没事"。

**Files:**
- Modify: `README.md`（当前只有一行 `# ColabDesk`）

**Interfaces:**
- Consumes: Task 5 产出的 Release 页面
- Produces: 无

- [ ] **Step 1: 写 README**

替换 `README.md` 全文：

```markdown
# ColabDesk

非官方 Google Colab 桌面客户端：会话、额度、终端与文件传输。与 Google 无关联。

## 下载

到 [Releases](https://github.com/feifeifeimoon/ColabDesk/releases/latest) 取：

- **Windows**：`colabdesk-setup-<版本>-x64.exe`
- **macOS**：`colabdesk-<版本>-<架构>.dmg`（Apple Silicon 用 `arm64`，Intel 用 `x64`）

应用内置了 Python 运行时与 `colab` CLI，不需要另装 Python。

## 安装

**这些包没有代码签名**，所以系统会拦一下。这不是出错，是正常的：

### Windows

安装包会触发 SmartScreen 的「Windows 已保护你的电脑」提示。点 **更多信息 → 仍要运行**。
安装是当前用户级别（不需要管理员），卸载在「设置 → 应用」里，**不会**删除你的用量历史与 Colab 授权。

### macOS

首次打开会提示「无法验证是否含恶意软件」。到 **系统设置 → 隐私与安全性**，在下面找到 ColabDesk
并点 **仍要打开**，再确认一次。之后它就作为例外被记住了。

请**不要**为了这个应用全局关闭 Gatekeeper。

> 为什么没签名：Apple Developer Program 每年 $99，Windows 代码签名证书对个人开发者还有地区限制。
> 这两项都在计划里，但还没到位。签名一旦就位，上面这些步骤都会消失。

## 开发

见 [`AGENTS.md`](AGENTS.md)。
```

- [ ] **Step 2: 提交**

```bash
git add README.md
git commit -m "Document installation and the unsigned-build warnings users will see"
```

---

## 完成标准

阶段 1 做完时，下面每一条都应成立：

- [ ] `npm run bundle:cli -- --force` 连跑两次，`manifest.json` 里的 `runtimeHash` 完全一致（Task 2 Step 7）
- [ ] `npm test` 通过，其中包含 6 个哈希用例、5 个打包配置契约用例、2 个设置页渲染用例
- [ ] `npm run package:win` 成功（不再因 publisher name 报错），产出 `dist/latest.yml` 与 `.blockmap`
- [ ] 解包后的应用里有 `resources/app-update.yml`，指向 `feifeifeimoon/ColabDesk`，且不含 `publisherName`
- [ ] 设置页「运行环境」同时显示应用版本与 CLI 版本
- [ ] 推一个与 `package.json` 一致的 tag，能产出一条含 Windows 与 macOS 双平台产物的 Release
- [ ] README 说明了未签名时两个平台各自的绕过步骤

## 明确不在本阶段

- 任何更新代码：`electron-updater`、`src/main/updater/`、update slice、UpdateCard、状态栏那一段——全部是阶段 2。
- macOS 自动更新：未签名时 Squirrel.Mac 根本起不来（spec §2.3），且主进程里那行 `process.platform === "darwin"` 的 return 要到阶段 2 才写。
- 签名：阶段 3。本阶段**不碰** `verifyUpdateCodeSignature`——证书到位时 electron-builder 会自动开始写 `publisherName` 并打开校验（spec §2.2）。
- Linux 产物进 Release：AppImage target 保留在配置里，但矩阵先只跑 Windows 与 macOS。
