/**
 * SFTP operations over a connection's SFTP subsystem.
 *
 * Two rules hold throughout:
 *
 * - **Nothing follows a symbolic link by accident.** `stat` resolves links on
 *   the far side, so asking it about a link answers about the target — deleting
 *   one would empty whatever it pointed at. Existence and type questions go
 *   through `lstat`, and a link is removed as a link.
 * - **A file appears at its destination only complete.** A transfer is staged
 *   beside the target (`.name.part-xxxx`) and renamed onto it when it finishes,
 *   so a failed or cancelled one cannot leave a half-written file that looks
 *   finished. The same staging makes cancellation cleanup a single unlink.
 */

import { randomBytes } from "node:crypto";
import { rename as renameLocal, rm } from "node:fs/promises";
import type { Attributes, FileEntry, SFTPWrapper } from "ssh2";
import type { RemoteEntry } from "@shared/types";

/** POSIX mode bits, since @types/ssh2's Attributes has no predicate helpers. */
const S_IFMT = 0o170000;
const S_IFDIR = 0o040000;
const S_IFLNK = 0o120000;

export type RemoteNodeType = RemoteEntry["type"];

function typeOf(mode: number): RemoteNodeType {
  const kind = mode & S_IFMT;
  if (kind === S_IFDIR) return "dir";
  if (kind === S_IFLNK) return "link";
  return "file";
}

/** Remote paths are always forward-slashed, whatever this machine is. */
export function joinRemotePath(dir: string, name: string): string {
  return `${dir.replace(/\/+$/, "")}/${name}`;
}

/** The last segment of a remote path, with any trailing slashes dropped. */
export function baseNameOf(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  return trimmed.slice(trimmed.lastIndexOf("/") + 1);
}

/** The parent directory of a remote path; `/` for anything directly under the root. */
export function dirNameOf(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const index = trimmed.lastIndexOf("/");
  return index <= 0 ? "/" : trimmed.slice(0, index);
}

function segmentsOf(path: string): string[] {
  const parts: string[] = [];
  for (const segment of path.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  return parts;
}

/** A staging name in the destination's own directory, so promoting is a rename. */
function stagedName(base: string): string {
  return `.${base}.part-${randomBytes(4).toString("hex")}`;
}

/**
 * Listings are ordered here, not by the runtime's `readdir`. Pinning the
 * collator keeps the order identical on every machine the app runs on — a
 * locale-sensitive sort would put the same directory in a different order on a
 * developer's laptop and in CI.
 */
const NAME_ORDER = new Intl.Collator("en", { numeric: true });

function entryOf(name: string, attrs: Attributes): RemoteEntry {
  return {
    name,
    type: typeOf(attrs.mode),
    size: attrs.size,
    mtime: attrs.mtime * 1000,
    mode: attrs.mode,
  };
}

export function listDirectory(sftp: SFTPWrapper, path: string): Promise<RemoteEntry[]> {
  return new Promise((resolve, reject) => {
    sftp.readdir(path, (error, list: FileEntry[]) => {
      if (error) {
        reject(new Error(`读取目录 ${path} 失败：${error.message}`));
        return;
      }
      const entries = list
        .filter((entry) => entry.filename !== "." && entry.filename !== "..")
        .map((entry) => entryOf(entry.filename, entry.attrs))
        .sort((a, b) => {
          if (a.type === "dir" && b.type !== "dir") return -1;
          if (a.type !== "dir" && b.type === "dir") return 1;
          return NAME_ORDER.compare(a.name, b.name);
        });
      resolve(entries);
    });
  });
}

/**
 * What the path is, without resolving a link to say so: `null` when nothing is
 * there. Every caller that would otherwise reach for `stat` uses this.
 */
export function nodeAt(sftp: SFTPWrapper, path: string): Promise<RemoteEntry | null> {
  return new Promise((resolve) => {
    sftp.lstat(path, (error, attrs) => {
      resolve(error ? null : entryOf(baseNameOf(path), attrs));
    });
  });
}

/** True when the path exists (file, directory or link). */
export async function exists(sftp: SFTPWrapper, path: string): Promise<boolean> {
  return (await nodeAt(sftp, path)) !== null;
}

function mkdirOnce(sftp: SFTPWrapper, path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.mkdir(path, (error) => {
      if (error) reject(new Error(`创建目录 ${path} 失败：${error.message}`));
      else resolve();
    });
  });
}

