/**
 * Where the CLI keeps the OAuth credential, and how the app reads it.
 *
 * Until 0.7.x that was a plain `token.json`; 0.8.0 moved it to the OS keyring
 * (`google-colab-cli` / `oauth_token`) and deletes the old file the first time
 * it reads the keyring successfully. The app has to follow, or every read it
 * makes directly — quota, account, assignments — turns into "sign in again" the
 * moment the CLI migrates.
 *
 * The keyring has no command-line reader, so the value is fetched through the
 * same interpreter that runs the CLI: one short `python -c`, cached. A CLI
 * older than 0.8.0 has no `keyring` module; that exit code is the signal to
 * read `token.json` directly instead.
 */

import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { e2eMockEnabled } from "../e2e/mode";
import type { ResolvedCli } from "./cli";

/** Both constants are the CLI's (`colab_cli/auth.py`); changing them would be a contract break. */
const KEYRING_SERVICE = "google-colab-cli";
const KEYRING_ACCOUNT = "oauth_token";

/** macOS and Windows answer in milliseconds; this only stops a wedged helper. */
const HELPER_TIMEOUT_MS = 10_000;
/**
 * A sign-in in another terminal should be noticed without restarting the app,
 * and a burst of reads (status bar, account, session list) must cost one spawn.
 */
const CACHE_TTL_MS = 10_000;

/** Exit codes the helper scripts use to tell "no keyring here" from "it failed". */
const EXIT_UNSUPPORTED = 3;
const EXIT_FAILED = 4;

const READ_SCRIPT = `
import sys
try:
    import keyring
except Exception:
    sys.exit(${EXIT_UNSUPPORTED})
try:
    value = keyring.get_password(${JSON.stringify(KEYRING_SERVICE)}, ${JSON.stringify(KEYRING_ACCOUNT)})
except Exception:
    sys.exit(${EXIT_FAILED})
if value:
    sys.stdout.write(value)
`;

const WRITE_SCRIPT = `
import sys
value = sys.stdin.read()
if not value:
    sys.exit(2)
try:
    import keyring
except Exception:
    sys.exit(${EXIT_UNSUPPORTED})
try:
    keyring.set_password(${JSON.stringify(KEYRING_SERVICE)}, ${JSON.stringify(KEYRING_ACCOUNT)}, value)
except Exception:
    sys.exit(${EXIT_FAILED})
`;

const DELETE_SCRIPT = `
import sys
try:
    import keyring
except Exception:
    sys.exit(${EXIT_UNSUPPORTED})
try:
    keyring.delete_password(${JSON.stringify(KEYRING_SERVICE)}, ${JSON.stringify(KEYRING_ACCOUNT)})
except Exception:
    pass
`;

/** The CLI the app resolved, and the only interpreter that can reach the keyring. */
let cli: ResolvedCli | null = null;
let cache: { value: StoredCredential | null; at: number } | null = null;
/** Startup asks for usage, account and environment at once; they share one helper. */
let pending: Promise<StoredCredential | null> | null = null;
/** A read already in flight must not repopulate the cache after a write or sign-out. */
let generation = 0;

export function setCredentialCli(next: ResolvedCli | null): void {
  cli = next;
  invalidateCredentialCache();
}

export function invalidateCredentialCache(): void {
  cache = null;
  pending = null;
  generation += 1;
}

export interface StoredCredential {
  /** The same JSON the CLI writes: access token, refresh token, expiry. */
  json: string;
}

/** The interpreter to ask, or null when this CLI's Python cannot be found. */
export function credentialInterpreter(resolved: ResolvedCli | null): string | null {
  if (!resolved) return null;
  // The bundled CLI *is* its interpreter (`python -m colab_cli.cli`).
  if (resolved.source === "bundled") return resolved.exe;

  // `uv tool` and pip put the shim next to the venv's interpreter.
  const dir = dirname(resolved.exe);
  const names = process.platform === "win32" ? ["python.exe"] : ["python3", "python"];
  for (const name of names) {
    const candidate = join(dir, name);
    if (existsSync(candidate)) return candidate;
  }

  // A POSIX console script names its interpreter in the shebang; only trust it
  // when that is actually a Python, not a shell wrapper.
  const shebang = readShebang(resolved.exe);
  return shebang && /^python[0-9.]*$/.test(basename(shebang)) ? shebang : null;
}

function readShebang(exe: string): string | null {
  if (process.platform === "win32") return null;
  let fd: number | null = null;
  try {
    fd = openSync(exe, "r");
    const buffer = Buffer.alloc(200);
    const head = buffer.subarray(0, readSync(fd, buffer, 0, buffer.length, 0)).toString("utf8");
    if (!head.startsWith("#!")) return null;
    const interpreter = head.slice(2).split("\n")[0].trim().split(/\s+/)[0];
    return interpreter && existsSync(interpreter) ? interpreter : null;
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        // The descriptor is only read from; a failed close changes nothing here.
      }
    }
  }
}

