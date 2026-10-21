/**
 * The command surface: a thin, inspectable wrapper over the `colab` CLI.
 *
 * Ported from the Tauri build's Rust command layer. Every invocation goes to the
 * log with its raw output (`run`), so a format change can be read back rather
 * than guessed at from a wrong number.
 */

import { existsSync } from "node:fs";
import { fetchUsage } from "./usage";
import type { RuntimeList } from "@shared/api";
import { createSessionArgs } from "@shared/create-session";
import type { ColabEnvironment, CommandReport, EnvStatus, Session, SshSetup, UsageReport } from "@shared/types";
import type { LogSink } from "../log-file";
import { accountStatus } from "./account";
import { fetchAssignments, type Assignment } from "./assignments";
import { combined, parseVersion, readManifestVersion, resolveCli, runCli, runCliStreaming, type ResolvedCli } from "./cli";
import { isTransientNetworkFailure } from "./network-retry";
import { authState, configDir, findRawSession, loadRawSessions, loadSessions, sessionsFile } from "./sessions";
import { removeEntry, writeEntry } from "./ssh-config";
import type { SshTarget } from "../ssh/connection";
import { findIdentity } from "../ssh/identity";

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

/**
 * A live runtime with no local record, in the shape a row expects. Nothing on
 * it is knowable beyond what the server said: no kernel, no last execution, and
 * no credential — the proxy token from the same response is not read, because
 * nothing here may act on a runtime it has no record of.
 */
function untrackedSession(assignment: Assignment): Session {
  return {
    name: assignment.endpoint,
    untracked: true,
    url: assignment.url,
    endpoint: assignment.endpoint,
    variant: assignment.variant,
    accelerator: assignment.accelerator,
    machine_shape: assignment.machine_shape,
    kernel_id: null,
    session_id: null,
    running: null,
    last_execution: null,
  };
}

export class Service {
  constructor(
    private readonly bundledDir?: string,
    private readonly log?: LogSink,
  ) {}

  /**
   * The CLI's version, asked at most once per process.
   *
   * The bundled runtime carries it in `manifest.json`, so the common case is a
   * file read. Otherwise it costs an interpreter start — 3.4s measured, offline
   * — and a running process cannot change the CLI it resolved, so the first
   * answer is the answer.
   */
  private cliVersionCache: { known: boolean; value: string | null } = { known: false, value: null };

  private async cliVersion(cli: ResolvedCli | null): Promise<string | null> {
    if (!cli) return null;
    if (cli.source === "bundled" && this.bundledDir) {
      const fromManifest = readManifestVersion(this.bundledDir);
      if (fromManifest) return fromManifest;
    }
    if (this.cliVersionCache.known) return this.cliVersionCache.value;
    try {
      const output = await runCli(cli, ["version"], { timeoutMs: QUICK_TIMEOUT_MS });
      this.cliVersionCache = { known: true, value: parseVersion(combined(output)) };
    } catch {
      this.cliVersionCache = { known: true, value: null };
    }
    return this.cliVersionCache.value;
  }

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
    const started = Date.now();
    const output = await runCli(cli, args, { timeoutMs });
    const text = combined(output);
    const outcome = output.timedOut ? `超时（${timeoutMs}ms）` : `exit ${output.code}`;
    // Every invocation, not only the failures: the questions a log has to answer
    // are "what did the app do" and "what came back", and the second one is only
    // worth reading next to the first.
    this.log?.write("cli", `colab ${args.join(" ")} → ${outcome} · ${Date.now() - started}ms\n${text}`.trimEnd());
    return {
      ok: !output.timedOut && output.code === 0,
      code: output.code,
      timed_out: output.timedOut,
      output: text,
      error: null,
      attempts: 1,
    };
  }

  /**
   * The same call as `run`, reporting each line while it is still running.
   * Only for commands whose progress a person is watching; the collected
   * report is identical either way.
   */
  private async runStreaming(
    args: string[],
    timeoutMs: number,
    onLine: (line: string) => void,
  ): Promise<CommandReport> {
    const cli = this.cli();
    const started = Date.now();
    const output = await runCliStreaming(cli, args, { timeoutMs }, onLine);
    const text = combined(output);
    const outcome = output.timedOut ? `超时（${timeoutMs}ms）` : `exit ${output.code}`;
    this.log?.write("cli", `colab ${args.join(" ")} → ${outcome} · ${Date.now() - started}ms\n${text}`.trimEnd());
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

  async envStatus(): Promise<ColabEnvironment> {
    // Asked every refresh: whoever is signed in right now is the answer, and a
    // re-login with a different account has to replace it rather than blend in.
    const account_ = await accountStatus(this.log).catch(() => ({ account: null, eligibility: null }));

    const cli = resolveCli(this.bundledDir);
    const cliVersion = await this.cliVersion(cli);

    const auth = authState();
    const dir = configDir();

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
      ssh_identity: findIdentity()?.privateKeyPath ?? null,
    };
  }

  listSessions(): { sessions: Session[]; error: string | null } {
    const { error } = loadRawSessions();
    return { sessions: loadSessions(), error };
  }

  /**
   * Runtimes the server has that the local store has never heard of — the `[?]`
   * rows of `colab sessions` — together with every runtime it does have, which
   * is the one read of the server that says whether a session's record still
   * points at something.
   *
   * The unknowns cannot be folded into the store: the CLI's own sync only ever
   * prunes, and with an empty store it writes nothing at all, so an assignment
   * created outside the CLI stays invisible to every `colab` command. Without
   * this read it is invisible here too — which is a runtime spending compute
   * units behind an empty session list.
   */
  async listUntracked(): Promise<RuntimeList> {
    const assignments = await fetchAssignments(this.log);
    if (!assignments) {
      return {
        sessions: [],
        // Not an empty list: the caller must be able to tell "nothing is
        // allocated" from "nobody answered", and only one of them is news.
        live_endpoints: null,
        error: "无法读取服务器上的运行时列表（令牌过期或网络不通）。请使用上方「同步」重试。",
      };
    }

    const known = new Set(loadRawSessions().sessions.map((session) => session.endpoint));
    const sessions = assignments
      .filter((assignment) => !known.has(assignment.endpoint))
      .map(untrackedSession)
      .sort((a, b) => a.name.localeCompare(b.name));
    return { sessions, live_endpoints: assignments.map((assignment) => assignment.endpoint), error: null };
  }

  async usage(): Promise<UsageReport> {
    return fetchUsage(this.log);
  }

  async createSession(
    options: {
      gpu: string | null;
      tpu: string | null;
      name: string | null;
      highMem: boolean;
    },
    onLine?: (line: string) => void,
  ): Promise<CommandReport> {
    const args = createSessionArgs(options);
    // Allocation is the one command somebody watches: it prints its progress,
    // and the surface that asked for it shows those lines as they arrive.
    return onLine ? this.runStreaming(args, NEW_TIMEOUT_MS, onLine) : this.run(args, NEW_TIMEOUT_MS);
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
   * The command OpenSSH should run for a session. Uses the resolved CLI's
   * `ssh --proxy-mode -s <name>`.
   */
  proxyCommand(name: string): string {
    const cli = resolveCli(this.bundledDir);
    if (cli) {
      return `"${cli.exe}" ${[...cli.prefix, "ssh", "--proxy-mode", "-s", name].join(" ")}`;
    }
    throw new Error("没有可用的 SSH 代理命令：未找到 colab 命令。");
  }

  sshSetup(name: string): SshSetup {
    return writeEntry(name, this.proxyCommand(name));
  }

  sshRemove(name: string): SshSetup {
    return removeEntry(name);
  }
}
