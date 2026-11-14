import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedCli } from "./cli";
import {
  credentialInterpreter,
  invalidateCredentialCache,
  keyringOutcome,
  readCredential,
  setCredentialCli,
  writeCredential,
  deleteCredential,
} from "./credential-store";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "credential-store-test-"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  setCredentialCli(null);
  invalidateCredentialCache();
  rmSync(dir, { recursive: true, force: true });
});

function shim(exe: string, source: ResolvedCli["source"] = "path"): ResolvedCli {
  return { exe, prefix: [], env: {}, label: exe, source };
}

describe("the keyring helper's exit code", () => {
  it("reads a zero exit as the answer", () => {
    expect(keyringOutcome(0)).toBe("ok");
  });

  it("reads the helper's own 3 — no keyring module — as a pre-0.8.0 CLI", () => {
    expect(keyringOutcome(3)).toBe("unsupported");
  });

  it("reads everything else, including a killed helper, as a failure", () => {
    expect(keyringOutcome(4)).toBe("failed");
    expect(keyringOutcome(1)).toBe("failed");
    expect(keyringOutcome(null)).toBe("failed");
  });
});

describe("credentialInterpreter", () => {
  it("uses the bundled CLI itself, which is a Python", () => {
    const bundled = shim(join(dir, "python", "python.exe"), "bundled");
    expect(credentialInterpreter(bundled)).toBe(bundled.exe);
  });

  it("finds the venv interpreter next to a console-script shim", () => {
    const name = process.platform === "win32" ? "python.exe" : "python3";
    const python = join(dir, name);
    writeFileSync(python, "");
    expect(credentialInterpreter(shim(join(dir, "colab")))).toBe(python);
  });

  if (process.platform !== "win32") {
    it("follows a console script's shebang when no interpreter sits beside it", () => {
      const python = join(dir, "venv-python3");
      writeFileSync(python, "");
      chmodSync(python, 0o755);
      const script = join(dir, "colab");
      writeFileSync(script, `#!${python}\nimport colab_cli\n`);
      expect(credentialInterpreter(shim(script))).toBe(python);
    });

    it("does not mistake a shell wrapper for a Python", () => {
      const script = join(dir, "colab");
      writeFileSync(script, "#!/bin/sh\nexec python3 -m colab_cli.cli \"$@\"\n");
      expect(credentialInterpreter(shim(script))).toBeNull();
    });
  }

  it("answers null when there is no CLI at all", () => {
    expect(credentialInterpreter(null)).toBeNull();
  });
});

describe("the file store", () => {
  beforeEach(() => {
    // The E2E CLI is an in-process stub with no keyring; that is the path here.
    vi.stubEnv("COLABDESK_E2E_MOCK", "1");
    setCredentialCli(null);
  });

  it("reads the pre-0.8.0 token file when that is all there is", async () => {
    const file = join(dir, "token.json");
    writeFileSync(file, '{"token":"t","refresh_token":"r"}');
    await expect(readCredential(file)).resolves.toEqual({ json: '{"token":"t","refresh_token":"r"}' });
  });

  it("answers null rather than throwing when the file is missing", async () => {
    await expect(readCredential(join(dir, "absent.json"))).resolves.toBeNull();
  });

  it("writes the file for a CLI that has no keyring to write to", async () => {
    const file = join(dir, "token.json");
    await expect(writeCredential(file, '{"token":"new"}')).resolves.toBe(true);
    expect(readFileSync(file, "utf8")).toBe('{"token":"new"}');
  });

  it("removes the file on sign-out", async () => {
    const file = join(dir, "token.json");
    writeFileSync(file, '{"token":"t"}');
    await deleteCredential(file);
    expect(existsSync(file)).toBe(false);
  });
});
