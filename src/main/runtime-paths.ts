import { app } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Where a bundled Colab runtime lives, if this install ships one:
 * `resources/cli/{python,site}`. Undefined in a dev checkout that has
 * not run the bundler, which makes `resolveCli` fall back to the system CLI.
 */
export function bundledCliDir(): string | undefined {
  if (app.isPackaged) {
    const packaged = join(process.resourcesPath, "cli");
    return existsSync(packaged) ? packaged : undefined;
  }

  // In development, resources/cli lives in the repository root.
  // When launched via electron-vite dev or electron out/main/index.js,
  // app.getAppPath() can resolve to out/main rather than the root directory.
  const candidates = [
    join(process.cwd(), "resources", "cli"),
    join(app.getAppPath(), "resources", "cli"),
    join(app.getAppPath(), "..", "..", "resources", "cli"),
  ];
  return candidates.find((dir) => existsSync(dir));
}
