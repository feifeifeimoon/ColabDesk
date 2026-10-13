/**
 * electron-updater behind the narrow backend the updater talks to.
 *
 * This is the only file that knows the library exists. Its events are the sole
 * source of truth for state: the promises `checkForUpdates()` and
 * `downloadUpdate()` return reject with the same error the `error` event
 * carries, so awaiting them would report every failure twice — they are
 * swallowed here, on purpose.
 */

import { autoUpdater } from "electron-updater";
import type { UpdateBackend } from "./update-backend";
import type { UpdateEvent } from "./update-machine";
import { classifyUpdateFailure } from "./update-failure";

export function createElectronUpdateBackend(): UpdateBackend {
  // Checks are automatic; downloads are not. A background download can be
  // hundreds of megabytes on a metered connection, and the user is the only one
  // who knows whether now is a good time.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.autoRunAppAfterInstall = true;
  // Off by default would make every update a full re-download of the installer,
  // bundled runtime included.
  autoUpdater.disableDifferentialDownload = false;

  return {
    subscribe(listener: (event: UpdateEvent) => void) {
      const handlers: [Parameters<typeof autoUpdater.on>[0], (...args: never[]) => void][] = [
        ["checking-for-update", () => listener({ type: "checking" })],
        [
          "update-available",
          (info: { version: string }) => listener({ type: "available", version: info.version }),
        ],
        ["update-not-available", () => listener({ type: "not-available" })],
        [
          "download-progress",
          (progress: { percent: number }) => listener({ type: "progress", percent: progress.percent }),
        ],
        [
          "update-downloaded",
          (info: { version: string }) => listener({ type: "downloaded", version: info.version }),
        ],
        [
          "error",
          (error: Error) =>
            listener({
              type: "error",
              reason: classifyUpdateFailure(error?.message ?? String(error)),
              detail: error?.message ?? String(error),
            }),
        ],
      ];

      for (const [name, handler] of handlers) {
        autoUpdater.on(name, handler as never);
      }
      return () => {
        for (const [name, handler] of handlers) {
          autoUpdater.off(name, handler as never);
        }
      };
    },

    check() {
      autoUpdater.checkForUpdates().catch(() => {
        // The `error` event already reported it.
      });
    },

    download() {
      autoUpdater.downloadUpdate().catch(() => {
        // The `error` event already reported it.
      });
    },

    install() {
      autoUpdater.quitAndInstall();
    },
  };
}
