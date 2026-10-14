import { existsSync, lstatSync, mkdirSync, mkdtempSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { copyPythonDistribution, verifyBundleSymlinks } from "./bundle-cli.mjs";

let srcDir;
let destDir;

beforeEach(() => {
  srcDir = mkdtempSync(join(tmpdir(), "bundle-test-src-"));
  destDir = mkdtempSync(join(tmpdir(), "bundle-test-dst-"));
});

afterEach(() => {
  rmSync(srcDir, { recursive: true, force: true });
  rmSync(destDir, { recursive: true, force: true });
});

describe("copyPythonDistribution", () => {
  it("copies files and subdirectories while preserving file contents", () => {
    mkdirSync(join(srcDir, "sub"), { recursive: true });
    writeFileSync(join(srcDir, "sub", "file.txt"), "hello world", "utf8");

    copyPythonDistribution(srcDir, destDir);

    expect(existsSync(join(destDir, "sub", "file.txt"))).toBe(true);
  });

  if (process.platform !== "win32") {
    it("preserves relative symlinks without resolving them to absolute paths", () => {
      mkdirSync(join(srcDir, "bin"), { recursive: true });
      writeFileSync(join(srcDir, "bin", "python3.12"), "binary", "utf8");
      symlinkSync("python3.12", join(srcDir, "bin", "python3"));

      copyPythonDistribution(srcDir, destDir);

      const targetSymlink = join(destDir, "bin", "python3");
      expect(lstatSync(targetSymlink).isSymbolicLink()).toBe(true);
      // Crucial: link target must be relative 'python3.12', NOT an absolute path on the build machine
      expect(readlinkSync(targetSymlink)).toBe("python3.12");
      expect(existsSync(targetSymlink)).toBe(true);
    });

    it("re-bases absolute symlinks that point inside the source directory to be relative", () => {
      mkdirSync(join(srcDir, "bin"), { recursive: true });
      const targetFile = join(srcDir, "bin", "python3.12");
      writeFileSync(targetFile, "binary", "utf8");
      symlinkSync(targetFile, join(srcDir, "bin", "python3"));

      copyPythonDistribution(srcDir, destDir);

      const targetSymlink = join(destDir, "bin", "python3");
      expect(lstatSync(targetSymlink).isSymbolicLink()).toBe(true);
      expect(readlinkSync(targetSymlink)).toBe("python3.12");
      expect(existsSync(targetSymlink)).toBe(true);
    });
  }
});

describe("verifyBundleSymlinks", () => {
  it("does nothing if directory does not exist", () => {
    expect(() => verifyBundleSymlinks(join(destDir, "nonexistent"))).not.toThrow();
  });

  if (process.platform !== "win32") {
    it("passes when all symlinks are valid and relative", () => {
      writeFileSync(join(destDir, "target.txt"), "content");
      symlinkSync("target.txt", join(destDir, "link.txt"));

      expect(() => verifyBundleSymlinks(destDir)).not.toThrow();
    });

    it("throws when an absolute symlink is detected", () => {
      writeFileSync(join(srcDir, "external.txt"), "content");
      symlinkSync(join(srcDir, "external.txt"), join(destDir, "abs-link.txt"));

      expect(() => verifyBundleSymlinks(destDir)).toThrow(/Absolute symlink detected/);
    });

    it("throws when a broken symlink is detected", () => {
      symlinkSync("missing.txt", join(destDir, "broken-link.txt"));

      expect(() => verifyBundleSymlinks(destDir)).toThrow(/Broken symlink detected/);
    });
  }
});