export async function makeDirectory(sftp: SFTPWrapper, path: string): Promise<void> {
  // ssh2 surfaces a bare status word ("Failure") for an existing directory;
  // checking first lets the UI say what actually happened.
  if (await exists(sftp, path)) throw new Error(`目录已存在：${path}`);
  await mkdirOnce(sftp, path);
}

/** Every missing segment of the path, for an upload landing in a new tree. */
export async function makeDirectories(sftp: SFTPWrapper, path: string): Promise<void> {
  let current = "";
  for (const segment of segmentsOf(path)) {
    current += `/${segment}`;
    const node = await nodeAt(sftp, current);
    if (node?.type === "dir") continue;
    if (node) throw new Error(`创建目录 ${current} 失败：同名文件已存在。`);
    try {
      await mkdirOnce(sftp, current);
    } catch (error) {
      // Two transfers can race for the same parent; the loser only has to find
      // it there.
      if ((await nodeAt(sftp, current))?.type !== "dir") throw error;
    }
  }
}

/** Recursively removes a path. A link is unlinked, never walked into. */
export async function removePath(sftp: SFTPWrapper, path: string): Promise<void> {
  const node = await nodeAt(sftp, path);
  if (!node) throw new Error(`删除 ${path} 失败：路径不存在。`);

  if (node.type === "dir") {
    for (const entry of await listDirectory(sftp, path)) {
      await removePath(sftp, joinRemotePath(path, entry.name));
    }
    await new Promise<void>((resolve, reject) => {
      sftp.rmdir(path, (error) =>
        error ? reject(new Error(`删除目录 ${path} 失败：${error.message}`)) : resolve(),
      );
    });
    return;
  }

  await unlink(sftp, path);
}

/** Best-effort removal, for a staging file whose transfer already failed. */
export async function removeQuietly(sftp: SFTPWrapper, path: string): Promise<void> {
  try {
    await unlink(sftp, path);
  } catch {
    // The connection may be gone with the transfer; nothing left to clean up.
  }
}

export function unlink(sftp: SFTPWrapper, path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.unlink(path, (error) =>
      error ? reject(new Error(`删除 ${path} 失败：${error.message}`)) : resolve(),
    );
  });
}

export function renamePath(sftp: SFTPWrapper, from: string, to: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.rename(from, to, (error) =>
      error ? reject(new Error(`重命名 ${from} 失败：${error.message}`)) : resolve(),
    );
  });
}

/**
 * Moves a staged file onto its destination, replacing what is there.
 *
 * Plain SFTP rename refuses to replace an existing file, and the extension that
 * does replace one (`posix-rename@openssh.com`) is not something every server
 * offers — so the extension is tried first and the destination is removed only
 * when it is unavailable. That second path is briefly non-atomic; the first is
 * the reason it is not the default.
 */
export async function promoteStaged(
  sftp: SFTPWrapper,
  staged: string,
  destination: string,
): Promise<void> {
  const renamed = await new Promise<boolean>((resolve) => {
    try {
      sftp.ext_openssh_rename(staged, destination, (error) => resolve(!error));
    } catch {
      // ssh2 throws (rather than calling back) when the server never advertised
      // the extension, which is the ordinary case for a server that dislikes it.
      resolve(false);
    }
  });
  if (renamed) return;

  await removeQuietly(sftp, destination);
  await renamePath(sftp, staged, destination);
}

export type ProgressCallback = (transferred: number, total: number) => void;

