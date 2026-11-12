import { existsSync, lstatSync, mkdirSync, mkdtempSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CLI_VERSION,
  PYTHON_VERSION,
  RUNTIME_LAYOUT_VERSION,
  cliUsesVariableTransfer,
  copyPythonDistribution,
  isAlreadyBundled,
  prunePython,
  pruneSite,
  verifyBundleSymlinks,
} from "./bundle-cli.mjs";

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

describe("prunePython", () => {
  function createFile(path, contents = "x") {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }

  it("prunes both the Windows and the POSIX layout", () => {
    const winLib = join(destDir, "Lib");
    const posixLib = join(destDir, "lib", "python3.12");

    createFile(join(winLib, "test", "test_math.py"));
    createFile(join(winLib, "site-packages", "pip", "__init__.py"));
    createFile(join(winLib, "tkinter", "__init__.py"));
    createFile(join(winLib, "turtle.py"));
    createFile(join(winLib, "json", "__init__.py"));
    createFile(join(destDir, "DLLs", "_testcapi.pyd"));
    createFile(join(destDir, "DLLs", "_tkinter.pyd"));
    createFile(join(destDir, "DLLs", "tcl86t.dll"));
    createFile(join(destDir, "DLLs", "_ssl.pyd"));

    createFile(join(posixLib, "test", "test_math.py"));
    createFile(join(posixLib, "ensurepip", "__init__.py"));
    createFile(join(posixLib, "lib-dynload", "_testcapi.cpython-312-x86_64-linux-gnu.so"));
    createFile(join(posixLib, "lib-dynload", "_ssl.cpython-312-x86_64-linux-gnu.so"));
    createFile(join(destDir, "lib", "tcl8.6", "init.tcl"));
    createFile(join(destDir, "lib", "libtcl8.6.dylib"));
    createFile(join(destDir, "include", "python3.12", "Python.h"));

    prunePython(destDir);

    expect(existsSync(join(winLib, "test"))).toBe(false);
    expect(existsSync(join(winLib, "site-packages"))).toBe(false);
    expect(existsSync(join(winLib, "tkinter"))).toBe(false);
    expect(existsSync(join(winLib, "turtle.py"))).toBe(false);
    expect(existsSync(join(destDir, "DLLs", "_testcapi.pyd"))).toBe(false);
    expect(existsSync(join(destDir, "DLLs", "_tkinter.pyd"))).toBe(false);
    expect(existsSync(join(destDir, "DLLs", "tcl86t.dll"))).toBe(false);
    expect(existsSync(join(posixLib, "test"))).toBe(false);
    expect(existsSync(join(posixLib, "ensurepip"))).toBe(false);
    expect(existsSync(join(posixLib, "lib-dynload", "_testcapi.cpython-312-x86_64-linux-gnu.so"))).toBe(false);
    expect(existsSync(join(destDir, "lib", "tcl8.6"))).toBe(false);
    expect(existsSync(join(destDir, "lib", "libtcl8.6.dylib"))).toBe(false);
    expect(existsSync(join(destDir, "include"))).toBe(false);

    // What the CLI does need stays.
    expect(existsSync(join(winLib, "json", "__init__.py"))).toBe(true);
    expect(existsSync(join(destDir, "DLLs", "_ssl.pyd"))).toBe(true);
    expect(existsSync(join(posixLib, "lib-dynload", "_ssl.cpython-312-x86_64-linux-gnu.so"))).toBe(true);
  });
});

