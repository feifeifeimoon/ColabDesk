/**
 * The status bar's pure maths, kept apart from `AppShell.tsx`.
 *
 * That file exports components; a module that exports a component and a
 * runtime function together makes React Fast Refresh invalidate the module
 * instead of replacing the component.
 */

import type { Session } from "@shared/types";

/**
 * Compute the tier-adaptive progress ratio for compute units.
 * Base tiers: 100 CU (Pro), 500 CU (Pro+), or next 100-step ceiling.
 */
export function computeBalanceRatio(balance: number | null | undefined): number {
  if (balance === null || balance === undefined || !Number.isFinite(balance) || balance <= 0) {
    return 0;
  }
  const tier = balance <= 100 ? 100 : balance <= 500 ? 500 : Math.ceil(balance / 100) * 100;
  return Math.min(Math.max(balance / tier, 0), 1);
}

export function balanceMeterTone(ratio: number): "good" | "warn" | "danger" {
  if (ratio <= 0.05) return "danger";
  if (ratio <= 0.15) return "warn";
  return "good";
}

/**
 * The session whose own rate the account reading describes, or null.
 *
 * `consumptionRateHourly` is account-wide: with exactly one billed runtime it
 * is that runtime's rate; with two it is a sum that cannot be split. The
 * server's endpoint list is what makes the answer exact — it also counts
 * runtimes this window has no record of — and a single ready connection is the
 * fallback before that list has been read.
 */
export function soleBilledSession(
  sessions: Pick<Session, "name" | "endpoint">[],
  runtimeEndpoints: string[] | null,
  connections: Record<string, { status: string } | undefined>,
  assignments: number | null,
): string | null {
  if (assignments !== 1) return null;
  if (runtimeEndpoints !== null) {
    if (runtimeEndpoints.length !== 1) return null;
    return sessions.find((session) => session.endpoint === runtimeEndpoints[0])?.name ?? null;
  }
  const ready = sessions.filter((session) => connections[session.name]?.status === "ready");
  return ready.length === 1 ? ready[0].name : null;
}