/**
 * Progress is a reading, not an event.
 *
 * `fastGet` and `fastPut` call their step callback once per 32 KB chunk, so a
 * 100 MB file would otherwise push thousands of IPC messages and re-render the
 * file pane as many times. What the UI needs is the latest value at human speed:
 * a report leaves when the clock has moved on, or when the proportion has.
 */
const MIN_INTERVAL_MS = 100;
const MIN_FRACTION = 0.01;

export function throttleProgress(
  emit: ProgressCallback,
  now: () => number = Date.now,
): ProgressCallback {
  let lastAt = 0;
  /** `-1` until the first report, which always goes out: it carries the total. */
  let lastTransferred = -1;
  return (transferred, total) => {
    const at = now();
    const moved = total > 0 ? (transferred - lastTransferred) / total : 0;
    if (lastTransferred >= 0 && at - lastAt < MIN_INTERVAL_MS && moved < MIN_FRACTION) return;
    lastAt = at;
    lastTransferred = transferred;
    emit(transferred, total);
  };
}

/**
 * ssh2 reports `(transferred, chunkLength, totalSize)`; the middle one is the
 * size of the chunk that just went out, not the size of the file.
 */
function fastGet(
  sftp: SFTPWrapper,
  remote: string,
  local: string,
  onProgress: ProgressCallback,
): Promise<void> {
  const step = throttleProgress(onProgress);
  return new Promise((resolve, reject) => {
    sftp.fastGet(
      remote,
      local,
      { step: (transferred: number, _chunk: number, total: number) => step(transferred, total) },
      (error) => (error ? reject(error) : resolve()),
    );
  });
}

function fastPut(
  sftp: SFTPWrapper,
  local: string,
  remote: string,
  onProgress: ProgressCallback,
): Promise<void> {
  const step = throttleProgress(onProgress);
  return new Promise((resolve, reject) => {
    sftp.fastPut(
      local,
      remote,
      { step: (transferred: number, _chunk: number, total: number) => step(transferred, total) },
      (error) => (error ? reject(error) : resolve()),
    );
  });
}

/**
 * Downloads to a staging file beside the destination and promotes it, so the
 * destination is either the old file or the complete new one.
 */
export async function downloadFile(
  sftp: SFTPWrapper,
  remote: string,
  local: string,
  onProgress: ProgressCallback = () => {},
): Promise<void> {
  const staged = `${local}.part-${randomBytes(4).toString("hex")}`;
  try {
    await fastGet(sftp, remote, staged, throttleProgress(onProgress));
    await renameLocal(staged, local);
  } catch (error) {
    await rm(staged, { force: true });
    throw new Error(`下载 ${remote} 失败：${(error as Error).message}`);
  }
}

/**
 * Uploads through a remote staging file, for the same reason as a download.
 *
 * `onStaged` reports where the staging file is *before* any byte moves, so a
 * cancellation can go back for it: closing the channel is what stops an upload
 * mid-flight, and it takes the ability to clean up with it.
 */
export async function uploadFile(
  sftp: SFTPWrapper,
  local: string,
  remote: string,
  onProgress: ProgressCallback = () => {},
  onStaged: (path: string) => void = () => {},
): Promise<void> {
  const staged = joinRemotePath(dirNameOf(remote), stagedName(baseNameOf(remote)));
  onStaged(staged);
  try {
    await fastPut(sftp, local, staged, throttleProgress(onProgress));
    await promoteStaged(sftp, staged, remote);
  } catch (error) {
    await removeQuietly(sftp, staged);
    throw new Error(`上传 ${local} 失败：${(error as Error).message}`);
  }
}

/**
 * `a.txt` → `a copy.txt` → `a copy 2.txt`, the first that is free. Used when the
 * user asks for both files rather than choosing one.
 */
export function deconflictedName(name: string, taken: (candidate: string) => boolean): string {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  let candidate = `${stem} copy${extension}`;
  for (let index = 2; taken(candidate); index += 1) candidate = `${stem} copy ${index}${extension}`;
  return candidate;
}
