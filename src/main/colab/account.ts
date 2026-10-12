/**
 * The two questions the `colab` CLI cannot answer, asked directly.
 *
 * Everything else in the app goes through the CLI — it owns OAuth, allocation
 * and the session store. Two things it knows and discards instead:
 *
 *   - Identity: `colab whoami` prints the email, but only as text, and pays a
 *     Python start-up and a tokeninfo round trip for the privilege. The CLI
 *     writes no email anywhere on disk (`token.json`'s `account` key is always
 *     empty), so the value has to come from the token itself.
 *   - Accelerator eligibility: `GET /tun/m/ccu-info` returns which GPUs and
 *     TPUs this account may use; `colab usage` formats three numbers out of the
 *     same response and drops these (see `colab_cli/consumption.py`).
 *
 * Both calls are read-only and fail soft: a missing answer becomes `null` and
 * the UI shows nothing rather than guessing.
 */

import { readFileSync } from "node:fs";
import type { AcceleratorEligibility, AccountInfo } from "@shared/types";
import { e2eMockEnabled } from "../e2e/mode";
import { parseEligibility } from "./accelerator-eligibility";
import { retryTransientRead } from "./network-retry";
import { authState, tokenFile } from "./sessions";

const TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";
/** `client.py` builds this as `{colab_domain}/tun/m/...`; keep the pair together. */
const CCU_INFO_URL = "https://colab.research.google.com/tun/m/ccu-info";
const REQUEST_TIMEOUT_MS = 30_000;

/** A network read, not a session operation: one retry rescues an intermittent TLS reset. */
const READ_ATTEMPTS = 2;

/** Entitlement moves on a subscription change, not on a clock. */
const ELIGIBILITY_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * How the CLI reaches the backend. `authuser` is not optional: the Colab backend
 * answers 400 without it (`colab_cli/client.py` adds the same parameter to every
 * request it makes).
 */
const CCU_HEADERS = {
  Accept: "application/json",
  "X-Colab-Client-Agent": "colab-cli",
};

interface CacheEntry<T> {
  value: T;
  /** The identity this answer belongs to, so a different account never reuses it. */
  subject: string;
  at: number;
}

const cache = {
  identity: null as CacheEntry<AccountInfo> | null,
  eligibility: null as CacheEntry<AcceleratorEligibility> | null,
};

/** The CLI rewrote `token.json` — whoever is signed in now is not who was before. */
export function resetAccountCache(): void {
  cache.identity = null;
  cache.eligibility = null;
}

/** The access token the CLI last minted, or null when it is missing or stale. */
function accessToken(): string | null {
  if (!authState().token_file_exists) return null;
  try {
    const value = JSON.parse(readFileSync(tokenFile(), "utf8")) as Record<string, unknown>;
    const token = value.token;
    const expiry = value.expiry;
    if (typeof token !== "string" || !token) return null;
    // A stale access token can still be refreshed, but only by the CLI — which
    // this module deliberately does not do; the next CLI call will.
    if (typeof expiry === "string" && Date.parse(expiry) <= Date.now()) return null;
    return token;
  } catch {
    return null;
  }
}

async function readJson(url: string, timeoutMs: number): Promise<unknown> {
  const response = await fetch(url, {
    headers: CCU_HEADERS,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/**
 * The signed-in account, from Google's tokeninfo endpoint.
 *
 * Returns null when the token is missing, stale, or unrecognised — the caller
 * treats that as "not shown" rather than as a failure to report.
 */
export async function fetchAccountInfo(): Promise<AccountInfo | null> {
  // A container has no Google account to introspect. The answer below is the
  // shape tokeninfo returns, so the same parsing and the same failure paths run.
  if (e2eMockEnabled()) {
    return authState().token_file_exists ? { email: "e2e@example.com", subject: "e2e-subject-1" } : null;
  }

  const token = accessToken();
  if (!token) return null;

  let body: unknown;
  try {
    // tokeninfo takes the token as a query parameter and rejects a Bearer
    // header alongside it, so this one call does not use {@link readJson}.
    body = await retryTransientRead(
      () => readJson(`${TOKENINFO_URL}?access_token=${encodeURIComponent(token)}`, REQUEST_TIMEOUT_MS),
      READ_ATTEMPTS,
    );
  } catch {
    return null;
  }

  if (typeof body !== "object" || body === null) return null;
  const info = body as Record<string, unknown>;
  // A token minted without the `userinfo.email` scope has no email, and an id
  // without the email is not worth showing.
  if (typeof info.email !== "string" || !info.email) return null;

  return {
    email: info.email,
    // Google's stable per-account id. The email can be renamed; this cannot.
    subject: typeof info.sub === "string" && info.sub ? info.sub : null,
  };
}

/**
 * Which accelerators this account may allocate, from the session backend.
 *
 * The `authuser` parameter is not decoration: without it the backend answers 400.
 */
export async function fetchAcceleratorEligibility(): Promise<AcceleratorEligibility | null> {
  // Same idea as `fetchAccountInfo`: the shape of a live answer, parsed by the
  // same rules. `ineligibleTpus` is left out on purpose — the backend omits it,
  // and that omission is the thing most likely to break the parser.
  if (e2eMockEnabled() && authState().token_file_exists) {
    return parseEligibility({
      eligibleGpus: ["G4", "A100", "L4", "T4"],
      ineligibleGpus: ["H100"],
      eligibleTpus: ["V6E1", "V5E1"],
    });
  }

  const token = accessToken();
  if (!token) return null;

  let body: unknown;
  try {
    body = await retryTransientRead(
      () => readJson(`${CCU_INFO_URL}?authuser=0`, REQUEST_TIMEOUT_MS),
      READ_ATTEMPTS,
    );
  } catch {
    return null;
  }

  return parseEligibility(body);
}

export interface AccountStatus {
  account: AccountInfo | null;
  eligibility: AcceleratorEligibility | null;
}

/**
 * Identity and entitlement for the account signed in right now.
 *
 * Identity is re-asked while the CLI keeps minting tokens, because the answer
 * is what tells us *which* account this is; eligibility is reused for a while,
 * but only for the same account — a different `sub` invalidates it on its own.
 */
export async function accountStatus(): Promise<AccountStatus> {
  if (!authState().token_file_exists) {
    resetAccountCache();
    return { account: null, eligibility: null };
  }

  // Identity is asked every time: it is the fact that says *which* account this
  // is, so it is the one thing a cache must not be allowed to pin down.
  const account = (await fetchAccountInfo()) ?? cache.identity?.value ?? null;
  const owner = account ? account.subject ?? account.email : null;
  if (account && owner) cache.identity = { value: account, subject: owner, at: Date.now() };

  // Anything cached for another account is not a fallback, it is another
  // account's entitlement. Only a matching `sub` makes it reusable.
  const reusable = cache.eligibility && cache.eligibility.subject === owner ? cache.eligibility : null;
  if (!owner) return { account, eligibility: null };
  if (reusable && Date.now() - reusable.at < ELIGIBILITY_TTL_MS) {
    return { account, eligibility: reusable.value };
  }

  const eligibility = await fetchAcceleratorEligibility();
  if (eligibility) {
    cache.eligibility = { value: eligibility, subject: owner, at: Date.now() };
    return { account, eligibility };
  }
  // A transient failure keeps yesterday's answer rather than greying out the
  // accelerators the person could use a minute ago.
  return { account, eligibility: reusable?.value ?? null };
}
