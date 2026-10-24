/**
 * A remote file as text: what can be read, and how much of it.
 *
 * Three judgements live here and nowhere else.
 *
 * - **What is a file to read.** `typeOf` (sftp-ops) is coarse on purpose — for
 *   the tree, a device or a FIFO is something you can download like a file —
 *   but reading one as text is a different claim, so only `S_IFREG` passes.
 * - **What is binary.** A NUL byte in the first 8 KiB, the window Orca probes
 *   too. A ratio-of-control-characters heuristic would cost more than it
 *   catches, and a text file with no NULs decodes anyway.
 * - **How much of a large file travels.** The head and the tail, each cut at a
 *   line boundary: the tail is what a log is opened for, and half a sentence at
 *   the top of it reads worse than the few bytes the cut costs.
 *
 * Every path through here opens the SFTP channel once. An `OPEN` is a round
 * trip, so the binary probe rides inside the first read rather than getting one
 * of its own.
 */

import type { SFTPWrapper } from "ssh2";
import type { EolStyle, RemoteTextRead, RemoteTextWrite, WriteTextRequest } from "@shared/types";
import {
  baseNameOf,
  dirNameOf,
  isRegularFile,
  joinRemotePath,
  statNode,
  statTarget,
  promoteStaged,
  removeQuietly,
  stagedName,
} from "./sftp-ops";

/** Above this, the file is shown as its two ends instead of read whole. */
export const TEXT_EDIT_MAX = 2 * 1024 * 1024;
/** How many bytes of each end a too-large file contributes. */
export const PREVIEW_CHUNK = 256 * 1024;
/** The window the binary probe looks at. */
export const BINARY_PROBE = 8 * 1024;
/** Below this, aligning to a line break would cost more than it reads. */
const MIN_ALIGNED = PREVIEW_CHUNK / 2;
/** SFTP's own packet size, so the far side never reassembles what it could read. */
const WRITE_CHUNK = 32 * 1024;
/** How long a failed save's tidy-up may hold the answer open. */
const STAGING_SWEEP_MS = 2_000;

function readRange(sftp: SFTPWrapper, path: string, start: number, end: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stream = sftp.createReadStream(path, { start, end });
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("error", (error: Error) => reject(new Error(`读取 ${path} 失败：${error.message}`)));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function isBinary(buffer: Buffer): boolean {
  return buffer.subarray(0, BINARY_PROBE).includes(0);
}

function detectEol(text: string): EolStyle {
  const crlf = text.match(/\r\n/g)?.length ?? 0;
  if (crlf === 0) return "lf";
  const lf = text.match(/\n/g)?.length ?? 0;
  return crlf === lf ? "crlf" : "mixed";
}

/** The head, cut back to its last line break unless that would gut it. */
function headText(buffer: Buffer): { text: string; bytes: number } {
  const lastBreak = buffer.lastIndexOf(0x0a);
  if (lastBreak >= MIN_ALIGNED) {
    return { text: buffer.subarray(0, lastBreak).toString("utf8"), bytes: lastBreak };
  }
  // One enormous line, or none: the streaming decoder holds the half character
  // at the cut back, and everything before it travels.
  return { text: new TextDecoder("utf-8").decode(buffer, { stream: true }), bytes: buffer.length };
}

/** The first byte that is not a UTF-8 continuation, so decoding starts clean. */
function skipPartialChar(buffer: Buffer): number {
  let at = 0;
  while (at < buffer.length && (buffer[at]! & 0xc0) === 0x80) at += 1;
  return at;
}

/** The tail, starting after its first line break unless that would gut it. */
function tailText(buffer: Buffer): { text: string; bytes: number } {
  const firstBreak = buffer.indexOf(0x0a);
  const aligned = firstBreak + 1;
  const start =
    firstBreak >= 0 && buffer.length - aligned >= MIN_ALIGNED ? aligned : skipPartialChar(buffer);
  return { text: buffer.subarray(start).toString("utf8"), bytes: buffer.length - start };
}

export async function readTextFile(sftp: SFTPWrapper, path: string): Promise<RemoteTextRead> {
  const link = await statNode(sftp, path);
  if (!link) throw new Error(`读取 ${path} 失败：文件不存在。`);
  // A file reached through a symbolic link is readable (the read follows it),
  // but not writable here: a save stages beside the link and renames onto it,
  // which would replace the link instead of the file it points at.
  const entry = link.type === "link" ? await statTarget(sftp, path) : link;
  if (!entry) throw new Error(`读取 ${path} 失败：链接目标不存在。`);
  if (!isRegularFile(entry.mode)) throw new Error(`读取 ${path} 失败：不是常规文件。`);
  const { size, mtime } = entry;
  const mode = link.type === "link" ? entry.mode & ~0o222 : entry.mode;

  if (size > TEXT_EDIT_MAX) {
    const headBuffer = await readRange(sftp, path, 0, PREVIEW_CHUNK - 1);
    // The probe rides in the head read, and it can end the job: there is no
    // reason to pull the tail of a binary file across the wire.
    if (isBinary(headBuffer)) return { kind: "binary", size };
    const tailBuffer = await readRange(sftp, path, size - PREVIEW_CHUNK, size - 1);
    const head = headText(headBuffer);
    const tail = tailText(tailBuffer);
    return {
      kind: "truncated",
      head: head.text,
      tail: tail.text,
      omitted: size - head.bytes - tail.bytes,
      size,
      mtime,
      mode,
    };
  }

  const buffer = size === 0 ? Buffer.alloc(0) : await readRange(sftp, path, 0, size - 1);
  if (isBinary(buffer)) return { kind: "binary", size };

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    // A GBK log, or bytes that were never text: show what they decode to, but
    // do not let anything downstream offer to write it back.
    return { kind: "invalidUtf8", text: buffer.toString("utf8"), size, mtime, mode };
  }
  const eol = detectEol(text);
  return {
    kind: "text",
    // The buffer is canonical LF; the original ending travels alongside so a
    // CRLF file is not silently rewritten by one peek at it.
    text: eol === "lf" ? text : text.replace(/\r\n/g, "\n"),
    eol,
    size,
    mtime,
    mode,
  };
}

