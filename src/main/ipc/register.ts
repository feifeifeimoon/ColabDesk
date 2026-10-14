/** Wires every IPC handler group and the SSH event stream to the renderer. */

import { EVENTS } from "@shared/ipc";
import { broadcast } from "../broadcast";
import type { Service } from "../colab/service";
import type { UsageHistory } from "../colab/usage-history";
import type { SshManager } from "../ssh/manager";
import { registerColabHandlers, type LoginHandle } from "./handlers/colab";
import { registerClipboardHandlers } from "./handlers/clipboard";
import { registerFileHandlers } from "./handlers/files";
import { registerTerminalHandlers } from "./handlers/terminal";
import { registerWindowHandlers } from "./handlers/window";

export interface IpcContext {
  service: Service;
  ssh: SshManager;
  usageHistory: UsageHistory;
  bundledDir: string | undefined;
}

export function registerIpc(context: IpcContext): LoginHandle {
  const login = registerColabHandlers(context);
  registerTerminalHandlers(context);
  registerFileHandlers(context);
  registerWindowHandlers(context);
  registerClipboardHandlers();

  context.ssh.on("data", (channelId: number, session: string, chunk: Buffer) => {
    broadcast(EVENTS.sshData, { channelId, session, data: chunk.toString("base64") });
  });
  context.ssh.on("exit", (channelId: number, session: string) => {
    broadcast(EVENTS.sshClosed, { channelId, session });
  });
  context.ssh.on("status", (session: string, status: string, error: string | null) => {
    broadcast(EVENTS.sshStatus, { session, status, error });
  });

  return login;
}
