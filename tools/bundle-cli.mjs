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
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const TARGET_DIR = join(ROOT, "resources", "cli");
const PYTHON_DEST = join(TARGET_DIR, "python");
const SITE_DEST = join(TARGET_DIR, "site");
const MANIFEST_DEST = join(TARGET_DIR, "manifest.json");

const isWin = process.platform === "win32";
const pythonExeName = isWin ? "python.exe" : "bin/python3";
const force = process.argv.includes("--force");

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

/** Locate standalone python managed by uv */
function findStandalonePython(uvPath) {
  if (uvPath) {
    try {
      const output = execSync(`"${uvPath}" python find`, { encoding: "utf8" }).trim();
      const first = output.split(/\r?\n/)[0];
      if (first && existsSync(first)) {
        return dirname(first);
      }
    } catch {
      // ignore
    }
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

  const installArgs = ["pip", "install", "--target", SITE_DEST, "--link-mode", "copy", "google-colab-cli"];
  const res = spawnSync(uv, installArgs, { stdio: "inherit", encoding: "utf8" });
  if (res.status !== 0) {
    error("使用 uv 安装 google-colab-cli 失败。");
    process.exit(1);
  }

  patchWindowsConsole(SITE_DEST);

  // 3. Verify and read version
  log("Verifying bundled CLI invocation...");
  const env = { ...process.env, PYTHONPATH: SITE_DEST, PYTHONDONTWRITEBYTECODE: "1" };
  const check = spawnSync(pythonBin, ["-m", "colab_cli.cli", "version"], { env, encoding: "utf8" });
  if (check.status !== 0) {
    error(`验证 CLI 失败: ${check.stderr || check.stdout}`);
    process.exit(1);
  }

  let cliVersion = "0.7.4";
  const versionMatch = check.stdout.match(/Version:\s*([0-9a-zA-Z.-]+)/);
  if (versionMatch) {
    cliVersion = versionMatch[1];
  }
  log(`Bundled CLI verified successfully: version ${cliVersion}`);

  // 4. Write manifest.json
  const manifest = {
    cliVersion,
    pythonVersion: "3.12",
    platform: process.platform,
    arch: process.arch,
    bundledAt: new Date().toISOString(),
  };
  writeFileSync(MANIFEST_DEST, JSON.stringify(manifest, null, 2), "utf8");
  log(`Wrote manifest to ${MANIFEST_DEST}`);
  log("CLI bundling complete!");
}

bundle().catch((err) => {
  error(err.message);
  process.exit(1);
});