describe("pruneSite", () => {
  function createFile(path, contents = "x") {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }

  it("drops console-script shims and pyarrow when the CLI never transfers variables", () => {
    createFile(join(destDir, "bin", "colab.exe"));
    createFile(join(destDir, "pyarrow", "lib.cp312-win_amd64.pyd"));
    createFile(join(destDir, "pyarrow.libs", "libarrow.dll"));
    createFile(join(destDir, "pyarrow-26.0.0.dist-info", "METADATA"));
    createFile(join(destDir, "colab_cli", "cli.py"), "import typer\n");
    createFile(join(destDir, "jupyter_mimetypes", "_io", "_pandas.py"), "import pyarrow as pa\n");

    expect(cliUsesVariableTransfer(destDir)).toBe(false);
    pruneSite(destDir);

    expect(existsSync(join(destDir, "bin"))).toBe(false);
    expect(existsSync(join(destDir, "pyarrow"))).toBe(false);
    expect(existsSync(join(destDir, "pyarrow.libs"))).toBe(false);
    expect(existsSync(join(destDir, "pyarrow-26.0.0.dist-info"))).toBe(false);
    expect(existsSync(join(destDir, "colab_cli", "cli.py"))).toBe(true);
    expect(existsSync(join(destDir, "jupyter_mimetypes", "_io", "_pandas.py"))).toBe(true);
  });

  it("keeps pyarrow but strips its SDK-only files when the CLI transfers variables", () => {
    createFile(join(destDir, "colab_cli", "cli.py"), "client.get_variable(name)\n");
    createFile(join(destDir, "pyarrow", "lib.cp312-win_amd64.pyd"));
    createFile(join(destDir, "pyarrow", "include", "arrow", "api.h"));
    createFile(join(destDir, "pyarrow", "src", "arrow", "allocator.cc"));
    createFile(join(destDir, "pyarrow", "tests", "test_lib.py"));
    createFile(join(destDir, "pyarrow", "arrow.lib"));

    expect(cliUsesVariableTransfer(destDir)).toBe(true);
    pruneSite(destDir);

    expect(existsSync(join(destDir, "pyarrow", "lib.cp312-win_amd64.pyd"))).toBe(true);
    expect(existsSync(join(destDir, "pyarrow", "include"))).toBe(false);
    expect(existsSync(join(destDir, "pyarrow", "src"))).toBe(false);
    expect(existsSync(join(destDir, "pyarrow", "tests"))).toBe(false);
    expect(existsSync(join(destDir, "pyarrow", "arrow.lib"))).toBe(false);
  });

  it("treats an unknown CLI layout as a reason to keep pyarrow", () => {
    expect(cliUsesVariableTransfer(destDir)).toBe(true);
  });
});

describe("isAlreadyBundled", () => {
  function seedBundle(dir, manifest) {
    const pyExe = process.platform === "win32" ? join(dir, "python", "python.exe") : join(dir, "python", "bin", "python3");
    const cliEntry = join(dir, "site", "colab_cli", "cli.py");
    mkdirSync(join(pyExe, ".."), { recursive: true });
    mkdirSync(join(cliEntry, ".."), { recursive: true });
    writeFileSync(pyExe, "binary");
    writeFileSync(cliEntry, "# cli");
    writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest));
  }

  it("pins google-colab-cli 0.7.5", () => {
    expect(CLI_VERSION).toBe("0.7.5");
  });

  it("returns false when manifest cliVersion lags the pinned CLI_VERSION", () => {
    seedBundle(destDir, {
      cliVersion: "0.7.4",
      pythonVersion: PYTHON_VERSION,
      layoutVersion: RUNTIME_LAYOUT_VERSION,
    });
    expect(isAlreadyBundled(destDir)).toBe(false);
  });

  it("returns false when the bundle predates the current prune rules", () => {
    seedBundle(destDir, {
      cliVersion: CLI_VERSION,
      pythonVersion: PYTHON_VERSION,
      layoutVersion: RUNTIME_LAYOUT_VERSION - 1,
    });
    expect(isAlreadyBundled(destDir)).toBe(false);
  });

  it("returns true when files and manifest versions match the pins", () => {
    seedBundle(destDir, {
      cliVersion: CLI_VERSION,
      pythonVersion: PYTHON_VERSION,
      layoutVersion: RUNTIME_LAYOUT_VERSION,
    });
    expect(isAlreadyBundled(destDir)).toBe(true);
  });
});
