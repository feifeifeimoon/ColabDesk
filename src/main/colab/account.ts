/**
 * The two questions the `colab` CLI cannot answer, asked directly.
 *
 * The CLI owns OAuth, allocation and the session store; identity and
 * entitlement are the two facts it knows and then throws away:
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

import type { AcceleratorEligibility, AccountInfo } from "@shared/types";
import { e2eMockEnabled } from "../e2e/mode";
import { parseEligibility } from "./accelerator-eligibility";
import { backendGetJson } from "./backend";
import { retryTransientRead } from "./network-retry";
import { ensureAccessToken, authState } from "./sessions";

const TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";
const REQUEST_TIMEOUT_MS = 30_000;

/** A network read, not a session operation: one retry rescues an intermittent TLS reset. */
const READ_ATTEMPTS = 2;

/** Entitlement moves on a subscription change, not on a clock. */
const ELIGIBILITY_TTL_MS = 12 * 60 * 60 * 1000;

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

/**
 * tokeninfo is the one read that does not go through `backend.ts`: it takes the
 * token as a query parameter and rejects a Bearer header alongside it, and it
 * is not on the session backend's domain, so it has neither that auth nor an
 * XSSI guard.
 */
async function readTokenInfo(url: string, timeoutMs: number): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
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

  const token = await ensureAccessToken();
  if (!token) return null;

  let body: unknown;
  try {
    body = await retryTransientRead(
      () => readTokenInfo(`${TOKENINFO_URL}?access_token=${encodeURIComponent(token)}`, REQUEST_TIMEOUT_MS),
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

  try {
    return parseEligibility(await backendGetJson("/tun/m/ccu-info"));
  } catch {
    return null;
  }
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
