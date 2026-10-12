/**
 * The Colab session backend, called the way the CLI calls it.
 *
 * `colab_cli/client.py` is the reference for every request made here: the same
 * `authuser` parameter, the same two headers, a Bearer access token, and the
 * same `)]}'` XSSI guard taken off the front of the body. What is not shared is
 * the Python start-up — a read answers in milliseconds instead of two seconds,
 * which is what makes these worth doing directly at all.
 *
 * Read-only by construction. There is no write path in this module, so the
 * "retry reads once, never retry side effects" rule from AGENTS.md holds here
 * by design rather than by remembering.
 */

import { accessToken } from "./sessions";
import { retryTransientRead } from "./network-retry";

const COLAB_DOMAIN = "https://colab.research.google.com";
const REQUEST_TIMEOUT_MS = 30_000;
/** A network read, not a session operation: one retry rescues an intermittent TLS reset. */
const READ_ATTEMPTS = 2;

/** Every JSON body from this backend wears this prefix, which is not JSON. */
const XSSI_PREFIX = ")]}'";

const BACKEND_HEADERS = {
  Accept: "application/json",
  "X-Colab-Client-Agent": "colab-cli",
};

export function stripXssiPrefix(text: string): string {
  return text.startsWith(XSSI_PREFIX) ? text.slice(XSSI_PREFIX.length) : text;
}

/**
 * One authenticated GET, as JSON. Throws; every caller in the app fails soft
 * because a missing answer is worth less than a wrong one.
 *
 * `authuser` is not decoration: without it the backend answers 400, so it is
 * added here rather than left to each caller to remember.
 */
export async function backendGetJson(path: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<unknown> {
  const token = accessToken();
  if (!token) throw new Error("token.json 里没有可用的访问令牌。");

  const url = new URL(path, COLAB_DOMAIN);
  url.searchParams.set("authuser", "0");
  const headers = { ...BACKEND_HEADERS, Authorization: `Bearer ${token}` };

  return retryTransientRead(async () => {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    return JSON.parse(stripXssiPrefix(await response.text()));
  }, READ_ATTEMPTS);
}
