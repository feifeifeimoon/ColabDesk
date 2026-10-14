/**
 * The log's IPC surface: where it is, and how to get to it.
 *
 * The path is the point of this file. "Send me the log" is only a request a
 * user can satisfy if something tells them where the log is, and this is the
 * only place that knows.
 */

import { ipcMain, shell } from "electron";
import { IPC } from "@shared/ipc";
import type { IpcContext } from "../register";

export function registerLogHandlers({ log }: IpcContext): void {
  ipcMain.handle(IPC.logPath, () => log.path());
  ipcMain.handle(IPC.logReveal, () => {
    // A log nothing has written yet still has to be answerable: creating it
    // first is what makes the folder worth opening.
    log.ensure();
    shell.showItemInFolder(log.path());
  });
}
