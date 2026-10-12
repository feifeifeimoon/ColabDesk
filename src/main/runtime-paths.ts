import { app } from "electron";
import { join } from "node:path";

/**
 * Where a bundled Colab runtime lives, if this install ships one:
 * `resources/cli/{python,site,bridge}`. Undefined in a dev checkout that has
 * not run the bundler, which makes `resolveCli` fall back to the system CLI.
 */
export function bundledCliDir(): string | undefined {
  return app.isPackaged
    ? join(process.resourcesPath, "cli")
    : join(app.getAppPath(), "resources", "cli");
}
