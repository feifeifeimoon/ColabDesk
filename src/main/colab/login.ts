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

export interface LoginEvents {
  onUrl(url: string): void;
  onDone(code: number | null, output: string): void;
}

/** The CLI prints the URL on its own, indented line. */
export function extractUrl(line: string): string | null {
  const trimmed = line.trim();
  return trimmed.startsWith("https://accounts.google.com") ? trimmed : null;
}

export class LoginFlow {
  private child: ChildProcessWithoutNullStreams | null = null;
  private output: string[] = [];

  constructor(
    private readonly cli: ResolvedCli,
    private readonly events: LoginEvents,
  ) {}

  get running(): boolean {
    return this.child !== null && this.child.exitCode === null;
  }

  start(): void {
    this.cancel();
    this.output = [];

    const child = spawn(this.cli.exe, [...this.cli.prefix, "usage"], {
      env: { ...process.env, ...this.cli.env },
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;

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
      this.child = null;
      this.events.onDone(code, this.output.join("\n"));
    });
  }

  submit(code: string): void {
    const trimmed = code.trim();
    if (!trimmed) throw new Error("授权码为空。");
    if (!this.child?.stdin.writable) throw new Error("登录流程未在运行。");
    this.child.stdin.write(`${trimmed}\n`);
  }

  cancel(): void {
    if (this.child) {
      this.child.kill();
      this.child = null;
    }
  }
}
