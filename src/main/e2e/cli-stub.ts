/**
 * The `colab` CLI, answered in-process.
 *
 * The app shells out to the CLI for OAuth, session allocation and the on-disk
 * session store — none of which can exist in a container with no Google
 * account. This returns the same shapes the real CLI does, so everything above
 * it runs unchanged: argument building, output parsing, the retry rules, and
 * the session store's own reading of `sessions.json`.
 *
 * An unknown subcommand fails loudly instead of answering nothing, so a new CLI
 * call added later shows up as a broken test rather than a silent pass.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CliOutput } from "../colab/cli-types";
import type { ResolvedCli } from "../colab/cli";
import { configDir } from "../colab/sessions";

const VERSION = "0.9.0-e2e";
/** The account's address lives in the CLI stub, not here: `colab/account.ts` owns it. */
export const MOCK_ACCESS_TOKEN = "e2e-access-token";

/** The runtime address, filled in once the fake server is listening. */
let runtimeUrl = "http://127.0.0.1:0";

interface PresetSession {
  name: string;
  accelerator: string;
  variant: string;
}

/** Two sessions, because a tab-strip test needs something to switch between. */
const PRESET_SESSIONS: PresetSession[] = [
  { name: "e2e-alpha", accelerator: "T4", variant: "DEFAULT" },
  { name: "e2e-beta", accelerator: "NONE", variant: "DEFAULT" },
];

/** The three labelled lines `colab usage` prints, which `parseUsage` reads. */
const USAGE_LINES = [
  "Current balance: 42.50 compute units",
  "Usage rate: 1.25 CU/hr",
  "Active assignments: 1",
];

/** What `resolveCli` hands back: a CLI that reports as found and is never spawned. */
export function mockResolvedCli(): ResolvedCli {
  return {
    exe: "colabdesk-e2e-mock",
    prefix: [],
    env: {},
    label: `colab（E2E 模拟 ${VERSION}）`,
    source: "override",
  };
}

function sessionEntry(preset: PresetSession): Record<string, unknown> {
  return {
    token: `e2e-token-${preset.name}`,
    url: runtimeUrl,
    endpoint: `${preset.name}.e2e.invalid`,
    variant: preset.variant,
    accelerator: preset.accelerator,
    machine_shape: "STANDARD",
    kernel_id: `kernel-${preset.name}`,
    session_id: `session-${preset.name}`,
    token_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    running: "kernel",
    last_execution: [new Date().toISOString(), null, "idle"],
  };
}

/**
 * Writes the two files the CLI owns: the session store the list renders from
 * and the token whose presence is "signed in". The token needs a live expiry,
 * because that is what `colab/account.ts` checks before it will answer.
 */
export function seedMockColabConfig(url: string): void {
  runtimeUrl = url;
  const dir = configDir();
  mkdirSync(dir, { recursive: true });

  // The real file is `Credentials.to_json()`: no account, an access token, and
  // an expiry. Its `account` key is there and empty — which is exactly why the
  // app cannot read the address off disk.
  writeFileSync(
    join(dir, "token.json"),
    JSON.stringify(
      {
        token: MOCK_ACCESS_TOKEN,
        refresh_token: "e2e-refresh",
        expiry: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        account: "",
      },
      null,
      2,
    ),
  );
  writeStore(Object.fromEntries(PRESET_SESSIONS.map((preset) => [preset.name, sessionEntry(preset)])));
}

function writeStore(store: Record<string, unknown>): void {
  writeFileSync(join(configDir(), "sessions.json"), JSON.stringify(store, null, 2));
}

function readStore(): Record<string, Record<string, unknown>> {
  try {
    const text = readFileSync(join(configDir(), "sessions.json"), "utf8");
    return JSON.parse(text) as Record<string, Record<string, unknown>>;
  } catch {
    return {};
  }
}

function ok(stdout: string): CliOutput {
  return { code: 0, stdout: `${stdout}\n`, stderr: "", timedOut: false };
}

function fail(message: string): CliOutput {
  return { code: 1, stdout: "", stderr: `${message}\n`, timedOut: false };
}

/** Reads `-s <name>` the way the CLI's own parser does. */
function sessionFlag(args: string[]): string | null {
  const index = args.indexOf("-s");
  return index >= 0 ? (args[index + 1] ?? null) : null;
}

function createSession(args: string[]): CliOutput {
  const store = readStore();
  const requested = sessionFlag(args);
  const accelerator = args.includes("--tpu") ? "TPU" : args.includes("--gpu") ? "T4" : "NONE";
  const name = requested ?? `e2e-unit-${Object.keys(store).length + 1}`;

  if (store[name]) return fail(`会话 ${name} 已存在。`);
  store[name] = sessionEntry({ name, accelerator, variant: "DEFAULT" });
  writeStore(store);
  return ok(`已创建会话 ${name}。`);
}

function stopSession(args: string[]): CliOutput {
  const name = sessionFlag(args);
  const store = readStore();
  if (!name || !store[name]) return fail(`会话 ${name ?? "(未指定)"} 不存在。`);
  delete store[name];
  writeStore(store);
  return ok(`已停止会话 ${name}。`);
}

/** Answers the CLI invocations the app makes; see the module comment on drift. */
export function mockCliOutput(args: string[]): CliOutput {
  const [command, ...rest] = args;
  switch (command) {
    case "version":
      return ok(`Version: ${VERSION}`);
    case "usage":
      return ok(USAGE_LINES.join("\n"));
    case "sessions":
      // A sync reconciles the list against the server; here the file is the server.
      return ok("已同步。");
    case "new":
      return createSession(rest);
    case "stop":
      return stopSession(rest);
    case "restart-kernel": {
      const name = sessionFlag(rest);
      if (!name || !readStore()[name]) return fail(`会话 ${name ?? "(未指定)"} 不存在。`);
      return ok(`已重启 ${name} 的内核。`);
    }
    default:
      return fail(`colabdesk e2e mock: 未实现的命令 ${command ?? "(空)"}`);
  }
}
