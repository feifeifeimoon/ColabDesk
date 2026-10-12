/**
 * The command surface: a thin, inspectable wrapper over the `colab` CLI.
 *
 * Ported from the Tauri build's Rust command layer. Every parsed answer travels
 * with the CLI's raw output so a format change shows up as a visible fallback
 * rather than a silent wrong number.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CommandReport, EnvStatus, Session, SshSetup, UsageReport } from "@shared/types";
import { accountStatus } from "./account";
import { combined, needsLogin, parseUsage, parseVersion, readManifestVersion, resolveCli, runCli, type ResolvedCli } from "./cli";
import { isTransientNetworkFailure } from "./network-retry";
import { authState, configDir, findRawSession, loadRawSessions, loadSessions, sessionsFile } from "./sessions";
import { alias, removeEntry, writeEntry } from "./ssh-config";
import type { SshTarget } from "../ssh/connection";

/** Allocating a runtime can legitimately take minutes on a busy accelerator. */
const NEW_TIMEOUT_MS = 300_000;
/** Everything else is a single request; this only stops a wedged child forever. */
const QUICK_TIMEOUT_MS = 90_000;
/** Read-only calls hit intermittent TLS resets; one retry rescues a blip. */
const READ_ATTEMPTS = 2;
const RETRY_DELAY_MS = 600;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// The retry rule moved to `network-retry` so the direct API reads can share it;
// it stays exported here because this is where callers learned to ask.
export { isTransientNetworkFailure };

export class Service {
  constructor(private readonly bundledDir?: string) {}

  private cli(): ResolvedCli {
    const cli = resolveCli(this.bundledDir);
    if (!cli) {
      throw new Error(
        "找不到 colab 命令。应用应自带运行时；开发环境下请安装 google-colab-cli（uv tool install），"
          + "或用环境变量 COLABDESK_CLI_PATH 指向可执行文件。",
      );
    }
    return cli;
  }

  cliPath(): string | null {
    return resolveCli(this.bundledDir)?.label ?? null;
  }

  cliSource(): EnvStatus["cli_source"] {
    return resolveCli(this.bundledDir)?.source ?? null;
  }

  async run(args: string[], timeoutMs: number): Promise<CommandReport> {
    const cli = this.cli();
    const output = await runCli(cli, args, { timeoutMs });
    const text = combined(output);
    return {
      ok: !output.timedOut && output.code === 0,
      code: output.code,
      timed_out: output.timedOut,
      output: text,
      error: null,
      attempts: 1,
    };
  }

  /** Read-only commands retry once; commands with side effects never do. */
  private async runRetrying(args: string[], timeoutMs: number): Promise<CommandReport> {
    let report = await this.run(args, timeoutMs);
    let attempts = 1;
    while (attempts < READ_ATTEMPTS && !report.ok && isTransientNetworkFailure(report.output)) {
      await delay(RETRY_DELAY_MS);
      report = await this.run(args, timeoutMs);
      attempts += 1;
    }
    report.attempts = attempts;
    return report;
  }

  async envStatus(): Promise<EnvStatus> {
    // Asked every refresh: whoever is signed in right now is the answer, and a
    // re-login with a different account has to replace it rather than blend in.
    const account_ = await accountStatus().catch(() => ({ account: null, eligibility: null }));

    const cli = resolveCli(this.bundledDir);
    let cliVersion: string | null = null;
    if (cli) {
      try {
        const output = await runCli(cli, ["version"], { timeoutMs: QUICK_TIMEOUT_MS });
        cliVersion = parseVersion(combined(output));
        if (!cliVersion && this.bundledDir) cliVersion = readManifestVersion(this.bundledDir);
      } catch {
        if (this.bundledDir) cliVersion = readManifestVersion(this.bundledDir);
      }
    }

    const auth = authState();
    const dir = configDir();

    let hint: string | null = null;
    if (!cli) {
      hint = "未找到 colab 命令，应用内的大部分功能不可用。";
    } else if (!auth.token_file_exists) {
      hint = "尚未授权。点击「授权登录」完成 Google 账号登录。";
    }

    return {
      cli_path: cli?.label ?? null,
      cli_source: cli?.source ?? null,
      cli_version: cliVersion,
      config_dir: dir,
      sessions_file_exists: existsSync(sessionsFile()),
      authenticated: auth.token_file_exists,
      account: account_.account,
      accelerator_eligibility: account_.eligibility,
      token_expiry: auth.expiry,
      has_refresh_token: auth.has_refresh_token,
      hint,
    };
  }

  listSessions(): { sessions: Session[]; error: string | null } {
    const { error } = loadRawSessions();
    return { sessions: loadSessions(), error };
  }

