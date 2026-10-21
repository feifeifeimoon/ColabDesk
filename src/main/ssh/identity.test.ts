import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { utils } from "ssh2";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureIdentity, findIdentity, generateEd25519Key } from "./identity";

describe("SSH identity detection and generation", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "colabdesk-ssh-test-"));
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

  it("reuses an existing id_ecdsa instead of creating an id_ed25519 beside it", () => {
    const first = utils.generateKeyPairSync("ecdsa", { bits: 256 });
    const keyPath = join(home, ".ssh", "id_ecdsa");
    writeFileSync(keyPath, first.private, { mode: 0o600 });
    writeFileSync(`${keyPath}.pub`, `${first.public}\n`);

    const identity = ensureIdentity(home);
    expect(identity.privateKeyPath).toBe(keyPath);
    expect(existsSync(join(home, ".ssh", "id_ed25519"))).toBe(false);
  });

  it("derives the public key from the private key rather than trusting a stale .pub", () => {
    const first = generateEd25519Key();
    const keyPath = join(home, ".ssh", "id_ed25519");
    writeFileSync(keyPath, first.private, { mode: 0o600 });
    writeFileSync(`${keyPath}.pub`, "ssh-ed25519 AAAA-stale\n");

    const found = findIdentity(home);
    expect(found?.publicKey).toBe(first.public.trim());
  });

  it("treats a private key it cannot parse as unusable even when a .pub sits beside it", () => {
    writeFileSync(join(home, ".ssh", "id_ed25519"), "not-a-private-key");
    writeFileSync(join(home, ".ssh", "id_ed25519.pub"), "ssh-ed25519 AAAA-stale\n");

    expect(findIdentity(home)).toBeNull();
  });

  it("does not accept an RSA key just because it sits at a supported path", () => {
    const rsa = utils.generateKeyPairSync("rsa", { bits: 2048 });
    const keyPath = join(home, ".ssh", "id_ed25519");
    writeFileSync(keyPath, rsa.private, { mode: 0o600 });
    writeFileSync(`${keyPath}.pub`, `${rsa.public}\n`);

    expect(findIdentity(home)).toBeNull();
    expect(() => ensureIdentity(home)).toThrow(/不会覆盖现有私钥/);
  });

  it("refuses to overwrite an existing id_ed25519 it cannot parse", () => {
    const keyPath = join(home, ".ssh", "id_ed25519");
    writeFileSync(keyPath, "keep-this-private-key");
    writeFileSync(`${keyPath}.pub`, "ssh-ed25519 AAAA-keep\n");

    expect(() => ensureIdentity(home)).toThrow(/不会覆盖现有私钥/);
    expect(readFileSync(keyPath, "utf8")).toBe("keep-this-private-key");
    expect(readFileSync(`${keyPath}.pub`, "utf8")).toBe("ssh-ed25519 AAAA-keep\n");
  });
});
