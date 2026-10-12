/** Session, quota, login and `~/.ssh/config` commands — the CLI-facing surface. */

import { ipcMain } from "electron";
import { EVENTS, IPC } from "@shared/ipc";
import { broadcast } from "../../broadcast";
import { resetAccountCache } from "../../colab/account";
import { LoginFlow } from "../../colab/login";
import { openExternalTerminal } from "../../colab/service";
import { resolveCli } from "../../colab/cli";
import type { IpcContext } from "../register";

export interface LoginHandle {
  cancel(): void;
}

export function registerColabHandlers({ service, usageHistory, bundledDir }: IpcContext): LoginHandle {
  let loginFlow: LoginFlow | null = null;

  ipcMain.handle(IPC.envStatus, () => service.envStatus());
  ipcMain.handle(IPC.listSessions, () => service.listSessions());
  ipcMain.handle(IPC.listUntracked, () => service.listUntracked());
  // Every reading the renderer asks for is also a point on the usage curve, so
  // the status bar's refresh rate is what the history is sampled at.
  ipcMain.handle(IPC.usage, async () => {
    const report = await service.usage();
    usageHistory.record(report);
    return report;
  });
  ipcMain.handle(IPC.usageTrend, () => usageHistory.trend());

  ipcMain.handle(
    IPC.createSession,
    (_event, options: { gpu: string | null; tpu: string | null; name: string | null; highMem: boolean }) =>
      service.createSession(options),
  );
  ipcMain.handle(IPC.stopSession, (_event, name: string) => service.stopSession(name));
  ipcMain.handle(IPC.restartKernel, (_event, name: string) => service.restartKernel(name));
  ipcMain.handle(IPC.syncSessions, () => service.syncSessions());

  ipcMain.handle(IPC.startLogin, () => {
    const cli = resolveCli(bundledDir);
    if (!cli) throw new Error("未找到 colab 命令，无法登录。");
    loginFlow?.cancel();
    loginFlow = new LoginFlow(cli, {
      onUrl: (url) => broadcast(EVENTS.authUrl, { url }),
      onDone: (code, output) => {
        loginFlow = null;
        // The flow may have signed in as somebody else; nothing cached about the
        // previous account is allowed to survive that.
        resetAccountCache();
        broadcast(EVENTS.authDone, { code, output });
      },
    });
    loginFlow.start();
  });
  ipcMain.handle(IPC.submitLoginCode, (_event, code: string) => loginFlow?.submit(code));
  ipcMain.handle(IPC.cancelLogin, () => loginFlow?.cancel());

  ipcMain.handle(IPC.sshSetup, (_event, name: string) => service.sshSetup(name));
  ipcMain.handle(IPC.sshRemove, (_event, name: string) => service.sshRemove(name));
  ipcMain.handle(IPC.sshOpenTerminal, (_event, name: string) => openExternalTerminal(name));

  return {
    cancel() {
      loginFlow?.cancel();
      loginFlow = null;
    },
  };
}
