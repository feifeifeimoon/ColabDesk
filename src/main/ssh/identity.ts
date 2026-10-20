/**
 * SSH identity: the private key used to authenticate, and the public key sent
 * in the `X-Colab-Ssh-Pubkey` header (they must match).
 *
 * The Python CLI derives the public key with `ssh-keygen -y -f`. That would
 * make the app depend on an external binary again, so instead the public key
 * is derived in-process from the private key when no `.pub` file exists.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { utils } from "ssh2";

export interface Identity {
  privateKeyPath: string;
  privateKey: Buffer;
  /** Full public key line: `<type> <base64>`. */
  publicKey: string;
}

const CANDIDATES = ["id_ed25519", "id_ecdsa"];

/** Derives `ssh-ed25519 AAAA…` from a private key, no ssh-keygen required. */
export function publicKeyFromPrivate(privateKey: Buffer): string {
  const parsed = utils.parseKey(privateKey);
  if (parsed instanceof Error) throw new Error(`无法解析私钥: ${parsed.message}`);
  const key = Array.isArray(parsed) ? parsed[0] : parsed;
  const blob = key.getPublicSSH();
  return `${key.type} ${blob.toString("base64")}`;
}

/**
 * An ed25519 keypair that actually parses.
 *
 * ssh2's own generator hands back a key its own parser rejects roughly once in
 * 250 tries (measured over 3000), so retry until the parser accepts it.
 */
export function generateEd25519Key(): { private: string; public: string } {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const key = utils.generateKeyPairSync("ed25519");
    if (!(utils.parseKey(key.private) instanceof Error)) return key;
  }
  throw new Error("无法生成可解析的 ed25519 密钥：ssh2 的生成器连续失败。");
}

export function findIdentity(home: string = homedir()): Identity | null {
  const sshDir = join(home, ".ssh");
  for (const name of CANDIDATES) {
    const privateKeyPath = join(sshDir, name);
    if (!existsSync(privateKeyPath)) continue;

    try {
      const privateKey = readFileSync(privateKeyPath);
      const pubPath = `${privateKeyPath}.pub`;
      const publicKey = existsSync(pubPath)
        ? readFileSync(pubPath, "utf8").trim()
        : publicKeyFromPrivate(privateKey);

      return { privateKeyPath, privateKey, publicKey };
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Ensures a Colab-compatible SSH identity (`id_ed25519` or `id_ecdsa`) exists
 * in `~/.ssh`, generating `~/.ssh/id_ed25519` if neither is present. Existing
 * keys (such as `id_rsa`) are never touched.
 */
export function ensureIdentity(home: string = homedir()): Identity {
  const existing = findIdentity(home);
  if (existing) return existing;

  const sshDir = join(home, ".ssh");
  mkdirSync(sshDir, { recursive: true });

  const privateKeyPath = join(sshDir, "id_ed25519");
  const key = generateEd25519Key();
  writeFileSync(privateKeyPath, key.private, { mode: 0o600 });
  writeFileSync(`${privateKeyPath}.pub`, `${key.public.trim()}\n`);

  return {
    privateKeyPath,
    privateKey: Buffer.from(key.private, "utf8"),
    publicKey: key.public.trim(),
  };
}
