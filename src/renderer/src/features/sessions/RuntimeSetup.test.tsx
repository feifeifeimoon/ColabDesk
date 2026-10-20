/**
 * The runtime-setup console, as markup.
 *
 * The interesting failure is "the picker offered H100 to an account without it",
 * and that failure is visible in the attributes. The other rules here are the
 * screen's shape: the form asks its three questions on one screen and stays
 * there while the command runs, with the log and a failure appended below it.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AcceleratorEligibility } from "@shared/types";
import { setRendererUiLanguage } from "../../i18n/i18n";
import { defaultAccelerator, unavailableAccelerators } from "./accelerators";
import { RuntimeSetup } from "./RuntimeSetup";

const store = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("../../store", () => ({
  useAppStore: (select: (state: unknown) => unknown) => select(store.current),
}));

const ELIGIBILITY: AcceleratorEligibility = {
  gpus: ["G4", "A100", "L4", "T4"],
  ineligible_gpus: ["H100"],
  tpus: ["V6E1", "V5E1"],
  ineligible_tpus: [],
  fetched_at: "2026-10-12T00:00:00.000Z",
};

/** One option row, from its `<label>` to the end of that row. */
function option(markup: string, id: string): string {
  const value = markup.indexOf(`value="${id}"`);
  if (value < 0) throw new Error(`option ${id} not found`);
  return markup.slice(markup.lastIndexOf("<label", value), markup.indexOf("</label>", value));
}

function base(creation: Record<string, unknown>, eligibility: AcceleratorEligibility | null = ELIGIBILITY) {
  return {
    creation: { open: true, request: null, startedAt: null, lines: [], error: null, ...creation },
    env: { accelerator_eligibility: eligibility },
    startCreation: async () => {},
    closeNewSession: () => {},
  };
}

beforeEach(async () => {
  await setRendererUiLanguage("zh");
  store.current = base({ phase: "setup" });
});

describe("machine-type availability", () => {
  it("refuses the machine types the account was told it cannot have", () => {
    expect(unavailableAccelerators(ELIGIBILITY)).toEqual(new Set(["H100"]));
    expect(unavailableAccelerators(null)).toEqual(new Set());
  });

  it("folds the API's upper-case TPU names onto the picker's lower-case ids", () => {
    expect(unavailableAccelerators({ ...ELIGIBILITY, ineligible_gpus: [], ineligible_tpus: ["V6E1"] })).toEqual(
      new Set(["TPU:V6E1"]),
    );
  });

  // The picker has to open on something the account can get: a refused
  // machine type as the pre-selected default would fail at submit, silently.
  it("opens on the first machine type the account can actually get", () => {
    expect(defaultAccelerator(unavailableAccelerators(ELIGIBILITY))).toBe("T4");
    expect(defaultAccelerator(unavailableAccelerators(null))).toBe("T4");
    expect(defaultAccelerator(new Set(["T4", "L4"]))).toBe("G4");
  });
});

describe("the setup screen", () => {
  it("asks its three questions on one screen, with the choices in place", () => {
    const markup = renderToStaticMarkup(createElement(RuntimeSetup));

    expect(markup).toContain("? 机型");
    expect(markup).toContain("高内存");
    expect(markup).toContain("会话名称");
    // Nothing is hidden behind a widget: every option is on screen.
    expect(markup).not.toContain("<select");
    expect(markup.match(/type="radio"/g)?.length ?? 0).toBe(8);
    // The chosen row says so, and it is the default one.
    expect(option(markup, "T4")).toContain("setup__option--selected");
    expect(option(markup, "H100")).toContain("setup__option--off");
    expect(option(markup, "H100")).toContain("disabled");
    expect(option(markup, "H100")).toContain("当前账号不可用");
    // The keys are the interface, so they are on screen.
    expect(markup).toContain("Enter 下一步");
  });

  it("names what the account can use, so the list is not the only signal", () => {
    const markup = renderToStaticMarkup(createElement(RuntimeSetup));
    expect(markup).toContain("当前账号可用");
    expect(markup).toContain("G4 / A100 / L4 / T4 / V6E1 / V5E1");
  });

  it("offers everything when the backend never answered", () => {
    store.current = base({ phase: "setup" }, null);
    const markup = renderToStaticMarkup(createElement(RuntimeSetup));

    expect(option(markup, "H100")).not.toContain("disabled");
    expect(markup).not.toContain("当前账号可用");
  });
});

