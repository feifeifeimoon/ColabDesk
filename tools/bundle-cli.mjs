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
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
export const PYTHON_VERSION = "3.12";
const CLI_PACKAGE = "google-colab-cli";
export const CLI_VERSION = "0.7.5";

/**
 * Bumped whenever the prune rules below change. Without it, a checkout that
 * bundled before a new rule existed would keep its old, larger tree forever:
 * `isAlreadyBundled` only looks at the manifest, never at the tree.
 */
export const RUNTIME_LAYOUT_VERSION = 2;

function log(msg) {
  console.log(`[bundle:cli] ${msg}`);
}

function error(msg) {
  console.error(`[bundle:cli] ERROR: ${msg}`);
}

/** Check if already bundled and matching the pinned Python and CLI versions. */
export function isAlreadyBundled(targetDir = TARGET_DIR) {
  const pyExe = join(targetDir, "python", pythonExeName);
  const cliEntry = join(targetDir, "site", "colab_cli", "cli.py");
  const manifestPath = join(targetDir, "manifest.json");
  if (!existsSync(pyExe) || !existsSync(cliEntry) || !existsSync(manifestPath)) return false;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    return (
      manifest.cliVersion === CLI_VERSION &&
      manifest.pythonVersion === PYTHON_VERSION &&
      manifest.layoutVersion === RUNTIME_LAYOUT_VERSION
    );
  } catch {
    return false;
  }
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
    error(`uv python install ${PYTHON_VERSION} failed: ${install.stderr || install.stdout}`);
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

/**
 * Standard-library pieces the CLI cannot reach. `site-packages` takes pip with
 * it: `colab install` runs pip on the remote VM (it sends a code string to the
 * kernel), and nothing in this runtime imports pip.
 */
const PYTHON_LIB_REMOVALS = [
  "test",
  "idlelib",
  "tkinter",
  "turtledemo",
  "lib2to3",
  "ensurepip",
  "venv",
  "pydoc_data",
  "site-packages",
];

/** Native modules that exist only for CPython's test suite or Tk. */
const PYTHON_NATIVE_REMOVALS = [
  /^_test/,
  /^_ctypes_test/,
  /^_tkinter/,
  /^(tcl|tk)\w*\.(dll|so|dylib)$/i,
];

/** Remove one path and say so; a release log should show what the bundle lost. */
function prunePath(root, target) {
  if (!existsSync(target)) return;
  rmSync(target, { recursive: true, force: true });
  log(`Pruned ${relative(root, target)}`);
}

/**
 * Prune the standalone Python distribution.
 *
 * Both layouts are handled on purpose: Windows keeps the standard library in
 * `Lib/` and extensions in `DLLs/`, while the POSIX build uses
 * `lib/python<version>/` and `lib/python<version>/lib-dynload/`. The previous
 * Windows-only list silently left pip, the test suite and Tcl/Tk in the macOS
 * bundle, which is why the dmg was larger than the Windows installer.
 */
export function prunePython(dest) {
  for (const relativePath of ["include", "libs", "tcl", "Doc", "share"]) {
    prunePath(dest, join(dest, relativePath));
  }

  const libDirs = [join(dest, "Lib"), join(dest, "lib", `python${PYTHON_VERSION}`)].filter((dir) =>
    existsSync(dir),
  );
  for (const libDir of libDirs) {
    for (const name of PYTHON_LIB_REMOVALS) prunePath(dest, join(libDir, name));
    // Importing this needs tkinter, which is gone above.
    prunePath(dest, join(libDir, "turtle.py"));
  }

  // On POSIX, Tcl/Tk's runtime sits beside the lib dir rather than inside it:
  // the package directories (`tcl8.6`, `tk8.6`, `itcl4.2.2`, `thread2.8.6`)
  // and, on Linux/macOS, the shared libraries themselves (`libtcl8.6.so`).
  const posixLib = join(dest, "lib");
  if (existsSync(posixLib)) {
    for (const entry of readdirSync(posixLib)) {
      if (
        /^(tcl|tk|itcl|thread)[0-9.]*$/.test(entry) ||
        /^(lib)?(tcl|tk)[0-9.]*\.(so|dylib)/.test(entry)
      ) {
        prunePath(dest, join(posixLib, entry));
      }
    }
  }

  const moduleDirs = [join(dest, "DLLs"), ...libDirs.map((dir) => join(dir, "lib-dynload"))].filter(
    (dir) => existsSync(dir),
  );
  for (const moduleDir of moduleDirs) {
    for (const entry of readdirSync(moduleDir)) {
      if (PYTHON_NATIVE_REMOVALS.some((pattern) => pattern.test(entry))) {
        prunePath(dest, join(moduleDir, entry));
      }
    }
  }
}

