/**
 * `~/.ssh/config` management: the escape hatch that makes a runtime reachable
 * from any terminal, `scp`/`sftp`, or VS Code Remote-SSH.
 *
 * Colab's own `colab ssh --proxy-mode` is one way to build that entry; this app
 * can also act as the ProxyCommand itself (`colabdesk bridge -s NAME`), which
 * is what makes the feature work without a patched CLI. Either way, editing a
 * user's SSH config is the riskiest thing here, so every entry lives inside a
 * marked managed block: writing replaces only that session's block, never
 * touching or reordering anything else in the file.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const BEGIN = "# >>> ColabDesk managed block";
const END = "# <<< ColabDesk managed block";

export interface SshSetup {
  alias: string;
  config_path: string;
  block: string;
  ssh_command: string;
  replaced: boolean;
}

export function alias(name: string): string {
  return `colabdesk-${name}`;
}

export function configPath(): string {
  return join(homedir(), ".ssh", "config");
}

/**
 * The private key the Colab backend will authorize. `colab ssh` sends the
 * matching public key in its `X-Colab-Ssh-Pubkey` header and rejects RSA, so
 * only these two are considered — the same order the CLI uses.
 */
export function identityFile(): string | null {
  const dir = join(homedir(), ".ssh");
  for (const name of ["id_ed25519", "id_ecdsa"]) {
    const candidate = join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** OpenSSH wants forward slashes; both Windows OpenSSH and Git-for-Windows accept `C:/...`. */
function toPosix(path: string): string {
  return path.replace(/\\/g, "/");
}

/** Windows OpenSSH does not understand `/dev/null`; it wants `NUL`. */
function nullDevice(): string {
  return process.platform === "win32" ? "NUL" : "/dev/null";
}

/**
 * Builds the managed block for one session.
 *
 * `proxyCommand` is executed by OpenSSH as a command line, so it arrives fully
 * quoted (paths with spaces are common on Windows).
 */
export function buildBlock(name: string, proxyCommand: string): string {
  const host = alias(name);
  const lines = [
    `${BEGIN}: ${host} >>>`,
    `Host ${host}`,
    "    HostName colab-runtime",
    "    User root",
    `    ProxyCommand ${proxyCommand}`,
    // The runtime's host key is generated per VM, so pinning it would break on
    // every new session.
    "    StrictHostKeyChecking no",
    `    UserKnownHostsFile ${nullDevice()}`,
  ];
  const identity = identityFile();
  if (identity) lines.push(`    IdentityFile ${toPosix(identity)}`);
  lines.push("    LogLevel ERROR", `${END}: ${host} <<<`);
  return `${lines.join("\n")}\n`;
}

/** Removes one managed block, leaving every other line byte-for-byte intact. */
export function stripBlock(existing: string, hostAlias: string): { text: string; found: boolean } {
  const begin = `${BEGIN}: ${hostAlias} >>>`;
  const end = `${END}: ${hostAlias} <<<`;

  const kept: string[] = [];
  let inside = false;
  let found = false;
  for (const line of existing.split(/\r?\n/)) {
    if (line.trim() === begin) {
      inside = true;
      found = true;
      continue;
    }
    if (inside && line.trim() === end) {
      inside = false;
      continue;
    }
    if (!inside) kept.push(line);
  }

  // Drop the blank separator lines that were added before the block, so
  // repeatedly writing and removing does not accumulate whitespace.
  while (kept.length > 0 && kept[kept.length - 1].trim() === "") kept.pop();

  const text = kept.length > 0 ? `${kept.join("\n")}\n` : "";
  return { text, found };
}

export function writeEntry(name: string, proxyCommand: string): SshSetup {
  const path = configPath();
  mkdirSync(dirname(path), { recursive: true });

  let existing = "";
  if (existsSync(path)) existing = readFileSync(path, "utf8");

  const host = alias(name);
  const { text: remaining, found } = stripBlock(existing, host);
  const block = buildBlock(name, proxyCommand);

  const separator = remaining ? "\n" : "";
  writeFileSync(path, `${remaining}${separator}${block}`, "utf8");

  return {
    alias: host,
    config_path: path,
    block,
    ssh_command: `ssh ${host}`,
    replaced: found,
  };
}

export function removeEntry(name: string): SshSetup {
  const path = configPath();
  const host = alias(name);
  let removed = false;

  if (existsSync(path)) {
    const existing = readFileSync(path, "utf8");
    const stripped = stripBlock(existing, host);
    removed = stripped.found;
    if (removed) writeFileSync(path, stripped.text, "utf8");
  }

  return {
    alias: host,
    config_path: path,
    block: "",
    ssh_command: `ssh ${host}`,
    replaced: removed,
  };
}