describe("while the request is running", () => {
  beforeEach(() => {
    store.current = base({
      phase: "provisioning",
      request: { gpu: "A100", tpu: null, name: "llama", highMem: false },
      startedAt: Date.now() - 34_000,
      lines: ["[colab] Creating session 'llama'..."],
    });
  });

  it("prints the command it is actually running while the answers stay put", () => {
    const markup = renderToStaticMarkup(createElement(RuntimeSetup));

    expect(markup).toContain("colab new -s llama --gpu A100");
    expect(markup).toContain("[colab] Creating session &#x27;llama&#x27;...");
    // The form is still on the page: the log is appended below it.
    expect(markup).toContain("setup__options");
    expect(markup).toContain('aria-busy="true"');
    // But a request that has been sent cannot be edited.
    expect(option(markup, "A100")).toContain("disabled");
    expect(markup).toMatch(/class="setup__input"[^>]*disabled/);
    // The wait is counted from a real clock, and there is a way to leave it.
    expect(markup).toContain("已等待");
    expect(markup).toContain("在后台继续");
  });
});

describe("when the request failed", () => {
  beforeEach(() => {
    store.current = base({
      phase: "failed",
      request: { gpu: "A100", tpu: null, name: "llama", highMem: false },
      startedAt: Date.now() - 5_000,
      lines: ["[colab] Creating session 'llama'..."],
      error: "后端拒绝了 A100：没有额度。",
    });
  });

  it("keeps the form editable and the reason below the log", () => {
    const markup = renderToStaticMarkup(createElement(RuntimeSetup));

    expect(markup).toContain("后端拒绝了 A100");
    // A failure is a log entry, not a different screen: the answers stay, and
    // the next move is an edit and a retry.
    expect(markup).toContain("setup__options");
    expect(markup).not.toContain('aria-busy="true"');
    expect(option(markup, "A100")).not.toContain("disabled");
    expect(markup).not.toMatch(/setup__action--primary"[^>]*disabled/);
    expect(markup).toContain("复制详情");
    expect(markup).not.toContain("返回修改");
    expect(markup).toContain("修改后 Enter 重试");
  });
});

describe("in English", () => {
  afterEach(async () => {
    await setRendererUiLanguage("zh");
  });

  /** Every string here is passed with a Chinese default: a key missing from
      en.json degrades to Chinese silently, and this is what notices. */
  it("设置那一屏不出现中文", async () => {
    await setRendererUiLanguage("en");
    expect(renderToStaticMarkup(createElement(RuntimeSetup))).not.toMatch(/[一-鿿]/);
  });

  it("申请那一屏不出现中文", async () => {
    store.current = base({
      phase: "provisioning",
      request: { gpu: "A100", tpu: null, name: "llama", highMem: false },
      startedAt: Date.now(),
      lines: ["[colab] Creating session 'llama'..."],
    });
    await setRendererUiLanguage("en");
    expect(renderToStaticMarkup(createElement(RuntimeSetup))).not.toMatch(/[一-鿿]/);
  });

  it("失败那一屏不出现中文", async () => {
    store.current = base({
      phase: "failed",
      request: { gpu: "A100", tpu: null, name: "llama", highMem: false },
      startedAt: Date.now(),
      lines: ["[colab] Creating session 'llama'..."],
      error: "The backend refused A100: no quota.",
    });
    await setRendererUiLanguage("en");
    expect(renderToStaticMarkup(createElement(RuntimeSetup))).not.toMatch(/[一-鿿]/);
  });

  // CPU is the one machine whose label is translated in the picker; the wait
  // line reads the raw option label, which must stay language-neutral.
  it("CPU 的等待文案也不出现中文", async () => {
    store.current = base({
      phase: "provisioning",
      request: { gpu: null, tpu: null, name: "cpu-box", highMem: false },
      startedAt: Date.now(),
      lines: [],
    });
    await setRendererUiLanguage("en");
    const markup = renderToStaticMarkup(createElement(RuntimeSetup));
    expect(markup).toContain("Requesting a CPU runtime");
    expect(markup).not.toMatch(/[一-鿿]/);
  });
});
