/**
 * The E2E host: the part of the seam that needs Electron.
 *
 * `mode.ts` answers the flag without importing anything, so unit tests that
 * touch a domain module do not pull in Electron's lazy binary download. This
 * file is imported only by the composition root and the fake runtime.
 */

import { app } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { ensureIdentity, generateEd25519Key } from "../ssh/identity";
import { e2eMockEnabled } from "./mode";

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

  // Node's `homedir()` reads these; Electron's `app.getPath` does not. Setting
  // both keeps `~/.ssh`, the CLI's config dir and userData in one sandbox.
  process.env.HOME = home;
  process.env.USERPROFILE = home;

  const userData = join(home, "user-data");
  mkdirSync(userData, { recursive: true });
  app.setPath("home", home);
  app.setPath("userData", userData);

  ensureIdentity(home);
}

/** The fake sshd's host key. Per run, for the same reason as the identity. */
export function generateHostKey(): string {
  return generateEd25519Key().private;
}
