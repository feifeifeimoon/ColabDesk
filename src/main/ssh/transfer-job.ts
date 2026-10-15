/**
 * One transfer: a file or a folder, one direction, with its own progress.
 *
 * The job owns everything between "the user asked for this" and "the row can be
 * finished": walking a folder, deciding what to do about a name that is already
 * taken, adding up progress across many files, and noticing that the user
 * cancelled. The SFTP side is `sftp-ops`; the row and its IPC are the handler's.
 * It answers with facts — how many files failed, how many were skipped — rather
 * than a verdict, so the wording stays beside the walk that found them.
 */

import { lstat, mkdir, readdir, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { SFTPWrapper } from "ssh2";
import { sanitizeLocalName } from "../local-file-name";
import {
  baseNameOf,
  deconflictedName,
  downloadFile,
  exists,
  joinRemotePath,
  listDirectory,
  makeDirectories,
  uploadFile,
} from "./sftp-ops";

/** What to do about a destination name that is already taken. */
export type ConflictPolicy = "replace" | "skip" | "keepBoth";

/**
 * The user stopped this transfer.
 *
 * Its own type because nothing went wrong: the row says "cancelled", not a
 * failure, and the batch that contained it is not less successful for it.
 */
export class TransferCancelled extends Error {
  constructor() {
    super("transfer cancelled");
    this.name = "TransferCancelled";
  }
}

export interface TransferRequest {
  direction: "upload" | "download";
  kind: "file" | "folder";
  /** This machine's side: what to read (upload) or where to write (download). */
  local: string;
  /** The runtime's side: where to write (upload) or what to read (download). */
  remote: string;
  conflict: ConflictPolicy;
  signal: AbortSignal;
  /**
   * Where an upload staged a file, called before any byte of it moves. A
   * cancellation closes the channel that would have cleaned up, so whoever
   * asked for the transfer needs to know what to go back for.
   */
  onStaged?: (remotePath: string) => void;
}

export interface TransferTally {
  transferred: number;
  total: number;
  filesDone: number;
  filesTotal: number;
}

export interface TransferOutcome {
  /** Composed here, where the failures are known; null when nothing went wrong. */
  error: string | null;
  /** Files left alone because they were already there — plus links, see below. */
  skipped: number;
}

export type TransferReporter = (tally: TransferTally) => void;

interface WalkedFile {
  readonly relative: string;
  readonly size: number;
}

interface LocalTree {
  files: WalkedFile[];
  directories: string[];
  /** Symbolic links and other non-regular entries, which an upload leaves out. */
  links: number;
}

/**
 * Every regular file under a local folder, plus the folders to create.
 *
 * Symbolic links are left out rather than followed: a link can point outside the
 * folder (the upload would carry more than the user selected) or back into it
 * (the walk would never finish), and no single answer covers both. A
 * `node_modules` full of junctions is the everyday case.
 */
async function walkLocal(root: string): Promise<LocalTree> {
  const files: WalkedFile[] = [];
  const directories: string[] = [];
  let links = 0;

  const visit = async (relative: string): Promise<void> => {
    for (const entry of await readdir(relative ? join(root, relative) : root, { withFileTypes: true })) {
      // The relative path is POSIX, because the remote end reads it as a path:
      // a Windows separator in here would land in a filename instead.
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        directories.push(child);
        await visit(child);
      } else if (entry.isFile()) {
        files.push({ relative: child, size: (await lstat(join(root, child))).size });
      } else {
        links += 1;
      }
    }
  };

  await visit("");
  return { files, directories, links };
}

/** The same walk on the runtime, over SFTP. */
async function walkRemote(
  sftp: SFTPWrapper,
  root: string,
): Promise<{ files: WalkedFile[]; directories: string[]; links: number }> {
  const files: WalkedFile[] = [];
  const directories: string[] = [];
  let links = 0;

  const visit = async (relative: string, path: string): Promise<void> => {
    for (const entry of await listDirectory(sftp, path)) {
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.type === "dir") {
        directories.push(child);
        await visit(child, joinRemotePath(path, entry.name));
      } else if (entry.type === "file") {
        files.push({ relative: child, size: entry.size });
      } else {
        links += 1;
      }
    }
  };

  await visit("", root);
  return { files, directories, links };
}

/** A fresh name beside the given remote path, for a transfer that must not replace. */
async function freeRemoteName(sftp: SFTPWrapper, path: string): Promise<string> {
  const parent = dirnameRemote(path);
  const taken = new Set((await listDirectory(sftp, parent)).map((entry) => entry.name));
  return joinRemotePath(parent, deconflictedName(baseNameOf(path), (name) => taken.has(name)));
}

/** A fresh name beside the given local path. */
async function freeLocalName(path: string): Promise<string> {
  const parent = dirname(path);
  const taken = new Set(await readdir(parent));
  return join(parent, deconflictedName(basename(path), (name) => taken.has(name)));
}

function dirnameRemote(path: string): string {
  const index = path.replace(/\/+$/, "").lastIndexOf("/");
  return index <= 0 ? "/" : path.slice(0, index);
}

