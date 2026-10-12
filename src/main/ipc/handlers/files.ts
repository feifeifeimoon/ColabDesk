/** Runtime filesystem: SFTP listing, folders, deletes, and transfers with progress. */

import { ipcMain, dialog } from "electron";
import { EVENTS, IPC } from "@shared/ipc";
import type { TransferProgress } from "@shared/types";
import { broadcast } from "../../broadcast";
import { downloadFile, listDirectory, makeDirectory, removePath, uploadFile } from "../../ssh/sftp-ops";
import type { IpcContext } from "../register";

export function registerFileHandlers({ ssh }: IpcContext): void {
  let counter = 0;
  const report = (
    progress: Omit<TransferProgress, "id">,
    id: string,
  ): void => broadcast(EVENTS.transferProgress, { ...progress, id });

  ipcMain.handle(IPC.sftpList, async (_event, payload: { session: string; path: string }) => {
    const sftp = await (await ssh.acquire(payload.session)).sftp();
    return listDirectory(sftp, payload.path);
  });

  ipcMain.handle(IPC.sftpMkdir, async (_event, payload: { session: string; path: string }) => {
    const sftp = await (await ssh.acquire(payload.session)).sftp();
    await makeDirectory(sftp, payload.path);
  });

  ipcMain.handle(IPC.sftpDelete, async (_event, payload: { session: string; path: string }) => {
    const sftp = await (await ssh.acquire(payload.session)).sftp();
    await removePath(sftp, payload.path);
  });

  ipcMain.handle(
    IPC.sftpDownload,
    async (_event, payload: { session: string; remote: string; name: string }) => {
      const result = await dialog.showSaveDialog({ title: "保存到本地", defaultPath: payload.name });
      if (result.canceled || !result.filePath) return { canceled: true as const };

      const id = `t${counter++}`;
      const sftp = await (await ssh.acquire(payload.session)).sftp();
      const base = { session: payload.session, direction: "download" as const, name: payload.name };
      report({ ...base, transferred: 0, total: 0, done: false, error: null }, id);
      try {
        await downloadFile(sftp, payload.remote, result.filePath, (transferred, total) =>
          report({ ...base, transferred, total, done: false, error: null }, id),
        );
        report({ ...base, transferred: 0, total: 0, done: true, error: null }, id);
      } catch (error) {
        report({ ...base, transferred: 0, total: 0, done: true, error: (error as Error).message }, id);
        throw error;
      }
      return { canceled: false as const, path: result.filePath };
    },
  );

  ipcMain.handle(
    IPC.sftpUpload,
    async (_event, payload: { session: string; localPaths: string[]; remoteDir: string }) => {
      const sftp = await (await ssh.acquire(payload.session)).sftp();
      for (const localPath of payload.localPaths) {
        const name = localPath.split(/[\\/]/).pop() ?? localPath;
        const id = `t${counter++}`;
        const base = { session: payload.session, direction: "upload" as const, name };
        report({ ...base, transferred: 0, total: 0, done: false, error: null }, id);
        try {
          await uploadFile(
            sftp,
            localPath,
            `${payload.remoteDir.replace(/\/$/, "")}/${name}`,
            (transferred, total) => report({ ...base, transferred, total, done: false, error: null }, id),
          );
          report({ ...base, transferred: 0, total: 0, done: true, error: null }, id);
        } catch (error) {
          report({ ...base, transferred: 0, total: 0, done: true, error: (error as Error).message }, id);
          throw error;
        }
      }
    },
  );

  ipcMain.handle(IPC.pickUploadTargets, async () => {
    const result = await dialog.showOpenDialog({
      title: "选择要上传的文件",
      properties: ["openFile", "multiSelections"],
    });
    return result.canceled ? [] : result.filePaths;
  });
}
