/** Wires every IPC handler group and the SSH event stream to the renderer. */

import { EVENTS } from "@shared/ipc";
import { broadcast } from "../broadcast";
import type { Service } from "../colab/service";
import type { UsageHistory } from "../colab/usage-history";
import type { LogFile } from "../log-file";
import type { SshManager } from "../ssh/manager";
import { makeOutputFrames } from "../ssh/output-frames";
import { registerColabHandlers, type LoginHandle } from "./handlers/colab";
import { registerClipboardHandlers } from "./handlers/clipboard";
import { registerLogHandlers } from "./handlers/logs";
import { registerFileHandlers } from "./handlers/files";
import { registerTerminalHandlers } from "./handlers/terminal";
import { registerWindowHandlers } from "./handlers/window";

export interface IpcContext {
  service: Service;
  ssh: SshManager;
  usageHistory: UsageHistory;
  bundledDir: string | undefined;
  log: LogFile;
}

export function registerIpc(context: IpcContext): LoginHandle {
  const login = registerColabHandlers(context);
  registerTerminalHandlers(context);
  registerFileHandlers(context);
  registerWindowHandlers(context);
  registerLogHandlers(context);
  registerClipboardHandlers();

  // One message per channel per frame instead of one per network read; the
  // coalescing itself lives in `ssh/output-frames`.
  const frames = makeOutputFrames(({ channelId, session, data }) => {
    broadcast(EVENTS.sshData, { channelId, session, data });
  });
  context.ssh.on("data", (channelId: number, session: string, chunk: Buffer) => {
    frames.push(channelId, session, chunk);
  });
  context.ssh.on("exit", (channelId: number, session: string) => {
    // Whatever the shell said on its way out is still owed to the pane.
    frames.flush();
    broadcast(EVENTS.sshClosed, { channelId, session });
  });
  context.ssh.on("status", (session: string, status: string, error: string | null) => {
    broadcast(EVENTS.sshStatus, { session, status, error });
  });

  return login;
}
