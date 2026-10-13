/**
 * Locating and invoking Google's `colab` CLI.
 *
 * The app deliberately shells out instead of reimplementing the Colab backend
 * protocol: the CLI owns OAuth, session allocation and the on-disk session
 * store. This module only knows how to find it and how to run it with a
 * timeout — everything the app itself implements (SSH, SFTP) lives elsewhere.
 *
 * Two shapes are supported:
 *   - a `colab` executable (uv tool / pip install / PATH / dev override)
 *   - the bundled standalone CPython + google-colab-cli shipped with the app,
 *     invoked as `python -m colab_cli.cli` with PYTHONPATH pointing at site/
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { mockCliOutput, mockResolvedCli } from "../e2e/cli-stub";
import { e2eMockEnabled } from "../e2e/mode";
import type { CliOutput } from "./cli-types";
import type { Usage } from "@shared/types";

/** Overrides discovery entirely (a venv, a conda env, a dev checkout). */
export const CLI_PATH_ENV = "COLABDESK_CLI_PATH";

const EXE_NAME = process.platform === "win32" ? "colab.exe" : "colab";

export interface ResolvedCli {
  /** Command to spawn. */
  exe: string;
  /** Arguments that must precede the CLI's own arguments. */
  prefix: string[];
  /** Extra environment for every invocation. */
  env: Record<string, string>;
  /** For display and diagnostics. */
  label: string;
  source: "bundled" | "override" | "path" | "local-bin";
}

function executableExists(path: string): boolean {
  return existsSync(path);
}

/** The bundled CPython + site-packages layout, if this install ships one. */
function bundledCli(bundledDir: string): ResolvedCli | null {
  const python = join(bundledDir, "python", process.platform === "win32" ? "python.exe" : "bin/python3");
  const site = join(bundledDir, "site");
  if (!executableExists(python) || !existsSync(site)) return null;
  return {
    exe: python,
    prefix: ["-m", "colab_cli.cli"],
    env: {
      PYTHONPATH: site,
      PYTHONDONTWRITEBYTECODE: "1",
      PYTHONUNBUFFERED: "1",
    },
    label: `${python} -m colab_cli.cli`,
    source: "bundled",
  };
}

function overrideCli(): ResolvedCli | null {
  const override = process.env[CLI_PATH_ENV];
  if (override && executableExists(override)) {
    return { exe: override, prefix: [], env: {}, label: override, source: "override" };
  }
  return null;
}

function pathCli(): ResolvedCli | null {
  const pathValue = process.env.PATH;
  if (!pathValue) return null;
  for (const dir of pathValue.split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, EXE_NAME);
    if (executableExists(candidate)) {
      return { exe: candidate, prefix: [], env: {}, label: candidate, source: "path" };
    }
  }
  return null;
}

/** `uv tool install` and pip put shims in well-known per-user directories. */
function localBinCli(): ResolvedCli | null {
  const home = homedir();
  const candidates: string[] = [join(home, ".local", "bin", EXE_NAME)];

  if (process.platform === "win32") {
    const appData = process.env.APPDATA;
    const localAppData = process.env.LOCALAPPDATA;
    if (appData) {
      candidates.push(join(appData, "uv", "tools", "google-colab-cli", "Scripts", EXE_NAME));
      candidates.push(join(appData, "Python", "Scripts", EXE_NAME));
    }
    if (localAppData) {
      candidates.push(join(localAppData, "Programs", "Python", "Scripts", EXE_NAME));
      candidates.push(join(localAppData, "Microsoft", "WindowsApps", EXE_NAME));
    }
  } else {
    candidates.push("/opt/homebrew/bin/colab", "/usr/local/bin/colab");
  }

  for (const candidate of candidates) {
    if (executableExists(candidate)) {
      return { exe: candidate, prefix: [], env: {}, label: candidate, source: "local-bin" };
    }
  }
  return null;
}

/**
 * Resolution order:
 * 1. Explicit developer override via COLABDESK_CLI_PATH (always wins for testing)
 * 2. Bundled standalone Python runtime (app ships self-contained)
 * 3. System PATH
 * 4. Standard tool install locations (uv tool, pip, homebrew)
 * E2E replaces the whole question with a stub.
 */
export function resolveCli(bundledDir?: string): ResolvedCli | null {
  if (e2eMockEnabled()) return mockResolvedCli();
  const override = overrideCli();
  if (override) return override;

  if (bundledDir) {
    const bundled = bundledCli(bundledDir);
    if (bundled) return bundled;
  }
  return pathCli() ?? localBinCli();
}

export interface RunOptions {
  timeoutMs: number;
  cwd?: string;
}

/** Spawn the resolved CLI, collect both streams, and never hang forever. */
export function runCli(cli: ResolvedCli, args: string[], options: RunOptions): Promise<CliOutput> {
  // The stub answers below the process boundary on purpose: argument building,
  // output parsing and the retry rules all keep running.
  if (e2eMockEnabled()) return Promise.resolve(mockCliOutput(args));

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(cli.exe, [...cli.prefix, ...args], {
        cwd: options.cwd,
        env: { ...process.env, ...cli.env },
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      reject(new Error(`启动 ${cli.label} 失败: ${(error as Error).message}`));
      return;
    }

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => (stdout += chunk));
    child.stderr?.on("data", (chunk: string) => (stderr += chunk));

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, options.timeoutMs);

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`启动 ${cli.label} 失败: ${error.message}`));
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

/** Both streams, in the order a terminal would show them. */
export function combined(output: CliOutput): string {
  const parts: string[] = [];
  if (output.stdout.trim()) parts.push(output.stdout.trimEnd());
  if (output.stderr.trim()) parts.push(output.stderr.trimEnd());
  return parts.join("\n");
}

/**
 * `colab usage` prints three labelled lines (the CLI's
 * `format_consumption_status`); parsed tolerantly so a format change degrades
 * to the raw-text fallback in the UI instead of a wrong number.
 */
export function parseUsage(text: string): Usage {
  const usage: Usage = { balance: null, rate: null, assignments: null };
  for (const line of text.split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const label = line.slice(0, colon).trim();
    const first = line
      .slice(colon + 1)
      .trim()
      .split(/\s+/)[0];
    if (!first) continue;
    if (label === "Current balance") {
      const value = Number.parseFloat(first);
      if (!Number.isNaN(value)) usage.balance = value;
    } else if (label === "Usage rate") {
      const value = Number.parseFloat(first.replace(/\/hr$/, ""));
      if (!Number.isNaN(value)) usage.rate = value;
    } else if (label === "Active assignments") {
      const value = Number.parseInt(first, 10);
      if (!Number.isNaN(value)) usage.assignments = value;
    }
  }
  return usage;
}

/** The CLI's output is an interactive OAuth prompt, not a result. */
export function needsLogin(text: string): boolean {
  return text.includes("accounts.google.com") || text.includes("To authorize");
}

/** `colab version` prints `Version: 0.7.4`. */
export function parseVersion(text: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("Version:")) {
      const value = trimmed.slice("Version:".length).trim();
      if (value) return value;
    }
  }
  return null;
}

/** One-time probe used by the environment page. */
export function readManifestVersion(bundledDir: string): string | null {
  const manifest = join(bundledDir, "manifest.json");
  if (!existsSync(manifest)) return null;
  try {
    const parsed = JSON.parse(readFileSync(manifest, "utf8")) as { cliVersion?: string };
    return parsed.cliVersion ?? null;
  } catch {
    return null;
  }
}
