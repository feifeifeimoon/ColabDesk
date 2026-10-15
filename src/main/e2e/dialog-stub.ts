/**
 * Native pickers, answered from the sandbox.
 *
 * A spec can drive every part of the app except the OS file dialog, which
 * Playwright has no handle on. Under the mock, a picker reads its answer from a
 * file the spec plants — so the test still goes through the app's own button,
 * its own IPC and its own transfer, and only the choice of path is staged.
 *
 * The file lives at `$COLABDESK_E2E_HOME/dialogs/<kind>`, one path per line; an
 * empty file is a cancelled dialog. No file at all means "no answer planted",
 * and the real picker opens as usual.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The three shapes the file browser asks for. */
export type MockDialogKind = "open" | "openDirectory" | "save";

export function mockDialogAnswer(kind: MockDialogKind): string[] | null {
  const home = process.env.COLABDESK_E2E_HOME;
  if (!home) return null;

  const path = join(home, "dialogs", kind);
  if (!existsSync(path)) return null;

  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
