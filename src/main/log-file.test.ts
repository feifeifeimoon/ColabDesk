import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LogFile, redactSecrets } from "./log-file";

/** A directory that goes away with the test, whether it passed or threw. */
function withTempDir<T>(name: string, body: (dir: string) => T): T {
  const dir = join(tmpdir(), `colabdesk-${name}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  try {
    return body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("redactSecrets", () => {
  it("keeps the shape of an authorization URL and drops the credential in it", () => {
    const url =
      "https://accounts.google.com/o/oauth2/auth?response_type=code&client_id=123.apps.googleusercontent.com" +
      "&scope=openid&state=xyz-state&code=4/0AX4XfWg-SECRET-CODEvalue&prompt=consent";

    const redacted = redactSecrets(url);
    expect(redacted).toContain("response_type=code");
    expect(redacted).toContain("client_id=123.apps.googleusercontent.com");
    expect(redacted).not.toContain("SECRET-CODEvalue");
    expect(redacted).not.toContain("xyz-state");
  });

  it("drops labelled tokens in JSON and in key=value output", () => {
    expect(redactSecrets('{"token": "e2e-token-alpha", "name": "alpha"}')).toBe(
      '{"token": "<redacted>", "name": "alpha"}',
    );
    expect(redactSecrets("api_key=abc123XYZ\npassword: hunter2")).toBe(
      "api_key=<redacted>\npassword: <redacted>",
    );
    expect(redactSecrets("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig")).toBe(
      "Authorization: Bearer <redacted>",
    );
  });

  it("leaves the rest of a real command line alone", () => {
    const line = "colab new --gpu T4 -s e2e-alpha → exit 1 · 1204ms";
    expect(redactSecrets(line)).toBe(line);
  });
});

describe("LogFile", () => {
  it("writes one timestamped record per call, output and all", () => {
    withTempDir("log", (dir) => {
      const log = new LogFile(dir);
      log.write("cli", "colab new -s alpha → exit 1 · 12ms\n会话 alpha 已存在。");

      const written = readFileSync(log.path(), "utf8");
      expect(written).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[cli\] colab new -s alpha → exit 1 · 12ms\n/);
      expect(written).toContain("会话 alpha 已存在。");
    });
  });

  it("redacts on the way to disk, not on the way out of it", () => {
    withTempDir("log-redact", (dir) => {
      const log = new LogFile(dir);
      log.write("login", "https://accounts.google.com/o/oauth2/auth?client_id=1&code=4/0SECRET-CODE");

      const written = readFileSync(log.path(), "utf8");
      expect(written).toContain("client_id=1");
      expect(written).not.toContain("SECRET-CODE");
    });
  });

  it("keeps one rotation and keeps writing after it", () => {
    withTempDir("log-rotate", (dir) => {
      const log = new LogFile(dir, 120);
      log.write("cli", "a".repeat(100));
      log.write("cli", "b".repeat(100));
      log.write("cli", "after the rotation");

      // One kept rotation: the record before last is gone, the previous one is
      // the history, and the newest is the live file.
      const rotated = readFileSync(`${log.path()}.1`, "utf8");
      expect(rotated).toContain("b".repeat(100));
      expect(rotated).not.toContain("a".repeat(100));
      expect(readFileSync(log.path(), "utf8")).toContain("after the rotation");
    });
  });

  it("truncates a record that would eat the file", () => {
    withTempDir("log-clamp", (dir) => {
      const log = new LogFile(dir);
      log.write("cli", "x".repeat(20_000));

      const written = readFileSync(log.path(), "utf8");
      expect(written).toContain("已截断");
      expect(written.length).toBeLessThan(10_000);
      expect(written).toContain("20000 字符");
    });
  });

  it("never throws when the directory cannot be written to", () => {
    withTempDir("log-fail", (dir) => {
      // A file where the directory should be: mkdir fails with ENOTDIR/EEXIST.
      const blocker = join(dir, "logs");
      writeFileSync(blocker, "not a directory");

      const log = new LogFile(blocker);
      expect(() => log.ensure()).not.toThrow();
      expect(() => log.write("cli", "this goes nowhere")).not.toThrow();
      expect(() => log.write("cli", "and neither does this")).not.toThrow();
    });
  });
});
