import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import type { SFTPWrapper } from "ssh2";
import { PREVIEW_CHUNK, readTextFile, TEXT_EDIT_MAX, writeTextFile } from "./sftp-text";

const S_IFREG = 0o100000;
const S_IFIFO = 0o010000;
const S_IFLNK = 0o120000;

/** The mtime the fake reports, in seconds — `nodeAt` scales it to milliseconds. */
const MTIME_SECONDS = 1_700_000_000;
const BASELINE_MTIME = MTIME_SECONDS * 1000;

interface FakeFile {
  mode: number;
  content: Buffer;
}

/**
 * The smallest SFTP the reader and the writer use: `lstat` answers types and
 * sizes, `createReadStream` hands back a byte range of an in-memory buffer, and
 * the open/write/close triple edits one, remembering every call — "the mode is
 * restored before the rename" and "the probe opens nothing extra" are only
 * testable if the calls are countable and ordered.
 */
function fakeSftp(
  files: Map<string, FakeFile>,
  options: {
    chmodFails?: boolean;
    failSecondWrite?: boolean;
    lstatFails?: boolean;
    posixRename?: boolean;
    failRenameOnce?: string;
  } = {},
) {
  const reads: { start: number; end: number }[] = [];
  const calls: string[] = [];
  const handles = new Map<string, string>();
  let opens = 0;
  let writes = 0;
  let renameFailureSpent = false;

  const name = (path: string) => path.slice(path.lastIndexOf("/") + 1);

  const sftp = {
    lstat(path: string, cb: (error: Error | undefined, attrs: unknown) => void) {
      // ssh2 tags status errors with the SFTP number: 2 is "no such file", and
      // anything else is a failure to ask (which a writer must not mistake for
      // a deleted file).
      if (options.lstatFails) {
        return cb(Object.assign(new Error("connection lost"), { code: 4 }), undefined);
      }
      const file = files.get(path);
      if (!file) return cb(Object.assign(new Error("No such file"), { code: 2 }), undefined);
      cb(undefined, { mode: file.mode, size: file.content.length, mtime: MTIME_SECONDS });
    },
    createReadStream(path: string, options?: { start?: number; end?: number }) {
      const content = files.get(path)?.content ?? Buffer.alloc(0);
      const start = options?.start ?? 0;
      const end = Math.min(options?.end ?? content.length - 1, content.length - 1);
      reads.push({ start, end });
      return Readable.from([content.subarray(start, end + 1)]);
    },
    open(path: string, flags: string, cb: (error: Error | undefined, handle?: Buffer) => void) {
      calls.push(`open ${name(path)} ${flags}`);
      files.set(path, { mode: S_IFREG | 0o644, content: Buffer.alloc(0) });
      opens += 1;
      const handle = Buffer.from(`handle-${opens}`);
      handles.set(handle.toString("utf8"), path);
      cb(undefined, handle);
    },
    write(
      handle: Buffer,
      data: Buffer,
      _offset: number,
      length: number,
      position: number,
      cb: (error?: Error) => void,
    ) {
      writes += 1;
      if (options.failSecondWrite && writes === 2) return cb(new Error("channel closed"));
      const path = handles.get(handle.toString("utf8"));
      const file = path ? files.get(path) : undefined;
      if (!path || !file) return cb(new Error("invalid handle"));
      const chunk = Buffer.from(data.subarray(0, length));
      if (position + chunk.length > file.content.length) {
        const grown = Buffer.alloc(position + chunk.length);
        file.content.copy(grown);
        file.content = grown;
      }
      chunk.copy(file.content, position);
      calls.push(`write ${name(path)}@${position}:${chunk.length}b`);
      cb();
    },
    close(handle: Buffer, cb: (error?: Error) => void) {
      handles.delete(handle.toString("utf8"));
      cb();
    },
    chmod(path: string, mode: number, cb: (error?: Error) => void) {
      calls.push(`chmod ${name(path)} ${mode.toString(8)}`);
      if (options.chmodFails) return cb(new Error("SETSTAT not supported"));
      const file = files.get(path);
      if (file) file.mode = (file.mode & 0o170000) | mode;
      cb();
    },
    ext_openssh_rename(from: string, to: string, cb: (error?: Error) => void) {
      calls.push(`posix-rename ${name(from)} -> ${name(to)}`);
      if (!options.posixRename) {
        // What ssh2 does when the server never advertised the extension.
        throw new Error("unsupported");
      }
      const file = files.get(from);
      files.delete(from);
      if (file) files.set(to, file);
      cb();
    },
    rename(from: string, to: string, cb: (error?: Error) => void) {
      calls.push(`rename ${name(from)} -> ${name(to)}`);
      if (options.failRenameOnce === to && !renameFailureSpent) {
        renameFailureSpent = true;
        return cb(new Error("failure"));
      }
      if (files.has(to)) return cb(new Error("failure"));
      const file = files.get(from);
      files.delete(from);
      if (file) files.set(to, file);
      cb();
    },
    unlink(path: string, cb: (error?: Error) => void) {
      calls.push(`unlink ${name(path)}`);
      files.delete(path);
      cb();
    },
  };
  return { sftp: sftp as unknown as SFTPWrapper, reads, calls, files };
}

