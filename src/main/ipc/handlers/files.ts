/** Runtime filesystem: SFTP listing, folders, deletes, and transfers with progress. */

import { lstat } from "node:fs/promises";
import { ipcMain, dialog } from "electron";
import type { SFTPWrapper } from "ssh2";
import { EVENTS, IPC } from "@shared/ipc";
import type { TransferProgress, UploadRequest } from "@shared/types";
import { broadcast } from "../../broadcast";
import { retryTransientRead } from "../../colab/network-retry";
import { mockDialogAnswer, type MockDialogKind } from "../../e2e/dialog-stub";
import { e2eMockEnabled } from "../../e2e/mode";
import { sanitizeLocalName } from "../../local-file-name";
import type { IpcContext } from "../register";
import { readTextFile } from "../../ssh/sftp-text";
import {
  joinRemotePath,
  listDirectory,
  makeDirectory,
  nodeAt,
  removePath,
  removeQuietly,
} from "../../ssh/sftp-ops";
import {
  runTransfer,
  TransferCancelled,
  type TransferOutcome,
  type TransferTally,
} from "../../ssh/transfer-job";

/** The row fields that stay put for the length of one transfer. */
type TransferRow = Pick<TransferProgress, "id" | "session" | "direction" | "name">;

export function registerFileHandlers({ ssh }: IpcContext): void {
  let counter = 0;
  /** Live transfers by row id, so the renderer can stop one. */
  const active = new Map<string, { sftp: SFTPWrapper; abort: AbortController }>();

  const close = (sftp: SFTPWrapper): void => {
    try {
      sftp.end();
    } catch {
      // The connection may be gone already; the channel with it.
    }
  };

  /** One SFTP channel for the length of one operation, closed either way. */
  const withSftp = async <T>(session: string, run: (sftp: SFTPWrapper) => Promise<T>): Promise<T> => {
    const sftp = await (await ssh.acquire(session)).openSftp();
    try {
      return await run(sftp);
    } finally {
      close(sftp);
    }
  };

  /**
   * A picker, or the answer a spec planted (see `e2e/dialog-stub`). `null` from
   * the stub means no answer was staged, so the real dialog opens.
   */
  const pick = async (
    kind: MockDialogKind,
    open: () => Promise<{ canceled: boolean; filePaths: string[] }>,
  ): Promise<string[]> => {
    if (e2eMockEnabled()) {
      const planted = mockDialogAnswer(kind);
      if (planted !== null) return planted;
    }
    const result = await open();
    return result.canceled ? [] : result.filePaths;
  };

  const emitRow = (row: TransferRow, tally: Partial<TransferTally>, state: Partial<TransferProgress>): void => {
    const payload: TransferProgress = {
      ...row,
      transferred: tally.transferred ?? 0,
      total: tally.total ?? 0,
      ...(tally.filesTotal !== undefined && tally.filesTotal > 1
        ? { files: { done: tally.filesDone ?? 0, total: tally.filesTotal } }
        : {}),
      done: false,
      error: null,
      ...state,
    };
    broadcast(EVENTS.transferProgress, payload);
  };

  /**
   * Removes staging files that a cancelled upload left behind.
   *
   * Best-effort twice over: the row is already settled by the time this runs,
   * and it is not allowed to run past its budget — a tidy-up that cannot finish
   * must not hold the caller, or the list refresh behind it.
   */
  const SWEEP_BUDGET_MS = 5_000;
  const sweepStaged = async (session: string, paths: string[]): Promise<void> => {
    if (paths.length === 0) return;
    const work = (async () => {
      const sftp = await (await ssh.acquire(session)).openSftp();
      try {
        for (const path of paths) await removeQuietly(sftp, path);
      } finally {
        close(sftp);
      }
    })().catch(() => {
      // The connection may be gone as well; a staging file is not worth an
      // error on top of the cancellation the user already got.
    });
    const budget = new Promise<void>((resolve) => {
      setTimeout(resolve, SWEEP_BUDGET_MS);
    });
    await Promise.race([work, budget]);
  };

  /**
   * Runs one transfer and reports it on its own row.
   *
   * Failures *after* the row exists are the row's to report — a second copy in
   * the pane would be noise. Only a failure to get that far (no connection, no
   * SFTP channel) is thrown, because there is nothing on screen to carry it.
   */
  const runRow = async (
    session: string,
    direction: "upload" | "download",
    job: {
      kind: "file" | "folder";
      name: string;
      local: string;
      remote: string;
      conflict: UploadRequest["conflict"];
    },
  ): Promise<void> => {
    const row: TransferRow = { id: `t${counter++}`, session, direction, name: job.name };
    const abort = new AbortController();
    const sftp = await (await ssh.acquire(session)).openSftp();
    active.set(row.id, { sftp, abort });

    const staged: string[] = [];
    let outcome: TransferOutcome = { error: null, skipped: 0 };
    let failure: string | null = null;
    let canceled = false;
    /** Set when the row has been told how it ended; nothing may reopen it. */
    let settled = false;
    let tally: TransferTally = { transferred: 0, total: 0, filesDone: 0, filesTotal: 0 };
    emitRow(row, tally, {});

    const transfer = runTransfer(
      sftp,
      { ...job, direction, signal: abort.signal, onStaged: (path) => staged.push(path) },
      (next) => {
        // A cancelled transfer keeps ticking for a moment — the read or write
        // already in flight has to land somewhere — and one of those late
        // readouts would otherwise reopen a row that has already ended, leaving
        // it in flight for good.
        if (settled) return;
        tally = next;
        emitRow(row, next, {});
      },
    );
    try {
      // Closing the channel stops an in-flight read or write, but ssh2 does not
      // always settle the callback of one it dropped — so the signal is what
      // finishes the row, and the transfer promise is left to reject unheard.
      outcome = await Promise.race([
        transfer,
        new Promise<TransferOutcome>((_resolve, reject) => {
          abort.signal.addEventListener("abort", () => reject(new TransferCancelled()), { once: true });
        }),
      ]);
    } catch (error) {
      canceled = abort.signal.aborted || error instanceof TransferCancelled;
      // A cancelled transfer's own error is the channel going away; the row says
      // "cancelled" instead of repeating it.
      if (!canceled) failure = (error as Error).message;
    } finally {
      transfer.catch(() => {});
      active.delete(row.id);
      close(sftp);
      // Settled before the cleanup, never after it: what the row says must not
      // depend on a tidy-up finishing, and a cancelled transfer still has to
      // report itself.
      settled = true;
      emitRow(row, tally, {
        done: true,
        canceled,
        error: failure ?? outcome.error,
        ...(outcome.skipped > 0 ? { skipped: outcome.skipped } : {}),
      });
    }

    if (canceled) await sweepStaged(session, staged);
  };

  ipcMain.handle(IPC.sftpList, (_event, payload: { session: string; path: string }) =>
    withSftp(payload.session, (sftp) => listDirectory(sftp, payload.path)),
  );

  ipcMain.handle(IPC.sftpMkdir, (_event, payload: { session: string; path: string }) =>
    withSftp(payload.session, (sftp) => makeDirectory(sftp, payload.path)),
  );

  ipcMain.handle(IPC.sftpDelete, (_event, payload: { session: string; path: string }) =>
    withSftp(payload.session, (sftp) => removePath(sftp, payload.path)),
  );

  /**
   * Which of these paths are already there.
   *
   * Asked before an upload so the conflict can be a question instead of a
   * silent replacement; one call for the whole batch, since a drop can name a
   * folder's worth of files.
   */
  ipcMain.handle(IPC.sftpStat, (_event, payload: { session: string; paths: string[] }) =>
    withSftp(payload.session, async (sftp) => {
      const taken: { path: string; type: "file" | "dir" | "link" }[] = [];
      for (const path of payload.paths) {
        const node = await nodeAt(sftp, path);
        if (node) taken.push({ path, type: node.type });
      }
      return taken;
    }),
  );

  ipcMain.handle(IPC.sftpReadText, (_event, payload: { session: string; path: string }) =>
    // A read, so the one-retry rule applies — and the retry goes through
    // `acquire`, which is what makes it a rescue for a dropped connection
    // rather than a second look at the same dead channel.
    retryTransientRead(() => withSftp(payload.session, (sftp) => readTextFile(sftp, payload.path)), 2),
  );

  ipcMain.handle(IPC.sftpDownload, async (_event, payload: {
    session: string;
    remote: string;
    name: string;
    title: string;
  }) => {
    const chosen = await pick("save", async () => {
      const result = await dialog.showSaveDialog({
        title: payload.title,
        defaultPath: sanitizeLocalName(payload.name),
      });
      return { canceled: result.canceled, filePaths: result.filePath ? [result.filePath] : [] };
    });
    const filePath = chosen[0];
    if (!filePath) return { canceled: true as const };

    await runRow(payload.session, "download", {
      kind: "file",
      name: payload.name,
      local: filePath,
      remote: payload.remote,
      conflict: "replace",
    });
    return { canceled: false as const, path: filePath };
  });

  ipcMain.handle(IPC.sftpDownloadFolder, async (_event, payload: {
    session: string;
    remote: string;
    name: string;
    title: string;
  }) => {
    const chosen = await pick("openDirectory", () =>
      dialog.showOpenDialog({
        title: payload.title,
        properties: ["openDirectory", "createDirectory"],
      }),
    );
    const directory = chosen[0];
    if (!directory) return { canceled: true as const };

    await runRow(payload.session, "download", {
      kind: "folder",
      name: payload.name,
      local: directory,
      remote: payload.remote,
      conflict: "replace",
    });
    return { canceled: false as const, path: directory };
  });

  ipcMain.handle(IPC.sftpUpload, async (_event, payload: UploadRequest) => {
    // Files go one by one and a failure does not end the batch: the rest of the
    // selection was asked for too, and each row says how its own file went.
    for (const localPath of payload.localPaths) {
      const name = localPath.split(/[\\/]/).pop() ?? localPath;
      const kind = (await lstat(localPath)).isDirectory() ? "folder" : "file";
      await runRow(payload.session, "upload", {
        kind,
        name,
        local: localPath,
        remote: joinRemotePath(payload.remoteDir, name),
        conflict: payload.conflict,
      });
    }
  });

  ipcMain.handle(IPC.sftpCancel, (_event, id: string) => {
    const running = active.get(id);
    if (!running) return;
    // Aborting the flag stops the walk; ending the channel breaks the operation
    // already in flight, which is the one that would otherwise run to the end.
    running.abort.abort();
    close(running.sftp);
  });

  ipcMain.handle(IPC.pickUploadTargets, (_event, payload: { title: string }) =>
    pick("open", () =>
      dialog.showOpenDialog({
        title: payload.title,
        properties: ["openFile", "multiSelections"],
      }),
    ),
  );

  ipcMain.handle(IPC.pickUploadFolder, (_event, payload: { title: string }) =>
    pick("openDirectory", () =>
      dialog.showOpenDialog({
        title: payload.title,
        properties: ["openDirectory"],
      }),
    ),
  );
}
