/**
 * The app's own log.
 *
 * The CLI keeps one of its own (`~/.config/colab-cli/colab.log`), but it is the
 * CLI's file: an HTTP-level debug stream that says nothing about which action
 * here produced a request, or which command it ran. This one records what this
 * app did — the command, what came back, and whatever the main process caught —
 * so a failure the user can see is a failure we can read afterwards.
 *
 * Text, one record per append: it is read by a person looking at a bug report,
 * and pasted into one. Everything written here must be safe to hand over, which
 * is why the redaction is not optional.
 *
 * Every write is best-effort. A log that can break a feature is worse than no
 * log at all.
 */

import { appendFileSync, mkdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Two megabytes is weeks of use; a user pastes the tail, never the whole file. */
const MAX_BYTES = 2 * 1024 * 1024;
/** One kept rotation: yesterday's file is history, the file before that is litter. */
const ROTATED_SUFFIX = ".1";
/** A pathological traceback must not eat the file it is recorded in. */
const MAX_RECORD_BYTES = 8 * 1024;
const FILE_NAME = "colabdesk.log";

/** What the callers that write here need; the class is one implementation. */
export interface LogSink {
  write(scope: string, message: string): void;
}

/**
 * What must not survive a round trip through a file the user will send us.
 *
 * The login flow's output is the reason this exists: it is one long
 * authorization URL, and the `code` in it is a credential for the account until
 * it is exchanged. The CLI's errors carry labelled tokens often enough to cover
 * those too.
 */
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  // OAuth parameters ride in query strings. Kept: the host and the path, which
  // are what make the line worth reading.
  [/([?&](?:code|state|access_token|refresh_token|id_token|code_verifier)=)[^&\s"']+/gi, "$1<redacted>"],
  // Schemes first: a labelled rule below would otherwise take `Bearer` for the
  // value and leave the token itself standing.
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g, "$1 <redacted>"],
  // Labelled forms: `"token": "…"`, `api_key=…`, `authorization: …` — the last
  // one only when what follows is not the scheme that was just handled.
  [
    /((?:access_|refresh_|id_)?token|secret|password|passwd|api[-_]?key|authorization)(["']?\s*[:=]\s*["']?)(?!(?:Bearer|Basic)\s)[^\s"',}]+/gi,
    "$1$2<redacted>",
  ],
];

export function redactSecrets(text: string): string {
  let redacted = text;
  for (const [pattern, replacement] of SECRET_PATTERNS) redacted = redacted.replace(pattern, replacement);
  return redacted;
}

/** The message of a failure that is expected to happen: no stack, one line. */
export function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

/** Enough of a thrown value to recognise it, for the ones that never should. */
export function describeError(reason: unknown): string {
  if (reason instanceof Error) return reason.stack ?? `${reason.name}: ${reason.message}`;
  if (typeof reason === "string") return reason;
  try {
    return JSON.stringify(reason) ?? String(reason);
  } catch {
    return String(reason);
  }
}

function clamp(text: string): string {
  if (text.length <= MAX_RECORD_BYTES) return text;
  return `${text.slice(0, MAX_RECORD_BYTES)}\n…（输出过长，已截断；完整长度 ${text.length} 字符）`;
}

export class LogFile implements LogSink {
  /** Set by the first failure: the log stops trying rather than failing per write. */
  private disabled = false;

  constructor(
    private readonly directory: string,
    private readonly maxBytes: number = MAX_BYTES,
  ) {}

  path(): string {
    return join(this.directory, FILE_NAME);
  }

  /** Makes the file exist, so "打开日志" has something to show before the first write. */
  ensure(): void {
    if (this.disabled) return;
    try {
      mkdirSync(this.directory, { recursive: true });
      // Append-mode create: never truncates a log that is already there.
      writeFileSync(this.path(), "", { flag: "a" });
    } catch {
      this.disabled = true;
    }
  }

  write(scope: string, message: string): void {
    if (this.disabled) return;
    try {
      mkdirSync(this.directory, { recursive: true });
      this.rotateIfNeeded();
      appendFileSync(this.path(), this.record(scope, message));
    } catch {
      // A full disk or a read-only directory costs the log, never the operation
      // that was being logged.
      this.disabled = true;
    }
  }

  private record(scope: string, message: string): string {
    return `${new Date().toISOString()} [${scope}] ${clamp(redactSecrets(message))}\n`;
  }

  private rotateIfNeeded(): void {
    let size: number;
    try {
      size = statSync(this.path()).size;
    } catch {
      return; // Nothing written yet: the append below creates it.
    }
    if (size < this.maxBytes) return;
    renameSync(this.path(), this.path() + ROTATED_SUFFIX);
  }
}
