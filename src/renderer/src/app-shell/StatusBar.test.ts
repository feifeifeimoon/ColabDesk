import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../store", () => ({
  useAppStore: (select: (state: unknown) => unknown) => select({}),
}));

import { setRendererUiLanguage } from "../i18n/i18n";
import { balanceMeterTone, computeBalanceRatio, formatSessionExpiry } from "./AppShell";

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

describe("formatSessionExpiry", () => {
  afterEach(async () => {
    await setRendererUiLanguage("zh");
  });

  it("returns null for null, undefined, empty, or invalid ISO", () => {
    expect(formatSessionExpiry(null)).toBeNull();
    expect(formatSessionExpiry(undefined)).toBeNull();
    expect(formatSessionExpiry("")).toBeNull();
    expect(formatSessionExpiry("invalid-date")).toBeNull();
  });

  it("returns 已过期 for past dates", async () => {
    await setRendererUiLanguage("zh");
    const past = new Date(Date.now() - 60000).toISOString();
    expect(formatSessionExpiry(past)).toBe("已过期");
  });

  /**
   * The label is the status bar's own copy, so it follows the reader. The units
   * do not change with it — `2h 15m` is what both languages put inside the
   * sentence — which is the half that would rot silently if this only ever ran
   * in Chinese.
   */
  it("跟着界面语言走，单位不变", async () => {
    await setRendererUiLanguage("en");
    const twoHoursFuture = new Date(Date.now() + 2 * 3600000 + 15 * 60000 + 2000).toISOString();
    expect(formatSessionExpiry(twoHoursFuture)).toBe("~2h 15m left");
    expect(formatSessionExpiry(new Date(Date.now() - 1000).toISOString())).toBe("Expired");

    await setRendererUiLanguage("zh");
    expect(formatSessionExpiry(twoHoursFuture)).toBe("剩余 ~2h 15m");
  });

  it("不到一小时只写分钟", async () => {
    await setRendererUiLanguage("zh");
    const twentyMinsFuture = new Date(Date.now() + 20 * 60000 + 2000).toISOString();
    expect(formatSessionExpiry(twentyMinsFuture)).toBe("剩余 ~20m");
  });
});
