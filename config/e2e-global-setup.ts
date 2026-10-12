/**
 * Builds the app once per run. `SKIP_BUILD=1` reuses an existing `out/`, which
 * is what CI does when the build came from an earlier job.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/** Playwright runs from where it was invoked; the suite is run from the root. */
const root = process.cwd();
const mainEntry = join(root, "out", "main", "index.js");

export default function globalSetup(): void {
  if (process.env.SKIP_BUILD === "1") {
    if (!existsSync(mainEntry)) {
      throw new Error("SKIP_BUILD=1 但 out/main/index.js 不存在——先跑一次 npm run build。");
    }
    return;
  }

  execFileSync("npm", ["run", "build"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}
