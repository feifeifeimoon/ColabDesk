/**
 * The SSH snippet a person pastes into `~/.ssh/config`.
 *
 * The app does not write that file: it generates text, says where it goes, and
 * lets the person paste it. A generated block that is wrong is then a paste the
 * user can reject, not a broken configuration the app performed on them.
 *
 * Two rules make the text safe to paste:
 *   - every path and argument is quoted, because both Windows homes and macOS
 *     account names can contain spaces, and OpenSSH terminates the whole file
 *     on a `keyword extra arguments` parse error;
 *   - the block names the stable launcher (`ssh-proxy.ts`), never the bundled
 *     interpreter, so it survives the app moving or updating.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import type { SshSnippet } from "@shared/types";

const ALIAS_PREFIX = "colabdesk-";

/** Shortest host label that still reads like the session; safe names keep it. */
const SAFE_LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/;

export function configPath(home: string = homedir()): string {
  return join(home, ".ssh", "config");
}

/** A deterministic host label safe for the `Host` line. */
export function sshHostAlias(name: string): string {
  return `${ALIAS_PREFIX}${hostLabel(name)}`;
}

function hostLabel(name: string): string {
  if (SAFE_LABEL.test(name)) return name;
  const slug =
    name
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "")
      .slice(0, 48) || "session";
  return `${slug}-${hash(name)}`;
}

/** FNV-1a, only to keep two different unsafe names apart in a short label. */
function hash(value: string): string {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193) >>> 0;
  }
  return result.toString(16).padStart(8, "0").slice(0, 6);
}

/**
 * A session name travels inside a quoted ProxyCommand argument. A newline ends
 * the config line, and a quote or backslash changes what OpenSSH parses; the
 * CLI can be handed a user-chosen name, so this is checked before generation.
 */
function assertCarriable(name: string): void {
  if (/[\r\n"\\]/.test(name)) {
    throw new Error(`会话名「${name}」包含引号、反斜杠或换行，无法写入 SSH 配置。`);
  }
}

/** OpenSSH accepts forward slashes on every platform; quoting keeps spaces. */
function quoted(value: string): string {
  return `"${value.replace(/\\/g, "/")}"`;
}

export interface SshSnippetInput {
  session: string;
  launcherPath: string;
  identity: string | null;
  home?: string;
  platform?: NodeJS.Platform;
}

/**
 * Builds the complete block, including the comments that tell a person what it
 * is. `identity` is null when no key this client can use exists: the block is
 * still generated (the dialog can show the shape), but it is not copyable
 * because the CLI proxy would have no key to advertise.
 */
export function buildSshSnippet({
  session,
  launcherPath,
  identity,
  home = homedir(),
  platform = process.platform,
}: SshSnippetInput): SshSnippet {
  assertCarriable(session);

  const alias = sshHostAlias(session);
  const proxy = [
    quoted(launcherPath),
    "ssh",
    "--proxy-mode",
    "-s",
    quoted(session),
  ];
  if (identity) proxy.push("--identity", quoted(identity));

  const lines = [
    `# ColabDesk: ${session}`,
    `Host ${alias}`,
    "    HostName colab-runtime",
    "    User root",
    `    ProxyCommand ${proxy.join(" ")}`,
  ];
  if (identity) lines.push(`    IdentityFile ${quoted(identity)}`);
  lines.push(
    // The runtime's host key is generated per VM. This is the same trade the
    // CLI's own `_ssh_base_args` and the app's ssh2 connection make.
    "    StrictHostKeyChecking no",
    `    UserKnownHostsFile ${platform === "win32" ? "NUL" : "/dev/null"}`,
    "    LogLevel ERROR",
  );

  return {
    session,
    alias,
    command: `ssh ${alias}`,
    block: `${lines.join("\n")}\n`,
    config_path: configPath(home),
    identity,
    launcher_path: launcherPath,
    alias_mapped: alias !== `${ALIAS_PREFIX}${session}`,
  };
}