/**
 * Recursively copies a directory tree while preserving relative symlinks.
 *
 * Node's built-in `fs.cpSync` resolves relative symlinks against the source
 * directory and recreates them with absolute paths pointing to the source
 * machine (e.g. `/Users/runner/work/...`). This breaks any symlink in packaged
 * bundles when installed on another machine.
 */
export function copyPythonDistribution(srcDir, destDir) {
  mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = join(srcDir, entry.name);
    const destPath = join(destDir, entry.name);

    if (entry.isSymbolicLink()) {
      const target = readlinkSync(srcPath);
      if (isAbsolute(target)) {
        if (target.startsWith(srcDir)) {
          const relTarget = relative(dirname(srcPath), target);
          try {
            symlinkSync(relTarget, destPath);
          } catch {
            const real = resolve(dirname(srcPath), target);
            copyFileSync(real, destPath);
            chmodSync(destPath, statSync(real).mode);
          }
        } else {
          const real = resolve(dirname(srcPath), target);
          const st = statSync(real);
          if (st.isDirectory()) {
            copyPythonDistribution(real, destPath);
          } else {
            copyFileSync(real, destPath);
            chmodSync(destPath, st.mode);
          }
        }
      } else {
        try {
          symlinkSync(target, destPath);
        } catch {
          const real = resolve(dirname(srcPath), target);
          const st = statSync(real);
          if (st.isDirectory()) {
            copyPythonDistribution(real, destPath);
          } else {
            copyFileSync(real, destPath);
            chmodSync(destPath, st.mode);
          }
        }
      }
    } else if (entry.isDirectory()) {
      copyPythonDistribution(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
      const st = statSync(srcPath);
      chmodSync(destPath, st.mode);
    }
  }
}

/**
 * Asserts that no symlinks in the bundled runtime are absolute or broken.
 */
export function verifyBundleSymlinks(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      const target = readlinkSync(full);
      if (isAbsolute(target)) {
        throw new Error(`Absolute symlink detected in bundled runtime: ${full} -> ${target}`);
      }
      if (!existsSync(full)) {
        throw new Error(`Broken symlink detected in bundled runtime: ${full} -> ${target}`);
      }
    } else if (entry.isDirectory()) {
      verifyBundleSymlinks(full);
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

/**
 * `jupyter-mimetypes` declares pyarrow for exactly one feature: moving pandas
 * objects in and out of the kernel via `get_variable`/`set_variable`. The CLI
 * never calls that API (its command groups are session, execution, files,
 * automation, run, ssh, utility, usage), and pandas is not installed either, so
 * the Arrow path cannot run. pyarrow costs 86 MB. Scanning the installed CLI
 * keeps it automatically if a later CLI version starts using the API.
 */
const VARIABLE_TRANSFER_API = /\b(get_variable|set_variable|deserialize_object|serialize_object)\s*\(/;

function* walkPythonFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkPythonFiles(full);
    else if (entry.name.endsWith(".py")) yield full;
  }
}

export function cliUsesVariableTransfer(siteDir) {
  const cliDir = join(siteDir, "colab_cli");
  // An unknown layout is not a reason to delete a dependency.
  if (!existsSync(cliDir)) return true;
  for (const file of walkPythonFiles(cliDir)) {
    if (VARIABLE_TRANSFER_API.test(readFileSync(file, "utf8"))) return true;
  }
  return false;
}

/**
 * Prune the installed site-packages tree.
 *
 * `bin/` holds console-script shims whose shebangs point at the build machine;
 * the app invokes `python -m colab_cli.cli`, so none of them are used.
 */
