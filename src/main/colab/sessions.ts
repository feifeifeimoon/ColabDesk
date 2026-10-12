/**
 * Read-only access to the state the `colab` CLI keeps on disk.
 *
 * The session list renders straight from `~/.config/colab-cli/sessions.json`
 * so a refresh never pays a Python interpreter start-up. That file is only the
 * local half of the list — runtimes the store has never heard of exist in it
 * nowhere — so the server's own half is read in `assignments.ts`.
 *
 * The file's `token` field is a bearer credential for the runtime proxy: it
 * stays inside the main process (the SSH bridge needs it) and is stripped from
 * anything the renderer receives.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Session } from "@shared/types";

/** The raw on-disk entry, including the credential. Main process only. */
export interface RawSession extends Session {
  token: string;
}

export function configDir(): string {
  return join(homedir(), ".config", "colab-cli");
}

export function sessionsFile(): string {
  return join(configDir(), "sessions.json");
}

export function tokenFile(): string {
  return join(configDir(), "token.json");
}

function normalize(name: string, raw: Record<string, unknown>): RawSession {
  const str = (key: string, fallback: string): string => {
    const value = raw[key];
    return typeof value === "string" && value.length > 0 ? value : fallback;
  };
  const opt = (key: string): string | null => {
    const value = raw[key];
    return typeof value === "string" && value.length > 0 ? value : null;
  };
  const lastExecution = raw.last_execution;
  return {
    name,
    // Whatever is in this file is, by definition, what the local store knows.
    untracked: false,
    token: str("token", ""),
    url: str("url", ""),
    endpoint: str("endpoint", ""),
    variant: str("variant", "DEFAULT"),
    accelerator: str("accelerator", "NONE"),
    machine_shape: str("machine_shape", "STANDARD"),
    kernel_id: opt("kernel_id"),
    session_id: opt("session_id"),
    token_expires_at: opt("token_expires_at"),
    running: opt("running"),
    last_execution: Array.isArray(lastExecution) ? (lastExecution as RawSession["last_execution"]) : null,
  };
}

/**
 * Every session the CLI knows about, including tokens. A missing file is an
 * empty store (`colab` has never run); unparseable JSON is an error so the UI
 * can say the list may be stale rather than showing an empty one.
 */
export function loadRawSessions(): { sessions: RawSession[]; error: string | null } {
  const path = sessionsFile();
  if (!existsSync(path)) return { sessions: [], error: null };

  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    return { sessions: [], error: `读取 ${path} 失败: ${(error as Error).message}` };
  }
  if (!text.trim()) return { sessions: [], error: null };

  try {
    const parsed = JSON.parse(text) as Record<string, Record<string, unknown>>;
    const sessions = Object.entries(parsed)
      .map(([name, raw]) => normalize(name, raw ?? {}))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { sessions, error: null };
  } catch (error) {
    return { sessions: [], error: `解析 ${path} 失败: ${(error as Error).message}` };
  }
}

/** The list the renderer is allowed to see: no credentials. */
export function loadSessions(): Session[] {
  return loadRawSessions().sessions.map(({ token: _token, ...rest }) => rest);
}

export function findRawSession(name: string): RawSession | null {
  return loadRawSessions().sessions.find((session) => session.name === name) ?? null;
}

export interface AuthState {
  token_file_exists: boolean;
  expiry: string | null;
  has_refresh_token: boolean;
}

/**
 * The parts of `token.json` worth showing; no raw tokens are read out.
 *
 * The file's own `account` key is deliberately not read: the CLI writes it as an
 * empty string (it comes from `Credentials.to_json()`, which has no such field),
 * so the address has to be fetched from the token — see `account.ts`.
 */
export function authState(): AuthState {
  const path = tokenFile();
  if (!existsSync(path)) {
    return { token_file_exists: false, expiry: null, has_refresh_token: false };
  }
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    const field = (key: string): string | null => {
      const raw = value[key];
      return typeof raw === "string" && raw.length > 0 ? raw : null;
    };
    return {
      token_file_exists: true,
      expiry: field("expiry"),
      has_refresh_token: field("refresh_token") !== null,
    };
  } catch {
    return { token_file_exists: true, expiry: null, has_refresh_token: false };
  }
}

/**
 * The access token the CLI last minted, or null when it is missing or stale.
 *
 * A stale token can still be refreshed, but only by the CLI — this app
 * deliberately does not do that, so callers treat null as "ask again later"
 * and every read that needs it fails soft.
 */
export function accessToken(): string | null {
  if (!authState().token_file_exists) return null;
  try {
    const value = JSON.parse(readFileSync(tokenFile(), "utf8")) as Record<string, unknown>;
    const token = value.token;
    const expiry = value.expiry;
    if (typeof token !== "string" || !token) return null;
    if (typeof expiry === "string" && Date.parse(expiry) <= Date.now()) return null;
    return token;
  } catch {
    return null;
  }
}
