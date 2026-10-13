#!/usr/bin/env node

/**
 * Automates bundling a standalone Python runtime and google-colab-cli into
 * `resources/cli/` so packaged builds run out of the box without system Python.
 *
 * Layout:
 *   resources/cli/
 *     python/       - Portable CPython runtime (python.exe or bin/python3)
 *     site/         - site-packages containing google-colab-cli and dependencies
 *     manifest.json - CLI metadata (cliVersion, platform, etc.)
 */

import { execSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { hashRuntimeDir } from "./runtime-hash.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const TARGET_DIR = join(ROOT, "resources", "cli");
const PYTHON_DEST = join(TARGET_DIR, "python");
const SITE_DEST = join(TARGET_DIR, "site");
const MANIFEST_DEST = join(TARGET_DIR, "manifest.json");

const isWin = process.platform === "win32";
const pythonExeName = isWin ? "python.exe" : "bin/python3";
const force = process.argv.includes("--force");

/**
 * Pinned so two builds of the same git tag ship the same runtime. An unpinned
 * `pip install` makes the release that goes out depend on the day it was built.
 */
const PYTHON_VERSION = "3.12";
const CLI_PACKAGE = "google-colab-cli";
const CLI_VERSION = "0.7.4";

function log(msg) {
  console.log(`[bundle:cli] ${msg}`);
}

function error(msg) {
  console.error(`[bundle:cli] ERROR: ${msg}`);
}

/** Check if already bundled and valid */
function isAlreadyBundled() {
  const pyExe = join(PYTHON_DEST, pythonExeName);
  const cliEntry = join(SITE_DEST, "colab_cli", "cli.py");
  return existsSync(pyExe) && existsSync(cliEntry) && existsSync(MANIFEST_DEST);
}

/** Locate `uv` executable */
function findUv() {
  try {
    const res = execSync(isWin ? "where.exe uv" : "which uv", { encoding: "utf8" }).trim();
    const first = res.split(/\r?\n/)[0];
    if (first && existsSync(first)) return first;
  } catch {
    // try fallback paths
  }
  const localUv = isWin ? join(homedir(), ".local", "bin", "uv.exe") : join(homedir(), ".local", "bin", "uv");
  if (existsSync(localUv)) return localUv;
  return null;
}

/** Locate the pinned standalone python, installing it if this machine lacks it. */
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
    if (first && existsSync(first)) {
      // `uv python find` answers with the interpreter, not the distribution
      // root. The two platforms put it in different places: Windows keeps it at
      // the root (`<root>/python.exe`), POSIX one level down
      // (`<root>/bin/python3`) — which is exactly the layout `pythonExeName`
      // expects after the copy. Taking only one `dirname` on POSIX copies the
      // contents of `bin/`, and the tree then fails its own existence check.
      const binDir = dirname(first);
      return isWin ? binDir : dirname(binDir);
    }
  } catch {
    // fall through to the caller's error
  }
  return null;
}

