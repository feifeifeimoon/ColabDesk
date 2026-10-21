/** Electron main entry: lifecycle only — window, IPC and the E2E fakes live in their own modules. */

import { app, BrowserWindow } from "electron";
import { dirname, join } from "node:path";
import { setMainWindow } from "./broadcast";
import { configDir } from "./colab/sessions";
import { Service } from "./colab/service";
import { UsageHistory } from "./colab/usage-history";
import { seedMockColabConfig } from "./e2e/cli-stub";
import { e2eMockEnabled } from "./e2e/mode";
import { prepareE2EHost } from "./e2e/host";
import { startMockRuntime } from "./e2e/runtime-server";
import { registerUpdateHandlers } from "./ipc/handlers/updates";
import { registerIpc } from "./ipc/register";
import { LogFile } from "./log-file";
import { installProcessErrorGuards } from "./process-guards";
import { bundledCliDir } from "./runtime-paths";
import { setupUpdater } from "./updater/setup-updater";
import type { Updater } from "./updater/updater";
import { SshManager } from "./ssh/manager";
import { createWindow, devIconPath, disableHardwareAccelerationForVirtualDisplays } from "./window";

const mock = e2eMockEnabled();
// First, because it moves HOME, userData and the CLI's config dir — and the
// composition below resolves all three.
if (mock) prepareE2EHost();
// The virtual displays the E2E container runs on have no usable GPU.
if (mock && process.platform === "linux") disableHardwareAccelerationForVirtualDisplays();

// The log lives with the app's other state, not beside the executable. The
// install directory is wherever the user put it — writable in the per-user
// install we ship, read-only the moment somebody installs for all users, and
// not ours to write into at all on macOS, where it is a signed bundle. This
// path also outlives an uninstall, like the history next to it.
const log = new LogFile(join(app.getPath("userData"), "logs"));
installProcessErrorGuards(log);

const bundledDir = bundledCliDir();
const service = new Service(bundledDir, log);
const ssh = new SshManager((name) => service.sshTarget(name));
// The CLI's own config directory belongs to the CLI; our history lives beside
// the app's other state. Its debug log is read only, as a backfill.
const usageHistory = new UsageHistory(
  join(app.getPath("userData"), "usage-history.jsonl"),
  join(configDir(), "colab.log"),
);
const login = registerIpc({ service, ssh, usageHistory, bundledDir, log });

// One line per start, so a log sent in a bug report says which build produced
// it and where that build is installed — the first two questions a report
// usually raises, and the two nobody can answer from the log itself.
log.write(
  "app",
  [
    `ColabDesk ${app.getVersion()} · ${process.platform} ${process.arch} · ${app.isPackaged ? "packaged" : "dev"}${mock ? " · e2e mock" : ""}`,
    `安装目录：${app.isPackaged ? dirname(app.getPath("exe")) : "（开发运行，无安装目录）"}`,
    `colab CLI：${service.cliPath() ?? "未找到"}${service.cliSource() ? `（${service.cliSource()}）` : ""}`,
  ].join("\n"),
);

// Registered now and filled in during startup: the renderer can ask about
// updates as soon as the window opens, which is before the updater — assembled
// behind an async import — exists.
let updater: Updater | null = null;
registerUpdateHandlers(() => updater);

app.whenReady().then(async () => {
  // The fake runtime listens before the window opens, because the session store
  // seeded below carries its address.
  if (mock) {
    const runtime = await startMockRuntime();
    seedMockColabConfig(runtime.url);
    app.on("before-quit", () => void runtime.close());
  }

  updater = await setupUpdater(() => {
    login.cancel();
    ssh.dropAll();
  });

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
  // Stopped alongside the sessions: an update handoff cannot replace files a
  // live process still holds, and a pending check would only fire into a
  // process that is on its way out.
  updater?.stop();
});
