import { describe, expect, it, vi } from "vitest";

vi.mock("../store", () => ({
  useAppStore: (select: (state: unknown) => unknown) => select({}),
}));

import { balanceMeterTone, computeBalanceRatio } from "./AppShell";

describe("computeBalanceRatio", () => {
  it("returns 0 for zero, negative, or invalid balance", () => {
    expect(computeBalanceRatio(null)).toBe(0);
    expect(computeBalanceRatio(undefined)).toBe(0);
    expect(computeBalanceRatio(0)).toBe(0);
    expect(computeBalanceRatio(-10)).toBe(0);
    expect(computeBalanceRatio(Number.NaN)).toBe(0);
  });

  it("calculates ratio using 100 tier for balance <= 100", () => {
    expect(computeBalanceRatio(42.5)).toBeCloseTo(0.425);
    expect(computeBalanceRatio(100)).toBe(1);
    expect(computeBalanceRatio(10)).toBeCloseTo(0.1);
  });

  it("calculates ratio using 500 tier for 100 < balance <= 500", () => {
    expect(computeBalanceRatio(250)).toBe(0.5);
    expect(computeBalanceRatio(500)).toBe(1);
    expect(computeBalanceRatio(100.1)).toBeCloseTo(0.2002);
  });

  it("calculates ratio rounded up to nearest 100 for balance > 500", () => {
    expect(computeBalanceRatio(650)).toBeCloseTo(650 / 700);
  });
});

describe("balanceMeterTone", () => {
  it("returns good for healthy ratio", () => {
    expect(balanceMeterTone(0.5)).toBe("good");
    expect(balanceMeterTone(0.16)).toBe("good");
  });

  it("returns warn for ratio between 5% and 15%", () => {
    expect(balanceMeterTone(0.15)).toBe("warn");
    expect(balanceMeterTone(0.08)).toBe("warn");
  });

  it("returns danger for ratio <= 5%", () => {
    expect(balanceMeterTone(0.05)).toBe("danger");
    expect(balanceMeterTone(0.01)).toBe("danger");
    expect(balanceMeterTone(0)).toBe("danger");
  });
});
