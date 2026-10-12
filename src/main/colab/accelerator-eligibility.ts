/**
 * Reading the session backend's answer to "what may this account allocate?".
 *
 * A module of its own because the rule matters more than the request: an
 * entitlement the app cannot read must be `null`, never a half-filled list that
 * greys out accelerators the account could actually use.
 */

import type { AcceleratorEligibility } from "@shared/types";

/**
 * A list field: absent means "none", present-but-not-a-list-of-strings means
 * the response is not the one we think it is.
 */
function listOrEmpty(value: unknown): string[] | null {
  if (value === undefined) return [];
  return Array.isArray(value) && value.every((entry) => typeof entry === "string") ? value : null;
}

/**
 * The `ccu-info` body as an entitlement, or null when a list is there but
 * unreadable.
 *
 * Absent lists are normal, not suspicious: a live account answered with
 * `eligibleGpus`/`ineligibleGpus`/`eligibleTpus` and no `ineligibleTpus` at all.
 * Requiring all four would have thrown away every real answer.
 */
export function parseEligibility(body: unknown): AcceleratorEligibility | null {
  if (typeof body !== "object" || body === null) return null;
  const info = body as Record<string, unknown>;
  const gpus = listOrEmpty(info.eligibleGpus);
  const ineligibleGpus = listOrEmpty(info.ineligibleGpus);
  const tpus = listOrEmpty(info.eligibleTpus);
  const ineligibleTpus = listOrEmpty(info.ineligibleTpus);
  if (!gpus || !ineligibleGpus || !tpus || !ineligibleTpus) return null;

  return {
    gpus,
    ineligible_gpus: ineligibleGpus,
    tpus,
    ineligible_tpus: ineligibleTpus,
    fetched_at: new Date().toISOString(),
  };
}
