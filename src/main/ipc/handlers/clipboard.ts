/**
 * The clipboard, reached from the main process because there is nowhere else
 * to reach it from.
 *
 * `clipboard` is a main-process module — a preload that imports it gets
 * `undefined`, and the failure only shows up on the first copy, as
 * "Cannot read properties of undefined (reading 'writeText')". Everything in
 * the renderer that copies or pastes goes through these two channels.
 */

import { clipboard, ipcMain } from "electron";
import { IPC } from "@shared/ipc";

export function registerClipboardHandlers(): void {
  ipcMain.handle(IPC.clipboardRead, () => clipboard.readText());
  ipcMain.handle(IPC.clipboardWrite, (_event, text: string) => {
    clipboard.writeText(text);
  });
}