/** Prune unneeded large directories from python distribution */
function prunePython(dest) {
  const toRemove = [
    join(dest, "include"),
    join(dest, "libs"),
    join(dest, "tcl"),
    join(dest, "Doc"),
    join(dest, "Lib", "test"),
    join(dest, "Lib", "idlelib"),
    join(dest, "Lib", "tkinter"),
  ];
  for (const p of toRemove) {
    if (existsSync(p)) {
      try {
        rmSync(p, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }
}

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

/** Fix Windows issue where termios/tty is imported at top level in colab_cli 0.7.4 */
function patchWindowsConsole(siteDir) {
  const consolePy = join(siteDir, "colab_cli", "console.py");
  if (!existsSync(consolePy)) return;

  let content = readFileSync(consolePy, "utf8");
  if (content.includes("import termios") && !content.includes("# Raw-mode terminal handling is POSIX-only")) {
    log("Applying Windows compatibility patch to colab_cli/console.py...");
    // Replace top-level termios/tty imports with lazy imports inside if is_tty
    content = content.replace(/^import termios\r?\n/m, "# termios deferred for Windows compatibility\n");
    content = content.replace(/^import tty\r?\n/m, "# tty deferred for Windows compatibility\n");
    content = content.replace(
      /([ \t]*)old_settings = termios\.tcgetattr\(fd\) if is_tty else None/,
      `$1if is_tty:
$1    import termios
$1    import tty
$1    old_settings = termios.tcgetattr(fd)
$1else:
$1    old_settings = None`,
    );
    content = content.replace(
      /([ \t]*)signal\.signal\(signal\.SIGWINCH, handle_sigwinch\)/g,
      '$1if hasattr(signal, "SIGWINCH"):\n$1    signal.signal(signal.SIGWINCH, handle_sigwinch)',
    );
    content = content.replace(
      /([ \t]*)signal\.signal\(signal\.SIGWINCH, signal\.SIG_DFL\)/g,
      '$1if hasattr(signal, "SIGWINCH"):\n$1    signal.signal(signal.SIGWINCH, signal.SIG_DFL)',
    );
    writeFileSync(consolePy, content, "utf8");
  }
}

async function bundle() {
  if (!force && isAlreadyBundled()) {
    log(`Runtime already bundled at ${TARGET_DIR}. Use --force to rebuild.`);
    return;
  }

  log(`Preparing bundled runtime in ${TARGET_DIR}...`);
  mkdirSync(TARGET_DIR, { recursive: true });

  const uv = findUv();
  if (!uv) {
    error("未找到 uv 可执行文件。请先安装 uv: https://github.com/astral-sh/uv");
    process.exit(1);
  }

  log(`Using uv at: ${uv}`);

  // 1. Python standalone
  const pythonSource = findStandalonePython(uv);
  if (!pythonSource) {
    error("未找到可用 standalone Python。可通过 `uv python install 3.12` 获取。");
    process.exit(1);
  }

  log(`Copying standalone Python from ${pythonSource}...`);
  if (existsSync(PYTHON_DEST)) {
    rmSync(PYTHON_DEST, { recursive: true, force: true });
  }
  cpSync(pythonSource, PYTHON_DEST, { recursive: true, dereference: true });
  prunePython(PYTHON_DEST);
  stripBytecode(PYTHON_DEST);

  const pythonBin = join(PYTHON_DEST, pythonExeName);
  if (!existsSync(pythonBin)) {
    error(`Python 可执行文件未就绪: ${pythonBin}`);
    process.exit(1);
  }

  // 2. Install google-colab-cli into site-packages
  log(`Installing google-colab-cli into ${SITE_DEST}...`);
  if (existsSync(SITE_DEST)) {
    rmSync(SITE_DEST, { recursive: true, force: true });
  }
  mkdirSync(SITE_DEST, { recursive: true });

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
  const res = spawnSync(uv, installArgs, { stdio: "inherit", encoding: "utf8" });
  if (res.status !== 0) {
    error(`使用 uv 安装 ${CLI_PACKAGE}==${CLI_VERSION} 失败。`);
    process.exit(1);
  }

  // The termios/tty import is a POSIX-only concern; patching it on macOS/Linux
  // would rewrite a file that was never broken.
  if (isWin) patchWindowsConsole(SITE_DEST);
  stripBytecode(SITE_DEST);

  // 3. Verify and read version
  log("Verifying bundled CLI invocation...");
  const env = { ...process.env, PYTHONPATH: SITE_DEST, PYTHONDONTWRITEBYTECODE: "1" };
  const check = spawnSync(pythonBin, ["-m", "colab_cli.cli", "version"], { env, encoding: "utf8" });
  if (check.status !== 0) {
    error(`验证 CLI 失败: ${check.stderr || check.stdout}`);
    process.exit(1);
  }

  const versionMatch = check.stdout.match(/Version:\s*([0-9a-zA-Z.-]+)/);
  if (versionMatch && versionMatch[1] !== CLI_VERSION) {
    // The pin is the contract; a mismatch means the index served something else.
    error(`预期 ${CLI_PACKAGE}==${CLI_VERSION}，但内置运行时报告 ${versionMatch[1]}`);
    process.exit(1);
  }
  log(`Bundled CLI verified successfully: version ${CLI_VERSION}`);

  // 4. Write manifest.json
  // No timestamp: it changed on every build, which alone was enough to give two
  // builds of the same tag different bytes. The hash covers both runtime trees
  // and is what tells a later build whether the runtime actually moved.
  const runtimeHash = `${await hashRuntimeDir(PYTHON_DEST)}:${await hashRuntimeDir(SITE_DEST)}`;
  const manifest = {
    cliVersion: CLI_VERSION,
    pythonVersion: PYTHON_VERSION,
    platform: process.platform,
    arch: process.arch,
    runtimeHash,
  };
  writeFileSync(MANIFEST_DEST, JSON.stringify(manifest, null, 2), "utf8");
  log(`Wrote manifest to ${MANIFEST_DEST} (runtimeHash ${runtimeHash.slice(0, 8)}…${runtimeHash.slice(-8)})`);
  log("CLI bundling complete!");
}

bundle().catch((err) => {
  error(err.message);
  process.exit(1);
});
