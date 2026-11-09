/** Local port forwards: one loopback listener per mapping, over the session's SSH. */

import { ipcMain } from "electron";
import { EVENTS, IPC } from "@shared/ipc";
import type { PortForwardRequest } from "@shared/types";
import { broadcast } from "../../broadcast";
import { PortForwardManager } from "../../ssh/port-forward";
import type { IpcContext } from "../register";

export interface PortHandle {
  /** App quit: close every listener. */
  cancel(): void;
  /** Session stopped: the forwards and their connection are no longer usable. */
  forget(session: string): void;
}

export function registerPortHandlers({ ssh, log }: IpcContext): PortHandle {
  const manager = new PortForwardManager(
    ssh,
    (session) => broadcast(EVENTS.portsChanged, { session, forwards: manager.list(session) }),
    log,
  );

  ipcMain.handle(IPC.portsList, (_event, session: string) => manager.list(session));
  ipcMain.handle(IPC.portsCreate, (_event, request: PortForwardRequest) => manager.create(request));
  ipcMain.handle(IPC.portsStart, (_event, id: string) => {
    const forward = manager.start(id);
    if (!forward) throw new Error("端口映射不存在。");
    return forward;
  });
  ipcMain.handle(IPC.portsStop, (_event, id: string) => {
    const forward = manager.stop(id);
    if (!forward) throw new Error("端口映射不存在。");
    return forward;
  });
  ipcMain.handle(IPC.portsRemove, (_event, id: string) => {
    manager.remove(id);
  });
  ipcMain.handle(IPC.portsStopAll, (_event, session: string) => {
    // Hang-up: stop the listeners but keep the definitions so the popover can
    // restart them when the session is opened again. A session stop uses
    // `forget` instead.
    manager.stopAll(session);
  });

  return {
    cancel: () => manager.dispose(),
    forget: (session) => manager.forget(session),
  };
}
