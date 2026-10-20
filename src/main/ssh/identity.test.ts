import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureIdentity, findIdentity, generateEd25519Key } from "./identity";

describe("SSH identity detection and generation", () => {
  let home: string;

  beforeEach(() => {
    home = join(tmpdir(), `colabdesk-ssh-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(home, ".ssh"), { recursive: true });
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it("ignores id_rsa because Colab rejects ssh-rsa server-side", () => {
    writeFileSync(join(home, ".ssh", "id_rsa"), "fake-rsa-private");
    writeFileSync(join(home, ".ssh", "id_rsa.pub"), "ssh-rsa AAAA...");

    expect(findIdentity(home)).toBeNull();
  });

  it("generates an ed25519 identity when missing and preserves existing id_rsa", () => {
    const rsaPath = join(home, ".ssh", "id_rsa");
    writeFileSync(rsaPath, "keep-my-rsa-key");

    const created = ensureIdentity(home);
    expect(created.privateKeyPath).toBe(join(home, ".ssh", "id_ed25519"));
    expect(created.publicKey.startsWith("ssh-ed25519 ")).toBe(true);
    expect(existsSync(`${created.privateKeyPath}.pub`)).toBe(true);
    expect(readFileSync(rsaPath, "utf8")).toBe("keep-my-rsa-key");

    const found = findIdentity(home);
    expect(found?.privateKeyPath).toBe(created.privateKeyPath);
    expect(found?.publicKey).toBe(created.publicKey);
  });

  it("returns the existing supported identity without overwriting it", () => {
    const first = generateEd25519Key();
    const keyPath = join(home, ".ssh", "id_ed25519");
    writeFileSync(keyPath, first.private, { mode: 0o600 });
    writeFileSync(`${keyPath}.pub`, `${first.public}\n`);

    const second = ensureIdentity(home);
    expect(second.privateKey.toString("utf8")).toBe(first.private);
    expect(second.publicKey).toBe(first.public.trim());
  });
});
