/**
 * SSH identity: the private key used to authenticate, and the public key sent
 * in the `X-Colab-Ssh-Pubkey` header (they must match).
 *
 * The Python CLI derives the public key with `ssh-keygen -y -f`. That would
 * make the app depend on an external binary again, so instead the public key
 * is derived in-process from the private key when no `.pub` file exists.
 */

import { existsSync, readFileSync } from "node:fs";
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

export function findIdentity(): Identity | null {
  const sshDir = join(homedir(), ".ssh");
  for (const name of CANDIDATES) {
    const privateKeyPath = join(sshDir, name);
    if (!existsSync(privateKeyPath)) continue;

    const privateKey = readFileSync(privateKeyPath);
    const pubPath = `${privateKeyPath}.pub`;
    const publicKey = existsSync(pubPath)
      ? readFileSync(pubPath, "utf8").trim()
      : publicKeyFromPrivate(privateKey);

    return { privateKeyPath, privateKey, publicKey };
  }
  return null;
}
