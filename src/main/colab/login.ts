/**
 * Guided Google login.
 *
 * The CLI's OAuth flow prints an authorization URL on stderr, blocks on stdin
 * for the code, and is the worst part of the terminal experience. The GUI runs
 * the exact same flow — `colab usage` is the cheapest command that triggers it
 * — but surfaces the URL as a button and pipes the pasted code back in, so the
 * token lands in the CLI's own store and every other feature keeps working.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import type { ResolvedCli } from "./cli";
import { backupToken, removeTokenBackup, restoreTokenBackup } from "./sessions";

export interface LoginEvents {
  onUrl(url: string): void;
  onDone(code: number | null, output: string): void;
}

const LOGIN_TIMEOUT_MS = 300_000;

/** The CLI prints the URL on its own, indented line. */
export function extractUrl(line: string): string | null {
  const trimmed = line.trim();
  return trimmed.startsWith("https://accounts.google.com") ? trimmed : null;
}

export class LoginFlow {
  private child: ChildProcessWithoutNullStreams | null = null;
  private output: string[] = [];
  private timer: NodeJS.Timeout | null = null;
  private backedUp = false;

  constructor(
    private readonly cli: ResolvedCli,
    private readonly events: LoginEvents,
    private readonly timeoutMs: number = LOGIN_TIMEOUT_MS,
  ) {}

  get running(): boolean {
    return this.child !== null && this.child.exitCode === null;
  }

  start(): void {
    this.cancel();
    this.output = [];

    // If an existing token file exists, back it up so `colab usage` is forced to
    // initiate a fresh OAuth handshake instead of silently returning usage.
    this.backedUp = backupToken();

    const child = spawn(this.cli.exe, [...this.cli.prefix, "usage"], {
      env: { ...process.env, ...this.cli.env },
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;

    this.timer = setTimeout(() => {
      this.output.push("登录超时（5 分钟未完成），已取消。");
      this.cancel();
    }, this.timeoutMs);

    const collect = (line: string): void => {
      this.output.push(line.trimEnd());
      const url = extractUrl(line);
      if (url) this.events.onUrl(url);
    };

    createInterface({ input: child.stderr }).on("line", collect);
    createInterface({ input: child.stdout }).on("line", collect);

    child.on("error", (error) => {
      this.output.push(`启动登录进程失败: ${error.message}`);
    });
    child.on("close", (code) => {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      this.child = null;
      if (code === 0) {
        removeTokenBackup();
      } else if (this.backedUp) {
        // Failed or aborted: restore previous session so user is not stuck logged out
        restoreTokenBackup();
      }
      this.events.onDone(code, this.output.join("\n"));
    });
  }

  submit(code: string): void {
    const clean = code.trim().replace(/[\r\n]+/g, "");
    if (!clean) throw new Error("授权码为空。");
    if (!this.child?.stdin.writable) throw new Error("登录流程未在运行。");
    this.child.stdin.write(`${clean}\n`);
  }

  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.child) {
      this.child.kill();
      this.child = null;
      if (this.backedUp) {
        restoreTokenBackup();
        this.backedUp = false;
      }
    }
  }
}
