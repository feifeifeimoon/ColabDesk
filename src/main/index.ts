/** Electron main entry: lifecycle only — window, IPC and the E2E fakes live in their own modules. */

import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { setMainWindow } from "./broadcast";
import { configDir } from "./colab/sessions";
import { Service } from "./colab/service";
import { UsageHistory } from "./colab/usage-history";
import { seedMockColabConfig } from "./e2e/cli-stub";
import { e2eMockEnabled, prepareE2EHost } from "./e2e/mode";
import { startMockRuntime } from "./e2e/runtime-server";
import { registerIpc } from "./ipc/register";
import { bundledCliDir } from "./runtime-paths";
import { SshManager } from "./ssh/manager";
import { createWindow, devIconPath, disableHardwareAccelerationForVirtualDisplays } from "./window";

const mock = e2eMockEnabled();
// First, because it moves HOME, userData and the CLI's config dir — and the
// composition below resolves all three.
if (mock) prepareE2EHost();
// The virtual displays the E2E container runs on have no usable GPU.
if (mock && process.platform === "linux") disableHardwareAccelerationForVirtualDisplays();

const bundledDir = bundledCliDir();
const service = new Service(bundledDir);
const ssh = new SshManager((name) => service.sshTarget(name));
// The CLI's own config directory belongs to the CLI; our history lives beside
// the app's other state. Its debug log is read only, as a backfill.
const usageHistory = new UsageHistory(
  join(app.getPath("userData"), "usage-history.jsonl"),
  join(configDir(), "colab.log"),
);
const login = registerIpc({ service, ssh, usageHistory, bundledDir });

app.whenReady().then(async () => {
  // The fake runtime listens before the window opens, because the session store
  // seeded below carries its address.
  if (mock) {
    const runtime = await startMockRuntime();
    seedMockColabConfig(runtime.url);
    app.on("before-quit", () => void runtime.close());
  }

  // macOS takes the window icon from the dock rather than BrowserWindow, and only in dev.
  const icon = devIconPath();
  if (icon) app.dock?.setIcon(icon);

  const window = createWindow();
  setMainWindow(window);
  window.on("closed", () => setMainWindow(null));

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) setMainWindow(createWindow());
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  login.cancel();
  ssh.dropAll();
});
