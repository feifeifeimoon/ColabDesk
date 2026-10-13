import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashRuntimeDir } from "./runtime-hash.mjs";

let root;
const scratch = [];

/** Writes a small tree under `base`; callers pass { "relative/path": "contents" }. */
function tree(base, files) {
  for (const [relative, contents] of Object.entries(files)) {
    const full = join(base, relative);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents, "utf8");
  }
}

/** A second temp dir, cleaned up alongside `root`. */
function scratchDir() {
  const dir = mkdtempSync(join(tmpdir(), "runtime-hash-"));
  scratch.push(dir);
  return dir;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "runtime-hash-"));
});

afterEach(() => {
  for (const dir of [root, ...scratch.splice(0)]) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("hashRuntimeDir", () => {
  it("is stable across runs for an identical tree", async () => {
    tree(root, { "site/a.py": "a", "python/bin/python3": "binary" });
    expect(await hashRuntimeDir(root)).toBe(await hashRuntimeDir(root));
  });

  it("does not depend on the order the files were written", async () => {
    tree(root, { "site/a.py": "a", "site/b.py": "b" });

    const other = scratchDir();
    tree(other, { "site/b.py": "b", "site/a.py": "a" });

    expect(await hashRuntimeDir(other)).toBe(await hashRuntimeDir(root));
  });

  it("changes when a file's contents change", async () => {
    tree(root, { "site/a.py": "before" });
    const before = await hashRuntimeDir(root);
    tree(root, { "site/a.py": "after" });
    expect(await hashRuntimeDir(root)).not.toBe(before);
  });

  it("changes when a file is renamed", async () => {
    tree(root, { "site/a.py": "same" });
    const before = await hashRuntimeDir(root);
    rmSync(join(root, "site", "a.py"));
    tree(root, { "site/b.py": "same" });
    expect(await hashRuntimeDir(root)).not.toBe(before);
  });

  it("ignores __pycache__ and .pyc, which embed build-machine paths", async () => {
    tree(root, { "site/a.py": "a" });
    const clean = await hashRuntimeDir(root);
    tree(root, { "site/__pycache__/a.cpython-312.pyc": "compiled" });
    tree(root, { "site/b.pyc": "compiled" });
    expect(await hashRuntimeDir(root)).toBe(clean);
  });

  it("throws when the directory does not exist", async () => {
    await expect(hashRuntimeDir(join(root, "nope"))).rejects.toThrow();
  });

  if (process.platform !== "win32") {
    it("hashes relative symlinks stably by link target", async () => {
      tree(root, { "python/bin/python3.12": "executable" });
      symlinkSync("python3.12", join(root, "python", "bin", "python3"));
      const first = await hashRuntimeDir(root);

      const other = scratchDir();
      tree(other, { "python/bin/python3.12": "executable" });
      symlinkSync("python3.12", join(other, "python", "bin", "python3"));
      expect(await hashRuntimeDir(other)).toBe(first);

      const different = scratchDir();
      tree(different, { "python/bin/python3.12": "executable", "python/bin/other": "other" });
      symlinkSync("other", join(different, "python", "bin", "python3"));
      expect(await hashRuntimeDir(different)).not.toBe(first);
    });
  }
});
