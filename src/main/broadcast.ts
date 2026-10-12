/** The one window events are pushed to, so IPC modules need no window reference. */

import type { BrowserWindow } from "electron";

let mainWindow: BrowserWindow | null = null;

export function setMainWindow(window: BrowserWindow | null): void {
  mainWindow = window;
}

export function broadcast(channel: string, payload: unknown): void {
  mainWindow?.webContents.send(channel, payload);
}
