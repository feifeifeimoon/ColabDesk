import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLI_PATH_ENV, combined, needsLogin, parseUsage, parseVersion, readManifestVersion, resolveCli } from "./cli";

describe("parseUsage", () => {
  it("parses the three labelled lines", () => {
    const usage = parseUsage(
      "Current balance: 123.45 compute units\nUsage rate: 1.20/hr\nActive assignments: 2\n",
    );
    expect(usage).toEqual({ balance: 123.45, rate: 1.2, assignments: 2 });
  });

  it("parses real Windows CRLF output", () => {
    const usage = parseUsage(
      "Current balance: 400.00 compute units\r\nUsage rate: 0.00/hr\r\nActive assignments: 0\r\n",
    );
    expect(usage).toEqual({ balance: 400, rate: 0, assignments: 0 });
  });

  it("leaves fields empty on an unknown format", () => {
    expect(parseUsage("some other output\n")).toEqual({ balance: null, rate: null, assignments: null });
  });
});

describe("needsLogin", () => {
  it("detects the OAuth prompt", () => {
    expect(needsLogin("To authorize colab-cli, visit this URL")).toBe(true);
    expect(needsLogin("https://accounts.google.com/o/oauth2/auth?x=1")).toBe(true);
    expect(needsLogin("Current balance: 0.00 compute units")).toBe(false);
  });
});

describe("parseVersion", () => {
  it("reads the labelled version", () => {
    expect(parseVersion("Version: 0.7.4\n")).toBe("0.7.4");
    expect(parseVersion("no version here")).toBeNull();
  });
});

describe("combined output", () => {
  it("keeps stdout before stderr and skips empty streams", () => {
    expect(combined({ code: 0, stdout: "a\n", stderr: "", timedOut: false })).toBe("a");
    expect(combined({ code: 1, stdout: "", stderr: "boom\n", timedOut: false })).toBe("boom");
    expect(combined({ code: 0, stdout: "out", stderr: "err", timedOut: false })).toBe("out\nerr");
  });
});

describe("readManifestVersion", () => {
  it("returns null for non-existent manifest", () => {
    expect(readManifestVersion("non-existent-dir")).toBeNull();
  });
});

describe("resolveCli", () => {
  it("prefers override when COLABDESK_CLI_PATH points to an executable", () => {
    const tempDir = join(tmpdir(), `colab-cli-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    const fakeCli = join(tempDir, process.platform === "win32" ? "colab.exe" : "colab");
    writeFileSync(fakeCli, "echo fake", { mode: 0o755 });

    const prev = process.env[CLI_PATH_ENV];
    try {
      process.env[CLI_PATH_ENV] = fakeCli;
      const resolved = resolveCli();
      expect(resolved).not.toBeNull();
      expect(resolved?.source).toBe("override");
      expect(resolved?.exe).toBe(fakeCli);
    } finally {
      if (prev !== undefined) process.env[CLI_PATH_ENV] = prev;
      else delete process.env[CLI_PATH_ENV];
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("resolves bundled runtime when bundledDir layout exists", () => {
    const tempDir = join(tmpdir(), `colab-bundled-test-${Date.now()}`);
    const pyDir = join(tempDir, "python");
    const siteDir = join(tempDir, "site");
    mkdirSync(pyDir, { recursive: true });
    mkdirSync(siteDir, { recursive: true });
    const fakePy = join(pyDir, process.platform === "win32" ? "python.exe" : "bin/python3");
    if (process.platform !== "win32") mkdirSync(join(pyDir, "bin"), { recursive: true });
    writeFileSync(fakePy, "", { mode: 0o755 });

    const resolved = resolveCli(tempDir);
    expect(resolved).not.toBeNull();
    expect(resolved?.source).toBe("bundled");
    expect(resolved?.prefix).toEqual(["-m", "colab_cli.cli"]);
    expect(resolved?.env.PYTHONPATH).toBe(siteDir);
    expect(resolved?.env.PYTHONUNBUFFERED).toBe("1");

    rmSync(tempDir, { recursive: true, force: true });
  });
});
