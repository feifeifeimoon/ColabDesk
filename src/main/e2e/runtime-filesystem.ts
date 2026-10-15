/**
 * The tree the fake runtime serves over SFTP.
 *
 * In memory and seeded from one place: the tests assert on the same entries
 * every run, and a real disk would make the listing depend on the machine.
 * Paths are POSIX-absolute, which is what the runtime side sees — nothing here
 * ever touches a Windows path.
 */

interface RuntimeFile {
  kind: "file";
  /** The buffer may be a larger allocation than the file: see `length`. */
  content: Buffer;
  /** The file's size. `content.length` is capacity, which an upload doubles. */
  length: number;
  mtime: number;
}

interface RuntimeDirectory {
  kind: "dir";
  entries: Map<string, RuntimeNode>;
  mtime: number;
}

/**
 * A symbolic link, which the runtime side has and the app must not follow by
 * accident: the file pane shows it as a link, `ls`/`cd` walk through it, and
 * deleting it removes the link rather than what it points at.
 */
interface RuntimeLink {
  kind: "link";
  target: string;
  mtime: number;
}

export type RuntimeNode = RuntimeFile | RuntimeDirectory | RuntimeLink;

/** How many links a single lookup will follow before giving up. */
const MAX_LINK_HOPS = 8;

/** Where the app lands a fresh shell (`cd /content`). */
export const RUNTIME_HOME = "/content";

const SECONDS = (): number => Math.floor(Date.now() / 1000);

/**
 * Collapses a path to POSIX-absolute form. The runtime side is a Linux VM, so
 * `..` above the root stays at the root rather than climbing off it.
 */
