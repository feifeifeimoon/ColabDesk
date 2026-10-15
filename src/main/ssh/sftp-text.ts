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
import type { EolStyle, RemoteTextRead } from "@shared/types";
import { isRegularFile, nodeAt } from "./sftp-ops";

/** Above this, the file is shown as its two ends instead of read whole. */
export const TEXT_EDIT_MAX = 2 * 1024 * 1024;
/** How many bytes of each end a too-large file contributes. */
export const PREVIEW_CHUNK = 256 * 1024;
/** The window the binary probe looks at. */
export const BINARY_PROBE = 8 * 1024;
/** Below this, aligning to a line break would cost more than it reads. */
const MIN_ALIGNED = PREVIEW_CHUNK / 2;

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
  const entry = await nodeAt(sftp, path);
  if (!entry) throw new Error(`读取 ${path} 失败：文件不存在。`);
  if (!isRegularFile(entry.mode)) throw new Error(`读取 ${path} 失败：不是常规文件。`);
  const { size, mtime, mode } = entry;

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