export function pruneSite(siteDir) {
  prunePath(siteDir, join(siteDir, "bin"));

  const pyarrowDir = join(siteDir, "pyarrow");
  if (!existsSync(pyarrowDir)) return;

  if (!cliUsesVariableTransfer(siteDir)) {
    prunePath(siteDir, pyarrowDir);
    prunePath(siteDir, join(siteDir, "pyarrow.libs"));
    for (const entry of readdirSync(siteDir)) {
      if (/^pyarrow-.*\.dist-info$/.test(entry)) prunePath(siteDir, join(siteDir, entry));
    }
    return;
  }

  // Even a kept pyarrow loses what only a C++ SDK consumes.
  for (const name of ["include", "src", "tests"]) prunePath(siteDir, join(pyarrowDir, name));
  for (const entry of readdirSync(pyarrowDir)) {
    if (entry.endsWith(".lib")) prunePath(siteDir, join(pyarrowDir, entry));
  }
  log("Kept pyarrow: colab_cli uses the variable-transfer API");
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
    error("uv executable not found. Install uv first: https://github.com/astral-sh/uv");
    process.exit(1);
  }

  log(`Using uv at: ${uv}`);

  // 1. Python standalone
  const pythonSource = findStandalonePython(uv);
  if (!pythonSource) {
    error("No usable standalone Python found. Get one with `uv python install 3.12`.");
    process.exit(1);
  }

  log(`Copying standalone Python from ${pythonSource}...`);
  if (existsSync(PYTHON_DEST)) {
    rmSync(PYTHON_DEST, { recursive: true, force: true });
  }
  copyPythonDistribution(pythonSource, PYTHON_DEST);
  prunePython(PYTHON_DEST);
  stripBytecode(PYTHON_DEST);
  verifyBundleSymlinks(PYTHON_DEST);

  const pythonBin = join(PYTHON_DEST, pythonExeName);
  if (!existsSync(pythonBin)) {
    error(`Python executable is not ready: ${pythonBin}`);
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
    "--python",
    pythonBin,
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
    error(`Installing ${CLI_PACKAGE}==${CLI_VERSION} with uv failed.`);
    process.exit(1);
  }

  pruneSite(SITE_DEST);
  stripBytecode(SITE_DEST);

  // 3. Verify and read version
  log("Verifying bundled CLI invocation...");
  const env = { ...process.env, PYTHONPATH: SITE_DEST, PYTHONDONTWRITEBYTECODE: "1" };
  const imports = spawnSync(
    pythonBin,
    ["-c", "import colab_cli.cli, jupyter_kernel_client, jupyter_mimetypes"],
    { env, encoding: "utf8" },
  );
  if (imports.status !== 0) {
    error(`Bundled runtime cannot import the CLI: ${imports.stderr || imports.stdout}`);
    process.exit(1);
  }
  const check = spawnSync(pythonBin, ["-m", "colab_cli.cli", "version"], { env, encoding: "utf8" });
  if (check.status !== 0) {
    error(`CLI verification failed: ${check.stderr || check.stdout}`);
    process.exit(1);
  }

  const versionMatch = check.stdout.match(/Version:\s*([0-9a-zA-Z.-]+)/);
  if (versionMatch && versionMatch[1] !== CLI_VERSION) {
    // The pin is the contract; a mismatch means the index served something else.
    error(`Expected ${CLI_PACKAGE}==${CLI_VERSION}, but the bundled runtime reports ${versionMatch[1]}`);
    process.exit(1);
  }
  log(`Bundled CLI verified successfully: version ${CLI_VERSION}`);

  verifyBundleSymlinks(TARGET_DIR);

  // 4. Write manifest.json
  // No timestamp: it changed on every build, which alone was enough to give two
  // builds of the same tag different bytes. The hash covers both runtime trees
  // and is what tells a later build whether the runtime actually moved.
  const runtimeHash = `${await hashRuntimeDir(PYTHON_DEST)}:${await hashRuntimeDir(SITE_DEST)}`;
  const manifest = {
    cliVersion: CLI_VERSION,
    pythonVersion: PYTHON_VERSION,
    layoutVersion: RUNTIME_LAYOUT_VERSION,
    platform: process.platform,
    arch: process.arch,
    runtimeHash,
  };
  writeFileSync(MANIFEST_DEST, JSON.stringify(manifest, null, 2), "utf8");
  log(`Wrote manifest to ${MANIFEST_DEST} (runtimeHash ${runtimeHash.slice(0, 8)}…${runtimeHash.slice(-8)})`);
  log("CLI bundling complete!");
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  bundle().catch((err) => {
    error(err.message);
    process.exit(1);
  });
}
