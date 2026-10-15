import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import type { SFTPWrapper } from "ssh2";
import { PREVIEW_CHUNK, readTextFile, TEXT_EDIT_MAX } from "./sftp-text";

const S_IFREG = 0o100000;
const S_IFIFO = 0o010000;

interface FakeFile {
  mode: number;
  content: Buffer;
}

/**
 * The smallest SFTP the reader uses: `lstat` answers types and sizes, and
 * `createReadStream` hands back the requested byte range of an in-memory
 * buffer while remembering what ranges were asked for — the "no second open
 * for the probe" claim is only testable if the reads are countable.
 */
function fakeSftp(files: Map<string, FakeFile>) {
  const reads: { start: number; end: number }[] = [];
  const sftp = {
    lstat(path: string, cb: (error: Error | undefined, attrs: unknown) => void) {
      const file = files.get(path);
      if (!file) return cb(new Error("no such file"), undefined);
      cb(undefined, { mode: file.mode, size: file.content.length, mtime: 1_700_000_000 });
    },
    createReadStream(path: string, options?: { start?: number; end?: number }) {
      const content = files.get(path)?.content ?? Buffer.alloc(0);
      const start = options?.start ?? 0;
      const end = Math.min(options?.end ?? content.length - 1, content.length - 1);
      reads.push({ start, end });
      return Readable.from([content.subarray(start, end + 1)]);
    },
  };
  return { sftp: sftp as unknown as SFTPWrapper, reads };
}

const file = (content: Buffer | string, mode = S_IFREG): FakeFile => ({
  mode,
  content: typeof content === "string" ? Buffer.from(content, "utf8") : content,
});

const one = (path: string, entry: FakeFile) => new Map([[path, entry]]);