  async usage(): Promise<UsageReport> {
    try {
      const report = await this.runRetrying(["usage"], QUICK_TIMEOUT_MS);
      return {
        ok: report.ok,
        needs_login: needsLogin(report.output),
        usage: parseUsage(report.output),
        raw: report.output,
        error: report.error,
        attempts: report.attempts,
      };
    } catch (error) {
      return {
        ok: false,
        needs_login: false,
        usage: { balance: null, rate: null, assignments: null },
        raw: "",
        error: (error as Error).message,
        attempts: 1,
      };
    }
  }

  async createSession(options: {
    gpu: string | null;
    tpu: string | null;
    name: string | null;
    highMem: boolean;
  }): Promise<CommandReport> {
    const args = ["new"];
    const name = options.name?.trim();
    if (name) args.push("-s", name);
    // `--gpu` and `--tpu` are mutually exclusive; a GPU wins because that is
    // what the picker defaults to.
    if (options.gpu) args.push("--gpu", options.gpu);
    else if (options.tpu) args.push("--tpu", options.tpu);
    if (options.highMem) args.push("--high-mem");
    return this.run(args, NEW_TIMEOUT_MS);
  }

  stopSession(name: string): Promise<CommandReport> {
    return this.run(["stop", "-s", name], QUICK_TIMEOUT_MS);
  }

  restartKernel(name: string): Promise<CommandReport> {
    return this.run(["restart-kernel", "-s", name], QUICK_TIMEOUT_MS);
  }

  /** Reconciles local state against the server's assignments (a network call). */
  syncSessions(): Promise<CommandReport> {
    return this.runRetrying(["sessions"], QUICK_TIMEOUT_MS);
  }

  /** The SSH target for the bridge: url + the runtime proxy token. */
  sshTarget(name: string): SshTarget {
    const session = findRawSession(name);
    if (!session) throw new Error(`会话 ${name} 不在本地记录中，请先同步或创建会话。`);
    if (!session.token) throw new Error(`会话 ${name} 的运行时令牌缺失，请重新创建会话。`);
    return { name, url: session.url, token: session.token };
  }

  /**
   * The command OpenSSH should run for a session. Prefers the app's own bridge
   * (a bundled Python script — the same runtime we already ship) because the
   * CLI's `--proxy-mode` is still broken on Windows upstream; falls back to the
   * CLI itself so the entry is useful even without a bundled runtime.
   */
  proxyCommand(name: string): string {
    const bridge = this.bundledDir ? join(this.bundledDir, "bridge", "colab_bridge.py") : null;
    const python = this.bundledDir
      ? join(this.bundledDir, "python", process.platform === "win32" ? "python.exe" : "bin/python3")
      : null;
    if (bridge && python && existsSync(bridge) && existsSync(python)) {
      return `"${python}" "${bridge}" -s ${name}`;
    }
    const cli = resolveCli(this.bundledDir);
    if (cli) {
      return `"${cli.exe}" ${[...cli.prefix, "ssh", "--proxy-mode", "-s", name].join(" ")}`;
    }
    throw new Error("没有可用的 SSH 代理命令：既无捆绑运行时，也未找到 colab 命令。");
  }

  sshSetup(name: string): SshSetup {
    return writeEntry(name, this.proxyCommand(name));
  }

  sshRemove(name: string): SshSetup {
    return removeEntry(name);
  }
}

/**
 * Opens a real terminal window already connected to the runtime, outside the
 * app — for people who want tmux/vim in their own terminal emulator.
 */
export function openExternalTerminal(name: string): Promise<string> {
  const host = alias(name);
  const command = `ssh ${host}`;

  return new Promise((resolve, reject) => {
    const fail = (message: string): void => reject(new Error(message));

    if (process.platform === "win32") {
      const child = spawn("cmd", ["/c", "start", "ColabDesk SSH", "ssh", host], { windowsHide: true });
      child.on("error", (error) => fail(`打开终端失败: ${error.message}`));
      child.on("close", () => resolve(command));
      return;
    }

    if (process.platform === "darwin") {
      const script = `tell application "Terminal" to do script "${command}"`;
      const child = spawn("osascript", ["-e", script]);
      child.on("error", (error) => fail(`打开终端失败: ${error.message}`));
      child.on("close", (code) =>
        code === 0 ? resolve(command) : fail(`打开 Terminal 失败（osascript 退出码 ${code}）。`),
      );
      return;
    }

    for (const [exe, args] of [
      ["x-terminal-emulator", ["-e", "ssh", host]],
      ["gnome-terminal", ["--", "ssh", host]],
      ["xterm", ["-e", "ssh", host]],
    ] as const) {
      const child = spawn(exe, [...args], { detached: true, stdio: "ignore" });
      child.on("error", () => {});
      child.unref();
      resolve(command);
      return;
    }
    fail(`未找到可用的终端程序，请手动运行：${command}`);
  });
}
