/**
 * The updater's IPC surface: read the state, ask for the three actions.
 *
 * When there is no updater — a development checkout, or macOS before signing
 * exists — the status says so rather than the channel failing. A panel with
 * nothing to show is honest; one that shows a button which silently does
 * nothing is not.
 */

import { ipcMain } from "electron";
import { IPC } from "@shared/ipc";
import type { UpdateStatus } from "@shared/types";
import type { Updater } from "../../updater/updater";

/**
 * Takes a getter rather than the updater: this has to register before the
 * window opens, and the updater is assembled asynchronously during startup.
 */
export function registerUpdateHandlers(current: () => Updater | null): void {
  const unavailable: UpdateStatus = { state: "unavailable" };

  ipcMain.handle(IPC.updateStatus, (): UpdateStatus => current()?.status() ?? unavailable);
  // A check the user asked for, which is what makes a failure worth reporting.
  ipcMain.handle(IPC.updateCheck, () => current()?.check(true));
  ipcMain.handle(IPC.updateDownload, () => current()?.download());
  ipcMain.handle(IPC.updateInstall, () => current()?.install());
}
