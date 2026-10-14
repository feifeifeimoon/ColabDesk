/**
 * The accelerator picker against a known entitlement: the options an account
 * cannot get are marked and unselectable, and the ones it can get are not.
 *
 * Rendered to static markup — no DOM needed for a decision that lives in the
 * attributes — because the interesting failure is "the picker offered H100 to
 * an account without it", and that failure is visible in the markup.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n/i18n";
import type { AcceleratorEligibility } from "@shared/types";

const store = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("../../store", () => ({
  useAppStore: (select: (state: unknown) => unknown) => select(store.current),
}));

import { NewSessionDialog, defaultAccelerator, unavailableAccelerators } from "./NewSessionDialog";

const ELIGIBILITY: AcceleratorEligibility = {
  gpus: ["G4", "A100", "L4", "T4"],
  ineligible_gpus: ["H100"],
  tpus: ["V6E1", "V5E1"],
  ineligible_tpus: [],
  fetched_at: "2026-10-12T00:00:00.000Z",
};

/** An option element, as the browser and the markup both spell it. */
function option(markup: string, id: string): string {
  const match = markup.match(new RegExp(`<option[^>]*value="${id}"[^>]*>[^<]*`));
  if (!match) throw new Error(`option ${id} not found`);
  return match[0];
}

describe("accelerator availability", () => {
  beforeEach(() => {
    store.current = {
      newSessionOpen: true,
      env: { accelerator_eligibility: ELIGIBILITY },
      // NewSessionDialog only reads state; these keep the store contract honest.
      closeNewSession: () => {},
      sessionCreated: () => {},
      language: "zh",
    };
  });

  it("refuses the accelerators the account was told it cannot have", () => {
    expect(unavailableAccelerators(ELIGIBILITY)).toEqual(new Set(["H100"]));
    expect(unavailableAccelerators(null)).toEqual(new Set());
  });

  it("folds the API's upper-case TPU names onto the picker's lower-case ids", () => {
    const tpuOnly = { ...ELIGIBILITY, ineligible_gpus: [], ineligible_tpus: ["V6E1"] };
    expect(unavailableAccelerators(tpuOnly)).toEqual(new Set(["TPU:V6E1"]));
  });

  // The picker has to open on something the account can get: a refused
  // accelerator as the pre-selected default would fail at submit, silently.
  it("opens on the first accelerator the account can actually get", () => {
    expect(defaultAccelerator(unavailableAccelerators(ELIGIBILITY))).toBe("T4");
    expect(defaultAccelerator(unavailableAccelerators(null))).toBe("T4");
    expect(defaultAccelerator(new Set(["T4", "L4"]))).toBe("G4");
  });

  it("marks unavailable options in the picker and leaves the rest alone", () => {
    const markup = renderToStaticMarkup(createElement(NewSessionDialog));

    expect(option(markup, "H100")).toContain("disabled");
    expect(option(markup, "H100")).toContain("当前账号不可用");
    expect(option(markup, "T4")).not.toContain("disabled");
    expect(option(markup, "tpu:v6e1")).not.toContain("disabled");
  });

  it("names what the account can use, so the list is not the only signal", () => {
    const markup = renderToStaticMarkup(createElement(NewSessionDialog));
    expect(markup).toContain("当前账号可用");
    expect(markup).toContain("G4 / A100 / L4 / T4 / V6E1 / V5E1");
  });

  it("offers everything when the backend never answered", () => {
    store.current = { ...store.current, env: { accelerator_eligibility: null } };
    const markup = renderToStaticMarkup(createElement(NewSessionDialog));

    expect(option(markup, "H100")).not.toContain("disabled");
    expect(markup).not.toContain("当前账号可用");
  });
});
