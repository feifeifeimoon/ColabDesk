import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("../store", () => ({
  useAppStore: (select: (state: unknown) => unknown) => select(store.current),
}));

import type { UsageReport } from "@shared/types";
import { setRendererUiLanguage } from "../i18n/i18n";
import { balanceMeterTone, computeBalanceRatio, soleBilledSession, StatusBar } from "./AppShell";

const baseState = {
  usage: null as UsageReport | null,
  usagePending: true,
  tabs: [] as unknown[],
  sessions: [] as unknown[],
  connections: {},
  runtimeEndpoints: null as string[] | null,
  update: { state: "idle", version: null },
  openSettings: vi.fn(),
};

/* i18next answers verbatim templates until it has a language. */
async function render(): Promise<string> {
  await setRendererUiLanguage("zh");
  return renderToStaticMarkup(createElement(StatusBar));
}

function reading(balance: number, rate: number, assignments: number): UsageReport {
  return {
    ok: true,
    needs_login: false,
    usage: { balance, rate, assignments },
    error: null,
    attempts: 1,
  };
}

describe("the status bar before the first reading", () => {
  it("draws skeletons, and never a zero", async () => {
    store.current = { ...baseState, usage: null, usagePending: true };
    const html = await render();

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("skeleton--balance");
    expect(html).toContain("skeleton--rate");
    // `0.00/h` is a reading. Unread is not "no spend".
    expect(html).not.toContain("0.00/h");
    expect(html).not.toContain("— CU");
    // An unknown balance is not 0%.
    expect(html).not.toContain("aria-valuenow");
  });

  it("stops pulsing once the read has settled without a number", async () => {
    store.current = { ...baseState, usage: null, usagePending: false };
    const html = await render();

    expect(html).toContain("— CU");
    expect(html).toContain("—/h");
    expect(html).not.toContain("skeleton");
    expect(html).not.toContain('aria-busy="true"');
  });

  it("shows the numbers that arrived", async () => {
    store.current = { ...baseState, usage: reading(395.59, 1.25, 2), usagePending: false };
    const html = await render();

    expect(html).toContain("395.59 CU");
    expect(html).toContain("1.25/h");
    expect(html).not.toContain("skeleton");
    expect(html).toContain('aria-valuenow="79"');
  });
});

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

describe("the one session an account rate can be pinned on", () => {
  const alpha = { name: "alpha", endpoint: "ep-a" };
  const beta = { name: "beta", endpoint: "ep-b" };

  it("names the only tracked runtime the server has", () => {
    expect(soleBilledSession([alpha, beta], ["ep-a"], {}, 1)).toBe("alpha");
  });

  it("answers nothing when the server lists a runtime this window cannot name", () => {
    expect(soleBilledSession([alpha, beta], ["ep-untracked"], {}, 1)).toBeNull();
  });

  it("answers nothing when more than one runtime is billing", () => {
    expect(soleBilledSession([alpha, beta], ["ep-a", "ep-b"], {}, 2)).toBeNull();
    expect(soleBilledSession([alpha, beta], ["ep-a", "ep-b"], {}, 1)).toBeNull();
  });

  it("falls back to one ready connection before the server list is read", () => {
    expect(soleBilledSession([alpha, beta], null, { alpha: { status: "ready" } }, 1)).toBe("alpha");
    expect(
      soleBilledSession([alpha, beta], null, { alpha: { status: "ready" }, beta: { status: "ready" } }, 1),
    ).toBeNull();
  });

  it("answers nothing while the billed count is unread", () => {
    expect(soleBilledSession([alpha], ["ep-a"], {}, null)).toBeNull();
  });
});
