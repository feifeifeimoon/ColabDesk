/** Terminal channels: one PTY shell per pane, multiplexed on the session's SSH connection. */

import { ipcMain } from "electron";
import { IPC } from "@shared/ipc";
import type { IpcContext } from "../register";

export function registerTerminalHandlers({ ssh }: IpcContext): void {
  ipcMain.handle(IPC.sshDisconnect, (_event, name: string) => {
    ssh.drop(name);
  });

  ipcMain.handle(IPC.termOpen, (_event, options: { session: string; cols: number; rows: number }) =>
    ssh.openTerminal(options.session, options.cols, options.rows),
  );
  ipcMain.handle(IPC.termWrite, (_event, payload: { channelId: number; data: string }) => {
    ssh.write(payload.channelId, payload.data);
  });
  ipcMain.handle(IPC.termResize, (_event, payload: { channelId: number; cols: number; rows: number }) => {
    ssh.resize(payload.channelId, payload.cols, payload.rows);
  });
  ipcMain.handle(IPC.termClose, (_event, channelId: number) => {
    ssh.closeTerminal(channelId);
  });
}