describe("readTextFile", () => {
  it("reads a small file whole and reports its line endings", async () => {
    const { sftp } = fakeSftp(one("/content/notes.md", file("x,y\n1,2\n")));
    const read = await readTextFile(sftp, "/content/notes.md");

    expect(read.kind).toBe("text");
    if (read.kind !== "text") return;
    expect(read.text).toBe("x,y\n1,2\n");
    expect(read.eol).toBe("lf");
    expect(read.size).toBe(8);
  });

  it("hands over LF but remembers CRLF, so one peek does not rewrite a file", async () => {
    const { sftp } = fakeSftp(one("/content/crlf.txt", file("a\r\nb\r\n")));
    const read = await readTextFile(sftp, "/content/crlf.txt");

    expect(read.kind).toBe("text");
    if (read.kind !== "text") return;
    expect(read.eol).toBe("crlf");
    expect(read.text).toBe("a\nb\n");
  });

  it("calls endings mixed when they disagree", async () => {
    const { sftp } = fakeSftp(one("/content/mixed.txt", file("a\r\nb\n")));
    const read = await readTextFile(sftp, "/content/mixed.txt");

    expect(read.kind).toBe("text");
    if (read.kind !== "text") return;
    expect(read.eol).toBe("mixed");
    expect(read.text).toBe("a\nb\n");
  });

  it("an empty file is empty text, not an error", async () => {
    const { sftp, reads } = fakeSftp(one("/content/empty.txt", file("")));
    const read = await readTextFile(sftp, "/content/empty.txt");

    expect(read.kind).toBe("text");
    if (read.kind !== "text") return;
    expect(read.text).toBe("");
    expect(reads).toEqual([]);
  });

  it("refuses anything that is not an ordinary file", async () => {
    const { sftp } = fakeSftp(one("/content/pipe", file("x", S_IFIFO)));
    await expect(readTextFile(sftp, "/content/pipe")).rejects.toThrow("不是常规文件");
  });

  it("says so when the file is gone", async () => {
    const { sftp } = fakeSftp(new Map());
    await expect(readTextFile(sftp, "/content/gone.txt")).rejects.toThrow("文件不存在");
  });

  it("a NUL inside the probe window is binary", async () => {
    const content = Buffer.alloc(9000, 0x61);
    content[8000] = 0;
    const { sftp } = fakeSftp(one("/content/blob.bin", file(content)));
    const read = await readTextFile(sftp, "/content/blob.bin");

    expect(read.kind).toBe("binary");
  });

  it("probes only the first 8 KiB — a later NUL does not decide it", async () => {
    const content = Buffer.alloc(9000, 0x61);
    content[8500] = 0;
    const { sftp } = fakeSftp(one("/content/odd.txt", file(content)));
    const read = await readTextFile(sftp, "/content/odd.txt");

    expect(read.kind).toBe("text");
  });

  it("shows bytes that are not UTF-8 without pretending they round-trip", async () => {
    const { sftp } = fakeSftp(one("/content/legacy.txt", file(Buffer.from([0xc3, 0x28, 0x0a]))));
    const read = await readTextFile(sftp, "/content/legacy.txt");

    expect(read.kind).toBe("invalidUtf8");
    if (read.kind !== "invalidUtf8") return;
    expect(read.text).toBe("\uFFFD(\n");
  });

  it("a large file travels as its two ends, cut at line breaks", async () => {
    const body = "filler\n".repeat(Math.ceil((3 * 1024 * 1024) / 7));
    const content = Buffer.from(`FIRST\n${body}LAST\n`);
    const { sftp } = fakeSftp(one("/content/train.log", file(content)));
    const read = await readTextFile(sftp, "/content/train.log");

    expect(read.kind).toBe("truncated");
    if (read.kind !== "truncated") return;
    expect(read.head.startsWith("FIRST\n")).toBe(true);
    // Whole lines on both sides of the gap, not half of one.
    expect(read.head.endsWith("filler")).toBe(true);
    expect(read.tail.startsWith("filler")).toBe(true);
    expect(read.tail.endsWith("LAST\n")).toBe(true);
    expect(read.omitted).toBe(content.length - Buffer.byteLength(read.head) - Buffer.byteLength(read.tail));
  });

  it("the tail never starts on half of a multi-byte character", async () => {
    // Odd head length, so the 256 KiB tail window opens in the middle of a
    // two-byte character — the case a plain byte slice would show as U+FFFD.
    const content = Buffer.concat([
      Buffer.from("top lines\n"),
      Buffer.from("é".repeat(1_600_000), "utf8"),
      Buffer.from("last line\n"),
    ]);
    const { sftp } = fakeSftp(one("/content/wide.txt", file(content)));
    const read = await readTextFile(sftp, "/content/wide.txt");

    expect(read.kind).toBe("truncated");
    if (read.kind !== "truncated") return;
    expect(read.tail.startsWith("\uFFFD")).toBe(false);
    // One long line with almost no breaks: the window is still full, minus at
    // most the half character the alignment skipped.
    expect(read.tail.endsWith("last line\n")).toBe(true);
    expect(Buffer.byteLength(read.tail)).toBeGreaterThanOrEqual(PREVIEW_CHUNK - 3);
    expect(read.head.endsWith("\uFFFD")).toBe(false);
  });

  it("a binary head ends the read before the tail is asked for", async () => {
    const content = Buffer.alloc(TEXT_EDIT_MAX + PREVIEW_CHUNK, 0x61);
    content[10] = 0;
    const { sftp, reads } = fakeSftp(one("/content/weights.npz", file(content)));
    const read = await readTextFile(sftp, "/content/weights.npz");

    expect(read.kind).toBe("binary");
    expect(reads).toEqual([{ start: 0, end: PREVIEW_CHUNK - 1 }]);
  });

  it("a small file is opened once — the probe rides in the read", async () => {
    const { sftp, reads } = fakeSftp(one("/content/notes.md", file("hello\n")));
    await readTextFile(sftp, "/content/notes.md");

    expect(reads).toEqual([{ start: 0, end: 5 }]);
  });
});
