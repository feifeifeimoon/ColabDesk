/**
 * The server's half of the session list.
 *
 * `colab sessions` prints exactly this list — with a `[?]` where a name would
 * go, for every assignment the local store has never heard of — but it prints
 * it as display text: `_format_session_line` carries no URL and no token, so
 * the CLI's output can never become a session this app can use. The response
 * the CLI formats does carry both, so the list is read from the backend
 * directly, in milliseconds, and the runtimes the local store has no record of
 * come with it.
 *
 * Shapes follow `colab_cli/client.py`'s `ListedAssignment`. The int-valued
 * enums are mapped to the same strings `sessions.json` holds, so a row from
 * here and a row from disk stay the same kind of thing downstream.
 */

import { errorMessage, type LogSink } from "../log-file";
import { e2eMockEnabled } from "../e2e/mode";
import { mockAssignments } from "../e2e/cli-stub";
import { backendGetJson } from "./backend";
import { accessToken } from "./sessions";

/** A live runtime, as the server describes it. */
export interface Assignment {
  endpoint: string;
  variant: string;
  accelerator: string;
  machine_shape: string;
  url: string;
}

const ASSIGNMENTS_PATH = "/tun/m/assignments";

/**
 * `AssignmentVariant` and `Shape` arrive as ints (`{variant: 0, machineShape:
 * 0}`); these are the names the CLI writes into `sessions.json`, in ordinal
 * order. Both fields are display-only here — an unrecognised value falls back
 * the same way a missing one does in `sessions.ts`, rather than dropping a
 * runtime that is really there.
 */
const VARIANT_NAMES = ["DEFAULT", "GPU", "TPU"];
const SHAPE_NAMES = ["STANDARD", "HIGH_RAM"];

function nameFor(value: unknown, names: string[], fallback: string): string {
  return typeof value === "number" && names[value] ? names[value] : fallback;
}

/**
 * The `assignments` array as runtimes, or null when this is not that response.
 *
 * `runtimeProxyInfo.token` is deliberately not read out: nothing in this app
 * consumes a credential for a runtime it has no record of, and a field nobody
 * reads is a field nobody has to keep alive.
 */
export function parseAssignments(body: unknown): Assignment[] | null {
  if (typeof body !== "object" || body === null) return null;
  const list = (body as Record<string, unknown>).assignments;
  if (!Array.isArray(list)) return null;

  const assignments: Assignment[] = [];
  for (const entry of list) {
    if (typeof entry !== "object" || entry === null) continue;
    const raw = entry as Record<string, unknown>;
    // Without an endpoint there is nothing to name, key or match a row on.
    if (typeof raw.endpoint !== "string" || !raw.endpoint) continue;
    const proxy = raw.runtimeProxyInfo as Record<string, unknown> | undefined;
    assignments.push({
      endpoint: raw.endpoint,
      variant: nameFor(raw.variant, VARIANT_NAMES, "DEFAULT"),
      accelerator: typeof raw.accelerator === "string" && raw.accelerator ? raw.accelerator : "NONE",
      machine_shape: nameFor(raw.machineShape, SHAPE_NAMES, "STANDARD"),
      url: typeof proxy?.url === "string" ? proxy.url : "",
    });
  }
  return assignments;
}

/**
 * Every runtime this account has right now, or null when the answer could not
 * be had — no token, no network, or a body that is not this response. The
 * caller shows what it has instead of guessing.
 */
export async function fetchAssignments(log?: LogSink): Promise<Assignment[] | null> {
  // The container has no backend to reach; the answer below is the shape the
  // real one returns, so the same parser and the same failure paths run.
  if (e2eMockEnabled()) {
    return accessToken() ? parseAssignments(mockAssignments()) : null;
  }

  try {
    return parseAssignments(await backendGetJson(ASSIGNMENTS_PATH));
  } catch (cause) {
    // The caller already tells the user the list could not be read; the log is
    // where the reason — expired token, no route, a body we cannot parse — goes.
    log?.write("api", `服务器会话列表读取失败：${errorMessage(cause)}`);
    return null;
  }
}
