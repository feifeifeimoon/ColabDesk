/**
 * SSH identity: the private key used to authenticate, and the public key sent
 * in the `X-Colab-Ssh-Pubkey` header (they must match).
 *
 * The Python CLI derives the public key with `ssh-keygen -y -f`. That would
 * make the app depend on an external binary again, so instead the public key
 * is derived in-process from the private key. A `.pub` beside it is not
 * trusted: it can be stale or belong to a different key, and Colab
 * authenticates with the pair.
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

/**
 * The first supported identity that can actually be used, or null.
 *
 * Parsing the private key is the check that matters: a passphrase-protected
 * key (or a format this client cannot read) passes an existence test and then
 * fails only after a runtime has been allocated. This client has no passphrase
 * prompt, so such a key is "not usable" here.
 */
export function findIdentity(home: string = homedir()): Identity | null {
  const sshDir = join(home, ".ssh");
  for (const name of CANDIDATES) {
    const privateKeyPath = join(sshDir, name);
    if (!existsSync(privateKeyPath)) continue;

    try {
      const privateKey = readFileSync(privateKeyPath);
      const publicKey = publicKeyFromPrivate(privateKey);
      // The file name is not the algorithm: Colab's gateway only accepts these
      // two, so a key of another type in a supported-looking file is unusable.
      if (!publicKey.startsWith("ssh-ed25519 ") && !publicKey.startsWith("ecdsa-sha2-")) continue;
      return { privateKeyPath, privateKey, publicKey };
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Ensures a Colab-compatible identity exists, generating `~/.ssh/id_ed25519`
 * only when neither supported key is usable. An existing `id_ed25519` that
 * cannot be parsed is left untouched and reported: overwriting a private key is
 * never this function's decision to make.
 */
export function ensureIdentity(home: string = homedir()): Identity {
  const existing = findIdentity(home);
  if (existing) return existing;

  const sshDir = join(home, ".ssh");
  mkdirSync(sshDir, { recursive: true });

  const privateKeyPath = join(sshDir, "id_ed25519");
  const key = generateEd25519Key();
  try {
    // `wx` refuses to replace a file that appeared after the check above.
    writeFileSync(privateKeyPath, key.private, { mode: 0o600, flag: "wx" });
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(
        `${privateKeyPath} 已存在但无法使用（可能带 passphrase 或格式不受支持）。本应用不会覆盖现有私钥；请先备份并移走它，或用 ssh-keygen 重新生成。`,
      );
    }
    throw cause;
  }
  writeFileSync(`${privateKeyPath}.pub`, `${key.public.trim()}\n`);

  return {
    privateKeyPath,
    privateKey: Buffer.from(key.private, "utf8"),
    publicKey: key.public.trim(),
  };
}
