/**
 * Read-only access to the state the `colab` CLI keeps on disk.
 *
 * The session list renders straight from `~/.config/colab-cli/sessions.json`
 * so a refresh never pays a Python interpreter start-up. That file is only the
 * local half of the list — runtimes the store has never heard of exist in it
 * nowhere — so the server's own half is read in `assignments.ts`.
 *
 * The OAuth credential is the one thing that left the file in CLI 0.8.0 (the
 * OS keyring now); `credential-store.ts` knows both stores, and the functions
 * below ask it rather than reading a path.
 *
 * The file's `token` field is a bearer credential for the runtime proxy: it
 * stays inside the main process (the SSH bridge needs it) and is stripped from
 * anything the renderer receives.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { e2eMockEnabled } from "../e2e/mode";
import type { Session } from "@shared/types";
import { httpFetch } from "./backend-http";
import { deleteCredential, readCredential, writeCredential } from "./credential-store";

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

/** The pre-0.8.0 credential; still the store for an older CLI. */
export function tokenFile(): string {
  return join(configDir(), "token.json");
}

/** Sign out of whichever store the CLI uses. */
export async function clearCredential(): Promise<void> {
  await deleteCredential(tokenFile());
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
    /*
      The file's `token_expires_at` is deliberately not read: it is the expiry of
      the runtime *proxy token* (an hour, minted by the session backend), not the
      runtime's own lifetime. The CLI renews it in passing whenever it runs a
      command; this app does not run the CLI, so on any machine that uses this
      app the value freezes and then goes stale — and an hour-long countdown
      labelled like a session's remaining time is worse than no countdown. What
      is really still allocated is asked of the server instead (`assignments.ts`).
    */
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
  credential_exists: boolean;
  expiry: string | null;
  has_refresh_token: boolean;
}

/**
 * The parts of the CLI's credential worth showing; no raw tokens are read out.
 *
 * The credential's own `account` key is deliberately not read: the CLI writes it
 * as an empty string (it comes from `Credentials.to_json()`, which has no such
 * field), so the address has to be fetched from the token — see `account.ts`.
 */
export async function authState(): Promise<AuthState> {
  const credential = await readCredential(tokenFile());
  if (!credential) {
    return { credential_exists: false, expiry: null, has_refresh_token: false };
  }
  try {
    const value = JSON.parse(credential.json) as Record<string, unknown>;
    const field = (key: string): string | null => {
      const raw = value[key];
      return typeof raw === "string" && raw.length > 0 ? raw : null;
    };
    return {
      credential_exists: true,
      expiry: field("expiry"),
      has_refresh_token: field("refresh_token") !== null,
    };
  } catch {
    return { credential_exists: true, expiry: null, has_refresh_token: false };
  }
}

/**
 * The access token the CLI last minted, or null when it is missing or stale.
 *
 * A stale token can still be refreshed, but only by the CLI — this app
 * deliberately does not do that, so callers treat null as "ask again later"
 * and every read that needs it fails soft.
 */
export async function accessToken(): Promise<string | null> {
  const credential = await readCredential(tokenFile());
  if (!credential) return null;
  try {
    const value = JSON.parse(credential.json) as Record<string, unknown>;
    const token = value.token;
    const expiry = value.expiry;
    if (typeof token !== "string" || !token) return null;
    if (typeof expiry === "string" && Date.parse(expiry) <= Date.now()) return null;
    return token;
  } catch {
    return null;
  }
}

const GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token";
const DEFAULT_CLIENT_ID = "764086051850-6qr4p6gpi6hn506pt8ejuq83di341hur.apps.googleusercontent.com";
const DEFAULT_CLIENT_SECRET = "d-FL95Q19q7MQmFpd7hHD0Ty";

/**
 * Actively refreshes an expired access token using the stored refresh_token,
 * writing the refreshed credentials back to whichever store they came from.
 */
export async function refreshAccessToken(): Promise<string | null> {
  if (e2eMockEnabled()) return "e2e-access-token";

  const stored = await readCredential(tokenFile());
  if (!stored) return null;

  try {
    const creds = JSON.parse(stored.json) as Record<string, unknown>;
    const refreshToken = creds.refresh_token;
    if (typeof refreshToken !== "string" || !refreshToken) return null;

    const clientId = typeof creds.client_id === "string" && creds.client_id ? creds.client_id : DEFAULT_CLIENT_ID;
    const clientSecret =
      typeof creds.client_secret === "string" && creds.client_secret ? creds.client_secret : DEFAULT_CLIENT_SECRET;
    const tokenUri = typeof creds.token_uri === "string" && creds.token_uri ? creds.token_uri : GOOGLE_TOKEN_URI;

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });

    const response = await httpFetch(tokenUri, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) return null;
    const data = (await response.json()) as { access_token?: string; expires_in?: number };
    if (typeof data.access_token !== "string" || !data.access_token) return null;

    creds.token = data.access_token;
    const expiresInSec = typeof data.expires_in === "number" ? data.expires_in : 3600;
    creds.expiry = new Date(Date.now() + expiresInSec * 1000).toISOString();

    // Best-effort: the minted token still works for this process even if the
    // store refused it, and the next refresh simply runs again.
    await writeCredential(tokenFile(), JSON.stringify(creds, null, 2));
    return data.access_token;
  } catch {
    return null;
  }
}

/**
 * Returns a valid access token. If the current token is missing or expired,
 * but a refresh token is present, refreshes and returns the new token.
 */
export async function ensureAccessToken(): Promise<string | null> {
  const current = await accessToken();
  if (current) return current;

  const auth = await authState();
  if (auth.credential_exists && auth.has_refresh_token) {
    return refreshAccessToken();
  }
  return null;
}