async function existsLocal(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

/** What a failure list says, in one sentence, when the transfer is done. */
function summarize(failures: string[]): string | null {
  if (failures.length === 0) return null;
  if (failures.length === 1) return failures[0];
  return `${failures.length} 项失败：${failures[0]}`;
}

export async function runTransfer(
  sftp: SFTPWrapper,
  request: TransferRequest,
  report: TransferReporter,
): Promise<TransferOutcome> {
  if (request.direction === "upload") {
    return request.kind === "folder"
      ? uploadFolder(sftp, request, report)
      : uploadOne(sftp, request, report);
  }
  return request.kind === "folder"
    ? downloadFolder(sftp, request, report)
    : downloadOne(sftp, request, report);
}

async function uploadOne(
  sftp: SFTPWrapper,
  request: TransferRequest,
  report: TransferReporter,
): Promise<TransferOutcome> {
  let target = request.remote;
  if (await exists(sftp, target)) {
    if (request.conflict === "skip") return { error: null, skipped: 1 };
    if (request.conflict === "keepBoth") target = await freeRemoteName(sftp, target);
  }

  const { size } = await lstat(request.local);
  await uploadFile(
    sftp,
    request.local,
    target,
    (transferred, total) => report({ transferred, total, filesDone: 1, filesTotal: 1 }),
    request.onStaged,
  );
  report({ transferred: size, total: size, filesDone: 1, filesTotal: 1 });
  return { error: null, skipped: 0 };
}

async function uploadFolder(
  sftp: SFTPWrapper,
  request: TransferRequest,
  report: TransferReporter,
): Promise<TransferOutcome> {
  const { files, directories, links } = await walkLocal(request.local);
  const total = files.reduce((sum, file) => sum + file.size, 0);

  let root = request.remote;
  if (request.conflict === "keepBoth" && (await exists(sftp, root))) {
    root = await freeRemoteName(sftp, root);
  }

  // Folders merge into an existing tree; only files are skipped or replaced.
  // Refusing an existing folder would make "upload this again after adding a
  // file" impossible, and that is the ordinary case for a project folder.
  await makeDirectories(sftp, root);
  for (const relative of directories) await makeDirectories(sftp, joinRemotePath(root, relative));

  const failures: string[] = [];
  let skipped = 0;
  let transferred = 0;
  let done = 0;
  report({ transferred, total, filesDone: done, filesTotal: files.length });

  for (const file of files) {
    if (request.signal.aborted) throw new TransferCancelled();
    const target = joinRemotePath(root, file.relative);
    const before = transferred;
    try {
      if (request.conflict === "skip" && (await exists(sftp, target))) {
        skipped += 1;
        continue;
      }
      await uploadFile(
        sftp,
        join(request.local, file.relative),
        target,
        (bytes) => report({ transferred: before + bytes, total, filesDone: done, filesTotal: files.length }),
        request.onStaged,
      );
      transferred = before + file.size;
    } catch (error) {
      // A cancelled transfer fails every remaining file the same way; the first
      // error would be a lie about the rest, so cancellation breaks out instead.
      if (request.signal.aborted) throw new TransferCancelled();
      failures.push((error as Error).message);
    } finally {
      done += 1;
      report({ transferred, total, filesDone: done, filesTotal: files.length });
    }
  }

  return { error: summarize(failures), skipped: skipped + links };
}

async function downloadOne(
  sftp: SFTPWrapper,
  request: TransferRequest,
  report: TransferReporter,
): Promise<TransferOutcome> {
  // The save dialog already asked about replacing; `skip` is the only policy a
  // single download still has to enforce.
  if (request.conflict === "skip" && (await existsLocal(request.local))) {
    return { error: null, skipped: 1 };
  }

  const size = (await listDirectory(sftp, dirnameRemote(request.remote))).find(
    (entry) => entry.name === baseNameOf(request.remote),
  )?.size ?? 0;
  await downloadFile(sftp, request.remote, request.local, (transferred, total) =>
    report({ transferred, total, filesDone: 1, filesTotal: 1 }),
  );
  report({ transferred: size || 1, total: size || 1, filesDone: 1, filesTotal: 1 });
  return { error: null, skipped: 0 };
}

/**
 * A folder download is staged in a sibling directory and moved into place when
 * the walk is done, so a cancelled one leaves nothing behind and an existing
 * folder is never written into.
 *
 * Unlike a single file, a folder that finished with failures is still promoted:
 * discarding 498 files because the 499th failed would cost more than the red row
 * that says which one it was.
 */
async function downloadFolder(
  sftp: SFTPWrapper,
  request: TransferRequest,
  report: TransferReporter,
): Promise<TransferOutcome> {
  const { files, links } = await walkRemote(sftp, request.remote);
  const total = files.reduce((sum, file) => sum + file.size, 0);

  const named = join(request.local, sanitizeLocalName(baseNameOf(request.remote)));
  const destination = (await existsLocal(named)) ? await freeLocalName(named) : named;
  const staging = `${destination}.part-${Date.now().toString(36)}`;

  const failures: string[] = [];
  let transferred = 0;
  let done = 0;
  report({ transferred, total, filesDone: done, filesTotal: files.length });

  try {
    await mkdir(staging, { recursive: true });
    for (const file of files) {
      if (request.signal.aborted) throw new TransferCancelled();
      const target = join(staging, file.relative);
      await mkdir(dirname(target), { recursive: true });
      const before = transferred;
      try {
        await downloadFile(sftp, joinRemotePath(request.remote, file.relative), target, (bytes) =>
          report({ transferred: before + bytes, total, filesDone: done, filesTotal: files.length }),
        );
        transferred = before + file.size;
      } catch (error) {
        if (request.signal.aborted) throw new TransferCancelled();
        failures.push((error as Error).message);
      } finally {
        done += 1;
        report({ transferred, total, filesDone: done, filesTotal: files.length });
      }
    }
    await rename(staging, destination);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }

  return { error: summarize(failures), skipped: links };
}
