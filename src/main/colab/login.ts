/**
 * Guided Google login.
 *
 * The CLI's OAuth flow prints an authorization URL on stderr, blocks on stdin
 * for the code, and is the worst part of the terminal experience. The GUI runs
 * the exact same flow — `colab usage` is the cheapest command that triggers it
 * — but surfaces the URL as a button and pipes the pasted code back in, so the
 * token lands in the CLI's own store and every other feature keeps working.
 *
 * A stored credential is removed first, because that is what makes `colab usage`
 * ask for a sign-in instead of answering with the current account's numbers.
 * It is kept in memory and put back if the flow fails or is cancelled.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import type { LogSink } from "../log-file";
import type { ResolvedCli } from "./cli";
import {
  deleteCredential,
  invalidateCredentialCache,
  readCredential,
  writeCredential,
  type StoredCredential,
} from "./credential-store";
import { tokenFile } from "./sessions";

export interface LoginEvents {
  onUrl(url: string): void;
  /** The exit code, and nothing else: the output went to the log as it arrived. */
  onDone(code: number | null): void;
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
  private previous: StoredCredential | null = null;

  constructor(
    private readonly cli: ResolvedCli,
    private readonly events: LoginEvents,
    private readonly log?: LogSink,
    private readonly timeoutMs: number = LOGIN_TIMEOUT_MS,
  ) {}

  get running(): boolean {
    return this.child !== null && this.child.exitCode === null;
  }

  async start(): Promise<void> {
    await this.cancel();
    this.output = [];
    this.log?.write("login", `登录开始：${this.cli.label} usage（触发 OAuth 授权）`);

    // Without a stored credential, `colab usage` runs the OAuth flow instead of
    // silently answering with the account already signed in. The read is fresh:
    // a sign-in from a terminal a moment ago must be what gets backed up.
    invalidateCredentialCache();
    this.previous = await readCredential(tokenFile());
    if (this.previous) await deleteCredential(tokenFile());

    const child = spawn(this.cli.exe, [...this.cli.prefix, "usage"], {
      env: { ...process.env, ...this.cli.env },
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;

    this.timer = setTimeout(() => {
      this.output.push("登录超时（5 分钟未完成），已取消。");
      void this.cancel();
    }, this.timeoutMs);

    const collect = (line: string): void => {
      this.output.push(line.trimEnd());
      const url = extractUrl(line);
      if (url) {
        // The writer strips the code and the state out of it; the host and the
        // parameters that identify the request are what make this line useful.
        this.log?.write("login", `授权链接：${url}`);
        this.events.onUrl(url);
      }
    };

    createInterface({ input: child.stderr }).on("line", collect);
    createInterface({ input: child.stdout }).on("line", collect);

    child.on("error", (error) => {
      this.output.push(`启动登录进程失败: ${error.message}`);
      this.log?.write("login", `启动登录进程失败：${error.message}`);
    });
    child.on("close", (code) => {
      void (async () => {
        if (this.timer) {
          clearTimeout(this.timer);
          this.timer = null;
        }
        this.child = null;
        if (code === 0) {
          // The CLI wrote the new credential itself; the cache still holds the
          // one removed before the flow started.
          invalidateCredentialCache();
          this.previous = null;
        } else {
          // Failed or aborted: put the previous session back so the user is not
          // stuck logged out.
          await this.restorePrevious();
        }
        this.log?.write("login", `登录结束：exit ${code ?? "(无退出码)"}\n${this.output.join("\n")}`);
        this.events.onDone(code);
      })();
    });
  }

  submit(code: string): void {
    const clean = code.trim().replace(/[\r\n]+/g, "");
    if (!clean) throw new Error("授权码为空。");
    if (!this.child?.stdin.writable) throw new Error("登录流程未在运行。");
    // The length, never the code: it is a credential until the CLI exchanges it.
    this.log?.write("login", `已提交授权码（${clean.length} 字符）`);
    this.child.stdin.write(`${clean}\n`);
  }

  async cancel(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.child) {
      this.log?.write("login", "登录取消（用户操作或超时）");
      this.child.kill();
      this.child = null;
    }
    // Also covers the timeout's own call, and a start() that never spawned.
    await this.restorePrevious();
  }

  private async restorePrevious(): Promise<void> {
    const previous = this.previous;
    this.previous = null;
    if (previous) await writeCredential(tokenFile(), previous.json);
  }
}
