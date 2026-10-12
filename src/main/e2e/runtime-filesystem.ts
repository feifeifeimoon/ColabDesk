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
  content: Buffer;
  mtime: number;
}

interface RuntimeDirectory {
  kind: "dir";
  entries: Map<string, RuntimeNode>;
  mtime: number;
}

export type RuntimeNode = RuntimeFile | RuntimeDirectory;

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
    content.entries.set("README.txt", {
      kind: "file",
      content: Buffer.from("ColabDesk E2E runtime.\nNothing here is real.\n"),
      mtime: now,
    });
    content.entries.set("model.pt", { kind: "file", content: Buffer.alloc(2048, 7), mtime: now });

    const data: RuntimeDirectory = { kind: "dir", entries: new Map(), mtime: now };
    data.entries.set("sample.csv", { kind: "file", content: Buffer.from("x,y\n1,2\n"), mtime: now });
    content.entries.set("data", data);
  }

  node(path: string, cwd = "/"): RuntimeNode | null {
    const target = normalizePath(path, cwd);
    if (target === "/") return this.root;

    const parent = this.directory(parentOf(target) ?? "/");
    return parent?.entries.get(baseName(target)) ?? null;
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

  /** Creates a file (or truncates one) and returns it, for SFTP `OPEN`. */
  create(path: string, cwd = "/"): RuntimeFile | null {
    const target = normalizePath(path, cwd);
    const existing = this.node(target);
    if (existing?.kind === "file") return existing;
    if (existing) return null;

    const parent = this.directory(parentOf(target) ?? "/");
    if (!parent) return null;
    const created: RuntimeFile = { kind: "file", content: Buffer.alloc(0), mtime: SECONDS() };
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
