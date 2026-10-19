import { describe, expect, it } from "vitest";
import { parseCcuInfo } from "./usage";

/**
 * The `/tun/m/ccu-info` body as the live backend sends it — the same shape
 * `colab_cli/consumption.py` validates before `colab usage` formats it.
 */
const REAL_BODY = { currentBalance: 395.59, consumptionRateHourly: 0, assignmentsCount: 0 };

describe("parseCcuInfo", () => {
  it("maps the body's three numbers onto the reading", () => {
    expect(parseCcuInfo(REAL_BODY)).toEqual({ balance: 395.59, rate: 0, assignments: 0 });
  });

  it("keeps a running account's rate and billed count", () => {
    expect(parseCcuInfo({ currentBalance: 42.5, consumptionRateHourly: 1.25, assignmentsCount: 2 })).toEqual({
      balance: 42.5,
      rate: 1.25,
      assignments: 2,
    });
  });

  it("keeps a negative balance — a deficit is a reading, not a parse failure", () => {
    expect(parseCcuInfo({ currentBalance: -12.5, consumptionRateHourly: 0, assignmentsCount: 0 })?.balance).toBe(-12.5);
  });

  it("answers null rather than a zero when a number is missing", () => {
    // A missing balance rendered as 0.00 would tell somebody their account is empty.
    expect(parseCcuInfo({ consumptionRateHourly: 1, assignmentsCount: 1 })).toBeNull();
    expect(parseCcuInfo({ currentBalance: "395.59", consumptionRateHourly: 0, assignmentsCount: 0 })).toBeNull();
  });

  it("answers null when this is not that response", () => {
    expect(parseCcuInfo(null)).toBeNull();
    expect(parseCcuInfo("not an object")).toBeNull();
    expect(parseCcuInfo({})).toBeNull();
  });
});
