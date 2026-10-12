import { describe, expect, it } from "vitest";
import { parseEligibility } from "./accelerator-eligibility";

/**
 * A live `/tun/m/ccu-info` response, verbatim — note that there is no
 * `ineligibleTpus` key at all. The backend simply omits a list when it has
 * nothing to say, and a parser that insisted on all four would discard every
 * real answer.
 */
const REAL_BODY = {
  currentBalance: 397.5042362051157,
  consumptionRateHourly: 0,
  assignmentsCount: 0,
  eligibleGpus: ["G4", "A100", "L4", "T4"],
  ineligibleGpus: ["H100"],
  eligibleTpus: ["V6E1", "V5E1"],
};

describe("accelerator eligibility", () => {
  it("carries the entitlement through, including what is refused", () => {
    const eligibility = parseEligibility(REAL_BODY);
    expect(eligibility).not.toBeNull();
    expect(eligibility?.gpus).toEqual(["G4", "A100", "L4", "T4"]);
    expect(eligibility?.ineligible_gpus).toEqual(["H100"]);
    expect(eligibility?.tpus).toEqual(["V6E1", "V5E1"]);
    expect(eligibility?.ineligible_tpus).toEqual([]);
    expect(Number.isNaN(Date.parse(eligibility?.fetched_at ?? ""))).toBe(false);
  });

  it("an account with nothing available reads as empty lists, not as unknown", () => {
    const eligibility = parseEligibility({
      eligibleGpus: [],
      ineligibleGpus: ["T4", "A100"],
      eligibleTpus: [],
      ineligibleTpus: ["V5E1"],
    });
    expect(eligibility?.gpus).toEqual([]);
    expect(eligibility?.ineligible_gpus).toEqual(["T4", "A100"]);
  });

  it("reads an omitted list as an empty one rather than as a broken response", () => {
    const eligibility = parseEligibility(REAL_BODY);
    expect(eligibility?.ineligible_tpus).toEqual([]);
    expect(parseEligibility({ eligibleGpus: ["T4"] })?.ineligible_gpus).toEqual([]);
  });

  it("answers null when a list is present but is not a list of names", () => {
    expect(parseEligibility({ ...REAL_BODY, eligibleGpus: "T4" })).toBeNull();
    expect(parseEligibility({ ...REAL_BODY, ineligibleTpus: [1, 2] })).toBeNull();
    expect(parseEligibility({ ...REAL_BODY, eligibleTpus: null })).toBeNull();
    expect(parseEligibility(null)).toBeNull();
    expect(parseEligibility("not an object")).toBeNull();
  });
});