/** Writes the buffer through a handle in SFTP-sized chunks. */
function writeThrough(sftp: SFTPWrapper, target: string, display: string, body: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const fail = (error: Error): void => reject(new Error(`写入 ${display} 失败：${error.message}`));
    /** Housekeeping that must never hold an answer: ssh2 does not settle the
        callback of a request it dropped, and a dropped channel is exactly when
        this runs. */
    const drop = (handle: Buffer): void => {
      try {
        sftp.close(handle, () => {});
      } catch {
        // The channel is gone; the handle went with it.
      }
    };
    sftp.open(target, "w", (openError, handle) => {
      if (openError) return fail(openError);
      const writeChunk = (offset: number): void => {
        if (offset >= body.length) {
          // Every byte was acknowledged one request ago, so the close is not
          // what makes the data durable — not waiting for it is what keeps a
          // dead channel from hanging the save.
          drop(handle);
          resolve();
          return;
        }
        const chunk = body.subarray(offset, Math.min(offset + WRITE_CHUNK, body.length));
        sftp.write(handle, chunk, 0, chunk.length, offset, (writeError) => {
          if (writeError) {
            drop(handle);
            fail(writeError);
            return;
          }
          writeChunk(offset + chunk.length);
        });
      };
      writeChunk(0);
    });
  });
}

/**
 * Writes text to a remote file the way an upload lands: staged beside the
 * target, its mode restored, then renamed on top — a save that dies halfway
 * leaves the file that was there, never half of the new one.
 *
 * The comparison before writing is the whole of the conflict story: the
 * protocol reports mtime in seconds, so a rewrite inside the same second is
 * caught by size and by nothing else, and a rewrite of exactly the same length
 * inside that second is not caught at all. Living with that is cheaper than a
 * file watcher, and the person at the keyboard is the one who decides anyway.
 */
export async function writeTextFile(
  sftp: SFTPWrapper,
  request: WriteTextRequest,
): Promise<RemoteTextWrite> {
  const { path, text, eol, expected, force = false } = request;

  // `statNode`, not `nodeAt`: a failure to *ask* must not arrive downstream as
  // "the file is gone" — the answer to that is an invitation to overwrite.
  const entry = await statNode(sftp, path);
  if (entry && !isRegularFile(entry.mode)) throw new Error(`写入 ${path} 失败：不是常规文件。`);
  if (!entry && !force && expected !== null) return { ok: false, reason: "missing" };
  if (entry && !force) {
    // `RemoteEntry.mtime` is already milliseconds (sftp-ops scales it); the
    // protocol's own seconds never reach this comparison.
    const moved = expected === null || entry.mtime !== expected.mtime || entry.size !== expected.size;
    if (moved) return { ok: false, reason: "changed" };
  }

  const body = Buffer.from(eol === "crlf" ? text.replace(/\r?\n/g, "\r\n") : text, "utf8");
  const staged = joinRemotePath(dirNameOf(path), stagedName(baseNameOf(path)));
  try {
    await writeThrough(sftp, staged, path, body);
    if (entry) {
      // Best-effort, and deliberate: SETSTAT is not on every server, and a save
      // that cannot restore the mode is still a save. Without it, a saved
      // script would come back without its +x.
      await new Promise<void>((resolve) => {
        sftp.chmod(staged, entry.mode & 0o7777, () => resolve());
      });
    }
  } catch (error) {
    // The cleanup gets a budget and no more: on a dead channel the callback
    // never comes, and a tidy-up nobody is waiting for is worth less than the
    // answer. (Same shape as the transfer sweep in `handlers/files`.)
    await Promise.race([
      removeQuietly(sftp, staged),
      new Promise<void>((resolve) => setTimeout(resolve, STAGING_SWEEP_MS)),
    ]);
    throw error;
  }

  // Read the staged file before promoting it: renaming keeps the inode's times,
  // so this is what the destination reports afterwards — and it is the baseline
  // the *next* save compares against. Nothing is asked of the destination after
  // the promote, where a failure would be reported as a save that never landed.
  const stagedEntry = await statNode(sftp, staged);
  try {
    // From here the staged file may be the only copy of the new text: a failed
    // promote leaves it alone (`promoteStaged` puts the old file back), rather
    // than deleting what was just typed.
    await promoteStaged(sftp, staged, path);
  } catch (error) {
    throw new Error(`写入 ${path} 失败：${(error as Error).message}`);
  }

  return {
    ok: true,
    size: stagedEntry?.size ?? body.length,
    mtime: stagedEntry?.mtime ?? Date.now(),
  };
}