export function normalizePath(path: string, cwd = "/"): string {
  const absolute = path.startsWith("/") ? path : `${cwd}/${path}`;
  const parts: string[] = [];
  for (const segment of absolute.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  return `/${parts.join("/")}`;
}

/** The parent of a normalized path, or null at the root. */
function parentOf(path: string): string | null {
  const index = path.lastIndexOf("/");
  return index <= 0 ? null : path.slice(0, index);
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export class RuntimeFilesystem {
  private readonly root: RuntimeDirectory = { kind: "dir", entries: new Map(), mtime: SECONDS() };

  constructor() {
    this.seed();
  }

  /** A runtime that looks lived-in: the folder the app opens plus a subdirectory. */
  private seed(): void {
    const content = this.ensureDirectory(RUNTIME_HOME);
    const now = SECONDS();
    const readme = "ColabDesk E2E runtime.\nNothing here is real.\n";
    content.entries.set("README.txt", {
      kind: "file",
      content: Buffer.from(readme),
      length: Buffer.byteLength(readme),
      mtime: now,
    });
    content.entries.set("model.pt", { kind: "file", content: Buffer.alloc(2048, 7), length: 2048, mtime: now });

    // The three verdicts the text preview can reach beyond plain text: a file
    // too large to send whole, one that is not text at all, and one that is
    // text in some other encoding.
    const logLine = "2026-01-01 12:00:00 [INFO] step 0000 loss=0.1234\n";
    const log = Buffer.from(
      `2026-01-01 00:00:00 [INFO] training begins\n${logLine.repeat(60_000)}2026-01-01 23:59:59 [INFO] training done\n`,
    );
    content.entries.set("train.log", { kind: "file", content: log, length: log.length, mtime: now });
    content.entries.set("blob.bin", {
      kind: "file",
      content: Buffer.alloc(4096, 0),
      length: 4096,
      mtime: now,
    });
    const legacy = Buffer.from([0xc3, 0x28, 0x0a, 0xc3, 0x28]);
    content.entries.set("legacy.txt", {
      kind: "file",
      content: legacy,
      length: legacy.length,
      mtime: now,
    });

    const data: RuntimeDirectory = { kind: "dir", entries: new Map(), mtime: now };
    const csv = "x,y\n1,2\n";
    data.entries.set("sample.csv", {
      kind: "file",
      content: Buffer.from(csv),
      length: Buffer.byteLength(csv),
      mtime: now,
    });
    content.entries.set("data", data);

    // A link to that directory, so a listing has a link in it and deleting one
    // can be told apart from deleting what it points at.
    content.entries.set("mirror", { kind: "link", target: "/content/data", mtime: now });
  }

  /** The entry as stored, without following anything. */
  lstat(path: string, cwd = "/"): RuntimeNode | null {
    const target = normalizePath(path, cwd);
    if (target === "/") return this.root;
    const parent = this.directory(parentOf(target) ?? "/");
    return parent?.entries.get(baseName(target)) ?? null;
  }

  node(path: string, cwd = "/"): RuntimeNode | null {
    let current = this.lstat(path, cwd);
    for (let hop = 0; current?.kind === "link" && hop < MAX_LINK_HOPS; hop += 1) {
      current = this.lstat(current.target);
    }
    return current;
  }

  directory(path: string, cwd = "/"): RuntimeDirectory | null {
    const node = this.node(path, cwd);
    return node?.kind === "dir" ? node : null;
  }

  /** Directory entries by name, for `ls` and for SFTP `READDIR`. */
  list(path: string, cwd = "/"): Map<string, RuntimeNode> | null {
    return this.directory(path, cwd)?.entries ?? null;
  }

  mkdir(path: string, cwd = "/"): "ok" | "exists" | "missing-parent" {
    const target = normalizePath(path, cwd);
    if (this.node(target)) return "exists";
    const parent = this.directory(parentOf(target) ?? "/");
    if (!parent) return "missing-parent";
    parent.entries.set(baseName(target), { kind: "dir", entries: new Map(), mtime: SECONDS() });
    return "ok";
  }

  /** Detaches an entry from its parent. The caller has already recursed. */
  remove(path: string, cwd = "/"): boolean {
    const target = normalizePath(path, cwd);
    const parent = this.directory(parentOf(target) ?? "/");
    if (!parent) return false;
    return parent.entries.delete(baseName(target));
  }

  /**
   * Moves an entry inside its parent, refusing to replace what is already
   * there — the semantics of a plain SFTP rename, and the reason the app has a
   * fallback for the destination that does exist.
   */
  rename(from: string, to: string, cwd = "/"): "ok" | "missing" | "exists" | "missing-parent" {
    const source = this.lstat(from, cwd);
    if (!source) return "missing";
    if (this.lstat(to, cwd)) return "exists";

    const target = normalizePath(to, cwd);
    const parent = this.directory(parentOf(target) ?? "/");
    if (!parent) return "missing-parent";
    parent.entries.set(baseName(target), source);
    this.remove(from, cwd);
    return "ok";
  }

  /** Creates a file (or truncates one) and returns it, for SFTP `OPEN`. */
  create(path: string, cwd = "/"): RuntimeFile | null {
    const target = normalizePath(path, cwd);
    const existing = this.node(target);
    if (existing?.kind === "file") return existing;
    if (existing) return null;

    const parent = this.directory(parentOf(target) ?? "/");
    if (!parent) return null;
    const created: RuntimeFile = { kind: "file", content: Buffer.alloc(0), length: 0, mtime: SECONDS() };
    parent.entries.set(baseName(target), created);
    return created;
  }

  /** Walks a path, creating the directories along the way. */
  private ensureDirectory(path: string): RuntimeDirectory {
    const target = normalizePath(path);
    let current = this.root;
    for (const segment of target.split("/").filter(Boolean)) {
      const next = current.entries.get(segment);
      if (next?.kind === "dir") {
        current = next;
        continue;
      }
      const created: RuntimeDirectory = { kind: "dir", entries: new Map(), mtime: SECONDS() };
      current.entries.set(segment, created);
      current = created;
    }
    return current;
  }
}
