/**
 * The account's compute units, read straight from the endpoint `colab usage`
 * wraps.
 *
 * The CLI turns this one request into a Python interpreter start (measured at
 * 3.4s on the machine this was written on, offline); the request itself is a few
 * hundred milliseconds. The status bar wants the number at launch, so it asks
 * the endpoint the CLI would have asked.
 *
 * Shape and mapping follow `colab_cli/consumption.py`: the body's
 * `currentBalance` / `consumptionRateHourly` / `assignmentsCount` are the
 * balance, the hourly rate and the number of runtimes being billed.
 */

import type { Usage, UsageReport } from "@shared/types";
import { e2eMockEnabled } from "../e2e/mode";
import { errorMessage, type LogSink } from "../log-file";
import { backendGetJson } from "./backend";
import { authState, ensureAccessToken } from "./sessions";

const CCU_INFO_PATH = "/tun/m/ccu-info";

/** Every field unknown — which is not the same as zero. */
function noReading(): Usage {
  return { balance: null, rate: null, assignments: null };
}

/**
 * The `ccu-info` body as a reading, or null when it is not that response.
 *
 * Numbers are required rather than defaulted: a missing balance rendered as
 * `0.00` would tell somebody their account is empty.
 */
export function parseCcuInfo(body: unknown): Usage | null {
  if (typeof body !== "object" || body === null) return null;
  const info = body as Record<string, unknown>;
  const balance = info.currentBalance;
  const rate = info.consumptionRateHourly;
  const assignments = info.assignmentsCount;
  if (typeof balance !== "number" || typeof rate !== "number" || typeof assignments !== "number") return null;
  return { balance, rate, assignments };
}

/**
 * The reading, or why there is none.
 *
 * Read-only, so `backendGetJson` retries a transient reset once — the same rule
 * every other read follows. A missing credential is `needs_login`, never a
 * generic failure: that is the difference between "sign in again" and "the
 * network is down", and the person reading the screen acts differently.
 */
export async function fetchUsage(log?: LogSink): Promise<UsageReport> {
  // The container has no backend to reach; the answer below is the body the
  // real one returns, so the same parser and the same failure paths run.
  if (e2eMockEnabled()) {
    if (!authState().token_file_exists) {
      return { ok: false, needs_login: true, usage: noReading(), error: null, attempts: 0 };
    }
    return {
      ok: true,
      needs_login: false,
      usage: parseCcuInfo({ currentBalance: 42.5, consumptionRateHourly: 1.25, assignmentsCount: 1 }) as Usage,
      error: null,
      attempts: 1,
    };
  }

  const token = await ensureAccessToken();
  if (!token) {
    return { ok: false, needs_login: true, usage: noReading(), error: null, attempts: 0 };
  }

  try {
    const usage = parseCcuInfo(await backendGetJson(CCU_INFO_PATH));
    if (!usage) throw new Error("ccu-info 的响应不是预期的形状。");
    return { ok: true, needs_login: false, usage, error: null, attempts: 1 };
  } catch (cause) {
    const error = errorMessage(cause);
    log?.write("api", `算力读取失败（ccu-info）：${error}`);
    // 401/403 is the credential, not the network.
    return { ok: false, needs_login: /HTTP 40[13]/.test(error), usage: noReading(), error, attempts: 1 };
  }
}
