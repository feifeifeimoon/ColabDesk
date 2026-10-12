/**
 * The seam that turns the app into a self-contained test target.
 *
 * `COLABDESK_E2E_MOCK=1` swaps the two things a CI container cannot have — a
 * Google account and a reachable runtime — for in-process fakes, and moves HOME
 * into a throwaway directory so the identity key, the CLI's `~/.config/colab-cli`
 * and the app's own userData all land there instead of in the developer's real
 * ones.
 *
 * Everything between the IPC handlers and those fakes is the production path:
 * the flag moves endpoints, it does not branch behaviour.
 */

import { app } from "electron";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { utils } from "ssh2";

export function e2eMockEnabled(): boolean {
  return process.env.COLABDESK_E2E_MOCK === "1";
}

let sandbox: string | null = null;

/**
 * Confines this run to `COLABDESK_E2E_HOME`. Must run before the composition
 * root reads `app.getPath("userData")` or anything calls `homedir()`, because
 * both resolve from here on.
 *
 * The directory is required rather than defaulted: a run that picked its own
 * HOME would leave keys and session files in a temp directory nobody cleans up,
 * and the harness could not point screenshots or teardown at it.
 */
export function prepareE2EHost(): void {
  if (!e2eMockEnabled()) throw new Error("prepareE2EHost 只在 COLABDESK_E2E_MOCK=1 下调用。");

  const home = process.env.COLABDESK_E2E_HOME;
  if (!home) {
    throw new Error("COLABDESK_E2E_MOCK=1 需要 COLABDESK_E2E_HOME 指向一个可丢弃的目录。");
  }

  mkdirSync(home, { recursive: true });
  sandbox = home;

  // Node's `homedir()` reads these; Electron's `app.getPath` does not. Setting
  // both keeps `~/.ssh`, the CLI's config dir and userData in one sandbox.
  process.env.HOME = home;
  process.env.USERPROFILE = home;

  const userData = join(home, "user-data");
  mkdirSync(userData, { recursive: true });
  app.setPath("home", home);
  app.setPath("userData", userData);

  writeIdentity(home);
}

export function e2eSandbox(): string {
  if (!sandbox) throw new Error("E2E 沙箱尚未建立。");
  return sandbox;
}

/**
 * An ed25519 keypair that actually parses.
 *
 * ssh2's own generator hands back a key its own parser rejects roughly once in
 * 250 tries (measured over 3000), and both the identity and the fake sshd's
 * host key come from it — so a suite of fifteen app launches meets the bad one
 * often enough to matter. Retrying is cheaper than the flake, and the check is
 * the parser the client itself will use.
 */
export function generateEd25519Key(): { private: string; public: string } {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const key = utils.generateKeyPairSync("ed25519");
    if (!(utils.parseKey(key.private) instanceof Error)) return key;
  }
  throw new Error("无法生成可解析的 ed25519 密钥：ssh2 的生成器连续失败。");
}

/**
 * `findIdentity()` needs a private key under the sandbox HOME. Generated per
 * run rather than committed: a fixture key in the repository is a real
 * credential, and nothing verifies it against a host key.
 */
function writeIdentity(home: string): void {
  const sshDir = join(home, ".ssh");
  mkdirSync(sshDir, { recursive: true });

  const keyPath = join(sshDir, "id_ed25519");
  // A relaunch into the same sandbox keeps the identity it already seeded.
  if (existsSync(keyPath)) return;

  const key = generateEd25519Key();
  writeFileSync(keyPath, key.private, { mode: 0o600 });
  writeFileSync(`${keyPath}.pub`, `${key.public}\n`);
}

/** The fake sshd's host key. Per run, for the same reason as the identity. */
export function generateHostKey(): string {
  return generateEd25519Key().private;
}
