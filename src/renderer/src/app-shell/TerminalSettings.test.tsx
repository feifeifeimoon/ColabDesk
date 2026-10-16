/**
 * The terminal section, rendered as markup.
 *
 * Two rules live here that a picture would not hold to: the choice rows each
 * mark exactly one option, and the theme chips carry their own palette (a chip
 * without the attribute would show the *current* theme seven times). The render
 * also has to survive without a browser — the font-availability probe asks
 * `document.fonts`, which a static render does not have, so a probe moved into
 * the render path fails right here.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setRendererUiLanguage } from "../i18n/i18n";
import { DEFAULT_TERMINAL_APPEARANCE, TERMINAL_FONTS, TERMINAL_THEME_IDS } from "../lib/terminal-appearance";

const store = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("../store", () => ({
  useAppStore: (select: (state: unknown) => unknown) => select(store.current),
}));

// The sandbox owns a real xterm; what the section decides is the subject.
vi.mock("../features/workspace/TerminalPreview", async () => {
  const { createElement: h } = await import("react");
  return {
    TerminalPreview: () =>
      h("div", { className: "terminal-preview", "data-preview": "sandbox" }),
  };
});

import { TerminalSettings } from "./TerminalSettings";

const noop = () => {};

beforeEach(() => {
  store.current = { terminal: DEFAULT_TERMINAL_APPEARANCE, setTerminalAppearance: noop };
});

const render = (): string => renderToStaticMarkup(createElement(TerminalSettings));
const text = (html: string): string => html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

/** Buttons, with what they read as. Static markup, so no parser is involved. */
function buttons(markup: string): string[] {
  return [...markup.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((match) => text(match[1]));
}

function pressed(markup: string): string[] {
  return [...markup.matchAll(/<button[^>]*aria-pressed="true"[^>]*>(.*?)<\/button>/g)].map((match) =>
    text(match[1]),
  );
}

describe("the terminal section", () => {
  it("opens with the sandbox", () => {
    expect(render()).toContain('data-preview="sandbox"');
  });

  it("marks exactly one option in each of its choice rows", () => {
    // Five rows of buttons — the two palette slots, line height, cursor shape and
    // the viewport's padding. The follow switch is a checkbox, and the two lists
    // that can run long are selects, so neither is one of them.
    expect(pressed(render())).toHaveLength(5);
  });

  it("offers every palette once, each in its own slot", () => {
    const markup = render();
    const chips = [...markup.matchAll(/<span class="terminal-swatch" data-terminal-theme="([a-z-]+)"/g)].map(
      (match) => match[1],
    );

    expect([...chips].sort()).toEqual([...TERMINAL_THEME_IDS].sort());
    expect(new Set(chips).size).toBe(chips.length);
    const labels = buttons(markup);
    expect(new Set(labels).size, labels.join(" / ")).toBe(labels.length);
  });

  it("disables the light slot while the terminal is not following the app", () => {
    store.current = {
      terminal: { ...DEFAULT_TERMINAL_APPEARANCE, followAppTheme: false },
      setTerminalAppearance: noop,
    };
    const markup = render();

    // Shown, not taken away: that these exist and the switch above is what turns
    // them on is the fact worth reading.
    const lightRow = markup.slice(markup.indexOf("浅色时用"));
    expect(lightRow).toContain("disabled");
    expect(lightRow).toContain("需先开启");
  });

  it("shows the font size it is set to, between the two steps", () => {
    const markup = render();
    expect(markup).toContain('data-testid="terminal-font-size"');
    expect(text(markup.slice(markup.indexOf('data-testid="terminal-font-size"')))).toContain(
      `${DEFAULT_TERMINAL_APPEARANCE.fontSize} px`,
    );
    expect(markup).toContain("减小字号");
    expect(markup).toContain("增大字号");
  });

  it("offers every font, the bundled one first", () => {
    const options = [...render().matchAll(/<option value="([a-z-]+)"/g)].map((match) => match[1]);
    expect(options[0]).toBe(TERMINAL_FONTS[0].id);
    for (const font of TERMINAL_FONTS) expect(options).toContain(font.id);
  });

  it("still documents the shortcut that changes the size", () => {
    expect(render()).toContain("Ctrl+Shift+= / -");
  });

  it("names the four groups it splits into", () => {
    const markup = render();
    for (const heading of ["配色", "排版", "光标与视口", "键盘与鼠标"]) {
      expect(markup, heading).toContain(heading);
    }
  });
});

describe("in English", () => {
  afterEach(async () => {
    await setRendererUiLanguage("zh");
  });

  /**
   * The label tables hold `[key, Chinese fallback]` pairs and the shortcut table
   * has a first column that is a word ("右键") rather than a key combo — neither
   * sits inside a `t()` call in the source, so only the rendered markup can say
   * whether they came out translated.
   */
  it("终端设置不出现中文", async () => {
    await setRendererUiLanguage("en");
    expect(text(render())).not.toMatch(/[一-鿿]/);
  });
});
