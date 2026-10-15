import { describe, expect, it } from "vitest";
import type { SFTPWrapper } from "ssh2";
import { deconflictedName, removePath, throttleProgress } from "./sftp-ops";

const S_IFDIR = 0o040000;
const S_IFLNK = 0o120000;
const S_IFREG = 0o100000;

type Node = { kind: "dir"; entries: string[] } | { kind: "file" | "link"; size: number };

/**
 * The smallest SFTP the operations under test actually use.
 *
 * `lstat` is answered from the same table `readdir` reads, so a test can put a
 * link in a directory and watch what the recursion does with it — which is the
 * whole point of the first case below.
 */
function fakeSftp(tree: Map<string, Node>) {
  const unlinked: string[] = [];
  const sftp = {
    lstat(path: string, cb: (error: Error | undefined, stats: unknown) => void) {
      const node = tree.get(path);
      if (!node) return cb(new Error("no such file"), undefined);
      cb(undefined, {
        mode: node.kind === "dir" ? S_IFDIR : node.kind === "link" ? S_IFLNK : S_IFREG,
        size: node.kind === "dir" ? 0 : node.size,
        mtime: 0,
      });
    },
    readdir(path: string, cb: (error: Error | undefined, list: unknown[]) => void) {
      const node = tree.get(path);
      if (node?.kind !== "dir") return cb(new Error("not a directory"), []);
      cb(
        undefined,
        node.entries.map((name) => ({
          filename: name,
          attrs: {
            mode: tree.get(`${path}/${name}`)?.kind === "dir" ? S_IFDIR : S_IFREG,
            size: 0,
            mtime: 0,
          },
        })),
      );
    },
    unlink(path: string, cb: (error?: Error) => void) {
      unlinked.push(path);
      tree.delete(path);
      cb();
    },
    rmdir(path: string, cb: (error?: Error) => void) {
      tree.delete(path);
      cb();
    },
  };
  return { sftp: sftp as unknown as SFTPWrapper, unlinked };
}

describe("removePath", () => {
  it("unlinks a symbolic link instead of emptying what it points at", () => {
    const tree = new Map<string, Node>([
      ["/content", { kind: "dir", entries: ["data", "shortcut"] }],
      // `shortcut` is a link to the directory `data`; deleting the link must not
      // reach the files behind it.
      ["/content/shortcut", { kind: "link", size: 0 }],
      ["/content/data", { kind: "dir", entries: ["sample.csv"] }],
      ["/content/data/sample.csv", { kind: "file", size: 12 }],
    ]);
    const { sftp, unlinked } = fakeSftp(tree);

    return removePath(sftp, "/content/shortcut").then(() => {
      expect(unlinked).toEqual(["/content/shortcut"]);
      expect(tree.has("/content/data/sample.csv")).toBe(true);
      expect(tree.has("/content/data")).toBe(true);
    });
  });

  it("empties a directory before removing it", async () => {
    const tree = new Map<string, Node>([
      ["/content", { kind: "dir", entries: ["data"] }],
      ["/content/data", { kind: "dir", entries: ["sample.csv"] }],
      ["/content/data/sample.csv", { kind: "file", size: 12 }],
    ]);
    const { sftp, unlinked } = fakeSftp(tree);

    await removePath(sftp, "/content/data");
    expect(unlinked).toEqual(["/content/data/sample.csv"]);
    expect(tree.has("/content/data")).toBe(false);
  });
});

describe("throttleProgress", () => {
  const collect = () => {
    const seen: number[] = [];
    let clock = 0;
    return {
      seen,
      tick: (ms: number) => {
        clock += ms;
      },
      emit: throttleProgress((transferred) => seen.push(transferred), () => clock),
    };
  };

  it("drops reports that arrive before the clock has moved on", () => {
    const { seen, emit, tick } = collect();
    emit(32_768, 10_000_000);
    emit(65_536, 10_000_000);
    expect(seen).toEqual([32_768]);

    tick(100);
    emit(98_304, 10_000_000);
    expect(seen).toEqual([32_768, 98_304]);
  });

  it("lets a report through early when the file has moved on by a percent", () => {
    const { seen, emit } = collect();
    emit(0, 1000);
    emit(5, 1000);
    expect(seen).toEqual([0]);

    emit(10, 1000);
    expect(seen).toEqual([0, 10]);
  });
});

describe("deconflictedName", () => {
  it("keeps the extension when adding a copy suffix", () => {
    expect(deconflictedName("model.pt", () => false)).toBe("model copy.pt");
    expect(deconflictedName("archive.tar.gz", () => false)).toBe("archive.tar copy.gz");
  });

  it("keeps counting until the name is free", () => {
    const taken = new Set(["model copy.pt", "model copy 2.pt"]);
    expect(deconflictedName("model.pt", (name) => taken.has(name))).toBe("model copy 3.pt");
  });
});