/**
 * The keyring answer for one helper run.
 *
 * `unsupported` means the installed CLI predates 0.8.0 and still expects the
 * file; `failed` means this CLI has a keyring but could not use it (locked,
 * broken backend), in which case the CLI itself falls back to the file too.
 */
export type KeyringOutcome = "ok" | "unsupported" | "failed";

export function keyringOutcome(exitCode: number | null): KeyringOutcome {
  if (exitCode === 0) return "ok";
  if (exitCode === EXIT_UNSUPPORTED) return "unsupported";
  return "failed";
}

function helperEnv(resolved: ResolvedCli): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...resolved.env,
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONIOENCODING: "utf-8",
  };
}

interface HelperResult {
  outcome: KeyringOutcome;
  stdout: string;
}

function runHelper(interpreter: string, env: NodeJS.ProcessEnv, script: string, stdin?: string): Promise<HelperResult> {
  return new Promise((resolve) => {
    const child = spawn(interpreter, ["-c", script], {
      env,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: HELPER_TIMEOUT_MS,
    });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    // Drained, never parsed: a locked Linux keyring warns on stderr.
    child.stderr.resume();
    child.on("error", () => resolve({ outcome: "failed", stdout: "" }));
    child.on("close", (code) => resolve({ outcome: keyringOutcome(code), stdout }));
    child.stdin.end(stdin ?? "");
  });
}

function readLegacy(path: string): StoredCredential | null {
  if (!existsSync(path)) return null;
  try {
    return { json: readFileSync(path, "utf8") };
  } catch {
    return null;
  }
}

function writeLegacy(path: string, json: string): boolean {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, json, { encoding: "utf8", mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

function removeLegacy(path: string): void {
  if (!existsSync(path)) return;
  try {
    unlinkSync(path);
  } catch {
    // Ignore: the CLI deletes the file itself the next time it uses the keyring.
  }
}

async function readKeyring(): Promise<StoredCredential | null> {
  const interpreter = credentialInterpreter(cli);
  if (!cli || !interpreter) return null;
  const { outcome, stdout } = await runHelper(interpreter, helperEnv(cli), READ_SCRIPT);
  const value = outcome === "ok" ? stdout.trim() : "";
  return value ? { json: value } : null;
}

/**
 * The credential the CLI would use right now: the keyring when it has one,
 * the pre-0.8.0 file otherwise. Null means "not signed in", not "unreadable".
 */
export async function readCredential(legacyFile: string): Promise<StoredCredential | null> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  if (pending) return pending;

  const readGeneration = generation;
  const work = (async () => {
    // The E2E CLI is an in-process stub with no keyring and a seeded token file;
    // spawning an interpreter there would only slow the suite down.
    const value = e2eMockEnabled() ? readLegacy(legacyFile) : ((await readKeyring()) ?? readLegacy(legacyFile));
    if (readGeneration === generation) cache = { value, at: Date.now() };
    return value;
  })();
  const shared = work.finally(() => {
    if (pending === shared) pending = null;
  });
  pending = shared;
  return shared;
}

/**
 * Stores a refreshed credential where the CLI will look for it.
 *
 * A keyring failure deliberately does not fall back to writing `token.json`
 * when the CLI has a keyring: the app would be downgrading a credential the
 * CLI just moved to the OS store. The caller keeps using the token it already
 * holds; the next refresh tries again.
 */
export async function writeCredential(legacyFile: string, json: string): Promise<boolean> {
  invalidateCredentialCache();
  if (e2eMockEnabled()) return writeLegacy(legacyFile, json);

  const interpreter = cli ? credentialInterpreter(cli) : null;
  if (cli && interpreter) {
    const { outcome } = await runHelper(interpreter, helperEnv(cli), WRITE_SCRIPT, json);
    if (outcome === "ok") {
      removeLegacy(legacyFile);
      return true;
    }
    if (outcome === "failed") return false;
  }
  return writeLegacy(legacyFile, json);
}

/** Sign out of both stores: an old file must not resurrect a removed session. */
export async function deleteCredential(legacyFile: string): Promise<void> {
  invalidateCredentialCache();
  const interpreter = cli ? credentialInterpreter(cli) : null;
  if (!e2eMockEnabled() && cli && interpreter) {
    await runHelper(interpreter, helperEnv(cli), DELETE_SCRIPT);
  }
  removeLegacy(legacyFile);
}
