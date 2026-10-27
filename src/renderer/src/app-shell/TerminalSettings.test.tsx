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
import {
  DEFAULT_TERMINAL_APPEARANCE,
  TERMINAL_FONTS,
  TERMINAL_THEME_IDS,
  terminalThemesOf,
} from "../lib/terminal-appearance";

const store = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("../store", () => ({
  useAppStore: (select: (state: unknown) => unknown) => select(store.current),
}));

// The sandbox owns a real xterm; what the section decides is the subject — the
// palette it is handed (the set being edited) is the whole point here.
vi.mock("../features/workspace/TerminalPreview", async () => {
  const { createElement: h } = await import("react");
  return {
    TerminalPreview: ({ themeId }: { themeId: string }) =>
      h("div", {
        className: "terminal-preview",
        "data-preview": "sandbox",
        "data-preview-theme": themeId,
      }),
  };
});

import { TerminalSettings } from "./TerminalSettings";

const noop = () => {};

const baseStore = () => ({
  terminal: DEFAULT_TERMINAL_APPEARANCE,
  resolvedTheme: "dark",
  setTerminalAppearance: noop,
  copyOnSelect: false,
  setCopyOnSelect: noop,
});

beforeEach(() => {
  store.current = baseStore();
});

const render = (): string => renderToStaticMarkup(createElement(TerminalSettings));
const text = (html: string): string => html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

function pressed(markup: string): string[] {
  return [...markup.matchAll(/<button[^>]*aria-pressed="true"[^>]*>(.*?)<\/button>/g)].map((match) =>
    text(match[1]),
  );
}

/** The boolean rows' opening tags, keyed by the name each announces. */
function switches(markup: string): Map<string, string> {
  return new Map(
    [...markup.matchAll(/<button[^>]*role="switch"[^>]*>/g)].map((match) => [
      /aria-label="([^"]*)"/.exec(match[0])?.[1] ?? "",
      match[0],
    ]),
  );
}

/** The palette rows on screen, keyed by the theme each one wears. */
function themeOptions(markup: string): Map<string, string> {
  return new Map(
    [...markup.matchAll(/<label[^>]*data-terminal-theme="([a-z-]+)"[^>]*>([\s\S]*?)<\/label>/g)].map(
      (match) => [match[1], match[2]],
    ),
  );
}

function chosenThemes(markup: string): string[] {
  return [...themeOptions(markup)]
    .filter(([, body]) => body.includes('checked=""'))
    .map(([id]) => id);
}

describe("the terminal section", () => {
  it("renders the sandbox in the set the app is using, named on the card", () => {
    const markup = render();
    const label = text(markup);

    expect(markup).toContain('data-preview="sandbox"');
    expect(markup).toContain(
      `data-preview-theme="${DEFAULT_TERMINAL_APPEARANCE.themeDark}"`,
    );
    expect(label).toContain("深色配色");
    expect(label).not.toContain("即时预览终端渲染效果");
  });

  it("keeps the sandbox between the typography and viewport controls", () => {
    const markup = render();

    const typography = markup.indexOf("排版");
    const sandbox = markup.indexOf('data-preview="sandbox"');
    const viewport = markup.indexOf("光标与视口");

    expect(typography).toBeLessThan(sandbox);
    expect(sandbox).toBeLessThan(viewport);
  });

  it("marks exactly one option in each of its choice rows", () => {
    // Three rows of buttons — line height, cursor shape and viewport padding —
    // plus the segmented control that picks the set being edited. The palette
    // rows are radios, and the two lists that can run long are selects.
    expect(pressed(render())).toHaveLength(4);
  });

  it("shows one palette set at a time, the one the app is using", () => {
    const dark = themeOptions(render());
    expect([...dark.keys()]).toEqual([...terminalThemesOf("dark")]);
    expect([...dark.keys()]).not.toContain("one-half-light");
    expect(chosenThemes(render())).toEqual([DEFAULT_TERMINAL_APPEARANCE.themeDark]);

    store.current = { ...baseStore(), resolvedTheme: "light" };
    const light = themeOptions(render());
    expect([...light.keys()]).toEqual([...terminalThemesOf("light")]);
    expect([...light.keys()]).not.toContain("titanium");
    expect(chosenThemes(render())).toEqual([DEFAULT_TERMINAL_APPEARANCE.themeLight]);
    expect(render()).toContain(
      `data-preview-theme="${DEFAULT_TERMINAL_APPEARANCE.themeLight}"`,
    );
    expect(text(render())).toContain("浅色配色");
  });

  it("reaches every palette across the two sets, each exactly once", () => {
    const dark = [...themeOptions(render()).keys()];
    store.current = { ...baseStore(), resolvedTheme: "light" };
    const light = [...themeOptions(render()).keys()];

    expect([...dark, ...light].sort()).toEqual([...TERMINAL_THEME_IDS].sort());
  });

  it("has no follow switch and never disables a set", () => {
    const label = text(render());

    expect(label).not.toContain("跟随界面深浅");
    expect(label).not.toContain("需先开启");
    // The other set is one segment away, and always live.
    expect(label).toContain("浅色");
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
    for (const heading of ["配色", "排版", "光标与视口", "复制与粘贴"]) {
      expect(markup, heading).toContain(heading);
    }
  });

  it("says the two boolean rows as switches, each in the state it holds", () => {
    const rows = switches(render());

    expect([...rows.keys()]).toEqual(["光标闪烁", "选中即复制"]);
    expect(rows.get("光标闪烁")).toContain('aria-checked="true"');
    expect(rows.get("选中即复制")).toContain('aria-checked="false"');
  });

  it("offers select-to-copy, off by default and on when chosen", () => {
    // The row's label names the switch for a screen reader; the control itself
    // carries the state, so the render can be read without the surrounding row.
    const copySwitch = (markup: string): string => switches(markup).get("选中即复制") ?? "";

    const off = render();
    expect(text(off)).toContain("选中即复制");
    expect(copySwitch(off)).toContain('aria-checked="false"');

    store.current = {
      terminal: DEFAULT_TERMINAL_APPEARANCE,
      setTerminalAppearance: noop,
      copyOnSelect: true,
      setCopyOnSelect: noop,
    };
    expect(copySwitch(render())).toContain('aria-checked="true"');
  });
});

describe("in English", () => {
  afterEach(async () => {
    await setRendererUiLanguage("zh");
  });

  /**
   * The label tables hold `[key, Chinese fallback]` pairs; they do not sit
   * inside a `t()` call in the source, so only the rendered markup can say
   * whether they came out translated.
   */
  it("终端设置不出现中文", async () => {
    await setRendererUiLanguage("en");
    expect(text(render())).not.toMatch(/[一-鿿]/);
  });
});
