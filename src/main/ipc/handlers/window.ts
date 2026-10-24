/**
 * Window controls for the app's own title bar.
 *
 * The window is frameless (Windows/Linux) or keeps only its inset traffic
 * lights (macOS), so minimize/maximize/close are rendered by the renderer and
 * serviced here. The maximized state is broadcast so the button can show the
 * restore glyph.
 */

import { BrowserWindow, ipcMain } from "electron";
import { EVENTS, IPC } from "@shared/ipc";
import { broadcast } from "../../broadcast";
import { syncTrafficLightPosition } from "../../window";
import type { IpcContext } from "../register";

export function registerWindowHandlers(_context: IpcContext): void {
  const windowFor = (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): BrowserWindow | null =>
    BrowserWindow.fromWebContents(event.sender);

  ipcMain.handle(IPC.windowMinimize, (event) => {
    windowFor(event)?.minimize();
  });
  ipcMain.handle(IPC.windowToggleMaximize, (event) => {
    const window = windowFor(event);
    if (!window) return;
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  });
  ipcMain.handle(IPC.windowClose, (event) => {
    windowFor(event)?.close();
  });
  ipcMain.on(IPC.windowSyncTrafficLights, (event, zoomFactor: number) => {
    const window = windowFor(event);
    if (window) syncTrafficLightPosition(window, zoomFactor);
  });
}

/** Keeps the maximize glyph in step with the actual window state. */
export function watchWindowState(window: BrowserWindow): void {
  const notify = (): void => broadcast(EVENTS.windowMaximized, window.isMaximized());
  window.on("maximize", notify);
  window.on("unmaximize", notify);
  window.on("enter-full-screen", notify);
  window.on("leave-full-screen", notify);
}
