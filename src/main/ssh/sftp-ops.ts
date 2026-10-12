/** SFTP operations over an existing connection's SFTP subsystem. */

import type { FileEntry, SFTPWrapper } from "ssh2";
import type { RemoteEntry } from "@shared/types";

/** POSIX mode bits, since @types/ssh2's Attributes has no predicate helpers. */
const S_IFMT = 0o170000;
const S_IFDIR = 0o040000;
const S_IFLNK = 0o120000;

function entryType(entry: FileEntry): RemoteEntry["type"] {
  const kind = entry.attrs.mode & S_IFMT;
  if (kind === S_IFDIR) return "dir";
  if (kind === S_IFLNK) return "link";
  return "file";
}

export function listDirectory(sftp: SFTPWrapper, path: string): Promise<RemoteEntry[]> {
  return new Promise((resolve, reject) => {
    sftp.readdir(path, (error, list) => {
      if (error) {
        reject(new Error(`读取目录 ${path} 失败: ${error.message}`));
        return;
      }
      const entries: RemoteEntry[] = list
        .filter((entry) => entry.filename !== "." && entry.filename !== "..")
        .map((entry) => ({
          name: entry.filename,
          type: entryType(entry),
          size: entry.attrs.size,
          mtime: entry.attrs.mtime * 1000,
          mode: entry.attrs.mode,
        }))
        .sort((a, b) => {
          if (a.type === "dir" && b.type !== "dir") return -1;
          if (a.type !== "dir" && b.type === "dir") return 1;
          return a.name.localeCompare(b.name);
        });
      resolve(entries);
    });
  });
}

export async function makeDirectory(sftp: SFTPWrapper, path: string): Promise<void> {
  // ssh2 surfaces a bare status word ("Failure") for an existing directory;
  // checking first lets the UI say what actually happened.
  if (await exists(sftp, path)) throw new Error(`目录已存在：${path}`);

  await new Promise<void>((resolve, reject) => {
    sftp.mkdir(path, (error) => {
      if (error) reject(new Error(`创建目录 ${path} 失败: ${error.message}`));
      else resolve();
    });
  });
}

/** Recursively removes a path: files are unlinked, directories emptied first. */
export async function removePath(sftp: SFTPWrapper, path: string): Promise<void> {
  const stats = await new Promise<{ isDirectory(): boolean } | null>((resolve) => {
    sftp.stat(path, (error, attrs) => resolve(error ? null : attrs));
  });

  if (stats?.isDirectory()) {
    const entries = await listDirectory(sftp, path);
    for (const entry of entries) {
      await removePath(sftp, `${path.replace(/\/$/, "")}/${entry.name}`);
    }
    await new Promise<void>((resolve, reject) => {
      sftp.rmdir(path, (error) => (error ? reject(new Error(`删除目录 ${path} 失败: ${error.message}`)) : resolve()));
    });
    return;
  }

  await new Promise<void>((resolve, reject) => {
    sftp.unlink(path, (error) => (error ? reject(new Error(`删除 ${path} 失败: ${error.message}`)) : resolve()));
  });
}

export type ProgressCallback = (transferred: number, total: number) => void;

export function downloadFile(
  sftp: SFTPWrapper,
  remote: string,
  local: string,
  onProgress: ProgressCallback,
): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.fastGet(
      remote,
      local,
      {
        step: (transferred, _chunk, total) => onProgress(transferred, total),
      },
      (error) => {
        if (error) reject(new Error(`下载 ${remote} 失败: ${error.message}`));
        else resolve();
      },
    );
  });
}

export function uploadFile(
  sftp: SFTPWrapper,
  local: string,
  remote: string,
  onProgress: ProgressCallback,
): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.fastPut(
      local,
      remote,
      {
        step: (transferred, _chunk, total) => onProgress(transferred, total),
      },
      (error) => {
        if (error) reject(new Error(`上传 ${local} 失败: ${error.message}`));
        else resolve();
      },
    );
  });
}

/** True when the path exists (file or directory). */
export function exists(sftp: SFTPWrapper, path: string): Promise<boolean> {
  return new Promise((resolve) => {
    sftp.stat(path, (error) => resolve(!error));
  });
}