const file = (content: Buffer | string, mode = S_IFREG | 0o644): FakeFile => ({
  mode,
  content: typeof content === "string" ? Buffer.from(content, "utf8") : content,
});

const one = (path: string, entry: FakeFile) => new Map([[path, entry]]);

const write = (path: string, text: string, over: Partial<Parameters<typeof writeTextFile>[1]> = {}) => ({
  session: "alpha",
  path,
  text,
  eol: "lf" as const,
  expected: { mtime: BASELINE_MTIME, size: Buffer.byteLength(text) },
  ...over,
});

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

describe("writeTextFile", () => {
  it("lands the text through a staged file, restores the mode, then renames", async () => {
    const files = one("/content/notes.md", file("old\n", S_IFREG | 0o755));
    const { sftp, calls } = fakeSftp(files);
    const result = await writeTextFile(sftp, write("/content/notes.md", "new\n"));

    expect(result).toEqual({ ok: true, size: 4, mtime: BASELINE_MTIME });
    expect(files.get("/content/notes.md")?.content.toString("utf8")).toBe("new\n");
    // The mode came back with the file: a script would otherwise lose its +x.
    expect((files.get("/content/notes.md")?.mode ?? 0) & 0o777).toBe(0o755);
    // Without the type bits: some servers refuse a mode that carries them.
    expect(calls.some((call) => /^chmod \.notes\.md\.part-\w+ 755$/.test(call))).toBe(true);

    // No extension on this server, so the fallback: the old file is moved
    // aside, the staged one is renamed in, and only then is the aside dropped.
    const asideAt = calls.findIndex((call) => /^rename notes\.md -> \.notes\.md\.old\.part-\w+$/.test(call));
    const inPlaceAt = calls.findIndex((call) => /^rename \.notes\.md\.part-\w+ -> notes\.md$/.test(call));
    const droppedAt = calls.findIndex((call) => /^unlink \.notes\.md\.old\.part-\w+$/.test(call));
    expect(asideAt).toBeGreaterThan(-1);
    expect(inPlaceAt).toBeGreaterThan(asideAt);
    expect(droppedAt).toBeGreaterThan(inPlaceAt);
  });

  it("when the server has posix-rename, that one call is the whole move", async () => {
    const files = one("/content/notes.md", file("old\n", S_IFREG | 0o755));
    const { sftp, calls } = fakeSftp(files, { posixRename: true });
    const result = await writeTextFile(sftp, write("/content/notes.md", "new\n"));

    expect(result).toEqual({ ok: true, size: 4, mtime: BASELINE_MTIME });
    expect(files.get("/content/notes.md")?.content.toString("utf8")).toBe("new\n");
    expect((files.get("/content/notes.md")?.mode ?? 0) & 0o777).toBe(0o755);
    expect(calls.filter((call) => call.startsWith("rename "))).toEqual([]);
    expect(calls.filter((call) => call.startsWith("unlink "))).toEqual([]);
  });

  it("a promote that dies in the middle puts the old file back and keeps the new text", async () => {
    const files = one("/content/notes.md", file("old\n", S_IFREG | 0o755));
    const { sftp } = fakeSftp(files, { failRenameOnce: "/content/notes.md" });

    await expect(writeTextFile(sftp, write("/content/notes.md", "new\n"))).rejects.toThrow(
      "写入 /content/notes.md 失败",
    );

    // Neither copy was lost: the runtime still has the old file, and the new
    // text is still on the far side under its staging name.
    expect(files.get("/content/notes.md")?.content.toString("utf8")).toBe("old\n");
    const staged = [...files.entries()].filter(([path]) => path.includes(".part-"));
    expect(staged.map(([, entry]) => entry.content.toString("utf8"))).toEqual(["new\n"]);
  });

  it("a failure to ask is not an answer: a broken channel is not a deleted file", async () => {
    const { sftp } = fakeSftp(one("/content/notes.md", file("old\n")), { lstatFails: true });
    // Not `{ ok: false, reason: "missing" }` — that verdict would invite the
    // user to overwrite a file that never went away.
    await expect(writeTextFile(sftp, write("/content/notes.md", "new\n"))).rejects.toThrow("读取");
  });

  it("writes a CRLF file back as CRLF", async () => {
    const files = one("/content/crlf.txt", file("a\nb\n"));
    const { sftp } = fakeSftp(files);
    const result = await writeTextFile(sftp, write("/content/crlf.txt", "a\nb\n", { eol: "crlf" }));

    expect(result.ok).toBe(true);
    expect(files.get("/content/crlf.txt")?.content.toString("utf8")).toBe("a\r\nb\r\n");
  });

  it("long text goes out in SFTP-sized chunks", async () => {
    const text = `${"x".repeat(70 * 1024)}\n`;
    const files = one("/content/big.txt", file(text));
    const { sftp, calls } = fakeSftp(files);

    expect((await writeTextFile(sftp, write("/content/big.txt", text))).ok).toBe(true);
    expect(calls.filter((call) => call.startsWith("write "))).toHaveLength(3);
  });

  it("says the file moved on instead of writing over it", async () => {
    const { sftp, calls } = fakeSftp(one("/content/notes.md", file("old\n")));
    const result = await writeTextFile(
      sftp,
      write("/content/notes.md", "new\n", { expected: { mtime: BASELINE_MTIME - 1000, size: 4 } }),
    );

    expect(result).toEqual({ ok: false, reason: "changed" });
    expect(calls).toEqual([]);
  });

  it("says the file is gone instead of recreating it", async () => {
    const { sftp, calls } = fakeSftp(new Map());
    const result = await writeTextFile(sftp, write("/content/notes.md", "new\n"));

    expect(result).toEqual({ ok: false, reason: "missing" });
    expect(calls).toEqual([]);
  });

  it("writes anyway when the user answered to, and creates what is gone", async () => {
    const { sftp } = fakeSftp(one("/content/notes.md", file("old\n")));
    const forced = await writeTextFile(
      sftp,
      write("/content/notes.md", "new\n", { expected: { mtime: BASELINE_MTIME - 1000, size: 4 }, force: true }),
    );
    expect(forced.ok).toBe(true);

    const files = new Map<string, FakeFile>();
    const recreated = fakeSftp(files);
    const made = await writeTextFile(recreated.sftp, write("/content/notes.md", "new\n", { force: true }));
    expect(made.ok).toBe(true);
    expect(files.get("/content/notes.md")?.content.toString("utf8")).toBe("new\n");
    // Nothing to restore: there was no mode.
    expect(recreated.calls.some((call) => call.startsWith("chmod"))).toBe(false);
  });

  it("refuses to write through a symbolic link", async () => {
    const { sftp, calls } = fakeSftp(one("/content/mirror.txt", file("x", S_IFLNK | 0o777)));
    await expect(writeTextFile(sftp, write("/content/mirror.txt", "new\n", { expected: null }))).rejects.toThrow(
      "不是常规文件",
    );
    expect(calls).toEqual([]);
  });

  it("a server that cannot restore the mode still gets the save", async () => {
    const files = one("/content/notes.md", file("old\n", S_IFREG | 0o755));
    const { sftp, calls } = fakeSftp(files, { chmodFails: true });
    const result = await writeTextFile(sftp, write("/content/notes.md", "new\n"));

    expect(result.ok).toBe(true);
    expect(files.get("/content/notes.md")?.content.toString("utf8")).toBe("new\n");
    expect(calls.some((call) => call.startsWith("rename"))).toBe(true);
  });

  it("a write that dies halfway leaves no staging file behind", async () => {
    const text = `${"x".repeat(70 * 1024)}\n`;
    const files = one("/content/big.txt", file(text));
    const { sftp } = fakeSftp(files, { failSecondWrite: true });

    await expect(writeTextFile(sftp, write("/content/big.txt", text))).rejects.toThrow("写入 /content/big.txt 失败");
    expect([...files.keys()].filter((path) => path.includes(".part-"))).toEqual([]);
  });
});
