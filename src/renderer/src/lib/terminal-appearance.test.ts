/**
 * The preference record: what it does with a value nobody meant to store, what
 * survives an upgrade, and what a change is allowed to touch on a live terminal.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { ITerminalOptions } from "@xterm/xterm";
import {
  DEFAULT_TERMINAL_APPEARANCE,
  TERMINAL_FONTS,
  TERMINAL_THEME_IDS,
  applyTerminalAppearance,
  changesGrid,
  fontStackFor,
  isLightPalette,
  normalizeTerminalAppearance,
  readTerminalAppearance,
  saveTerminalAppearance,
  terminalThemesOf,
} from "./terminal-appearance";

const STORAGE_KEY = "colabdesk.terminal.appearance";
const LEGACY_KEY = "colabdesk.terminal.fontSize";

/** The slice reads localStorage when it is created, which is never in this lane. */
function storage(initial: Record<string, string> = {}): Map<string, string> {
  const map = new Map(Object.entries(initial));
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
  });
  return map;
}

afterEach(() => vi.unstubAllGlobals());

describe("defaults", () => {
  it("is the terminal the app has always shown", () => {
    storage();
    expect(readTerminalAppearance()).toEqual(DEFAULT_TERMINAL_APPEARANCE);
    // Line height stays at xterm's own default: making the design's preferred
    // 1.2 the default would re-fit every running shell on the next launch.
    expect(DEFAULT_TERMINAL_APPEARANCE.lineHeight).toBe(1);
  });

  it("reads an unreadable record as the defaults rather than failing", () => {
    storage({ [STORAGE_KEY]: "{ this is not json" });
    expect(readTerminalAppearance()).toEqual(DEFAULT_TERMINAL_APPEARANCE);
  });
});

describe("limits", () => {
  it("brings every field back inside its own range", () => {
    const normalized = normalizeTerminalAppearance({
      themeDark: "solarized",
      themeLight: "gone",
      fontId: "comic-sans",
      fontSize: 99,
      lineHeight: 3,
      cursorStyle: "beam",
      cursorBlink: "yes",
      padding: "airy",
      scrollback: 12_345,
    });

    expect(normalized).toEqual({
      ...DEFAULT_TERMINAL_APPEARANCE,
      fontSize: 24,
    });
  });

  it("clamps a size below the range too", () => {
    expect(normalizeTerminalAppearance({ fontSize: 2 }).fontSize).toBe(8);
  });

  it("survives values that are not even objects", () => {
    for (const raw of [null, undefined, "titanium", 42, []]) {
      expect(normalizeTerminalAppearance(raw)).toEqual(DEFAULT_TERMINAL_APPEARANCE);
    }
  });

  it("keeps a record that is already legal exactly as it is", () => {
    const stored = { ...DEFAULT_TERMINAL_APPEARANCE, themeDark: "nord" as const, fontSize: 18 };
    storage({ [STORAGE_KEY]: JSON.stringify(stored) });
    expect(readTerminalAppearance()).toEqual(stored);
  });
});

describe("upgrading from the record that held one palette", () => {
  /** The shape the single-slot build wrote: one `themeId`, no slots, no switch. */
  const legacy = {
    themeId: "monokai",
    fontId: "geist-mono",
    fontSize: 15,
    lineHeight: 1.2,
    cursorStyle: "bar",
    cursorBlink: false,
    padding: "spacious",
    scrollback: 20_000,
  };

  it("moves the palette someone chose into the dark slot", () => {
    storage({ [STORAGE_KEY]: JSON.stringify(legacy) });
    const appearance = readTerminalAppearance();

    expect(appearance.themeDark).toBe("monokai");
    // The rest of the record is theirs and survives untouched.
    expect(appearance.fontSize).toBe(15);
    expect(appearance.lineHeight).toBe(1.2);
    expect(appearance.cursorStyle).toBe("bar");
  });

  it("fills the light slot with the default", () => {
    storage({ [STORAGE_KEY]: JSON.stringify(legacy) });
    const appearance = readTerminalAppearance();

    expect(appearance.themeLight).toBe(DEFAULT_TERMINAL_APPEARANCE.themeLight);
  });

  it("puts a light palette someone chose into the light slot, where following uses it", () => {
    storage({ [STORAGE_KEY]: JSON.stringify({ ...legacy, themeId: "one-half-light" }) });
    const appearance = readTerminalAppearance();

    expect(appearance.themeLight).toBe("one-half-light");
    expect(appearance.themeDark).toBe(DEFAULT_TERMINAL_APPEARANCE.themeDark);
  });
});

describe("upgrading from the font size that used to live alone", () => {
  it("keeps the size someone already chose", () => {
    storage({ [LEGACY_KEY]: "16" });
    expect(readTerminalAppearance().fontSize).toBe(16);
  });

  it("ignores a legacy size that is out of range", () => {
    storage({ [LEGACY_KEY]: "40" });
    expect(readTerminalAppearance().fontSize).toBe(DEFAULT_TERMINAL_APPEARANCE.fontSize);
  });

  it("lets the record win once it exists", () => {
    storage({
      [LEGACY_KEY]: "16",
      [STORAGE_KEY]: JSON.stringify({ ...DEFAULT_TERMINAL_APPEARANCE, fontSize: 11 }),
    });
    expect(readTerminalAppearance().fontSize).toBe(11);
  });

  it("keeps each slot on its own side of the polarity", () => {
    // Following is unconditional now, so a slot pointing at the other polarity
    // would be a palette nobody can read on that surface.
    const normalized = normalizeTerminalAppearance({
      themeDark: "one-half-light",
      themeLight: "dracula",
    });

    expect(normalized.themeDark).toBe(DEFAULT_TERMINAL_APPEARANCE.themeDark);
    expect(normalized.themeLight).toBe(DEFAULT_TERMINAL_APPEARANCE.themeLight);
  });

  it("round-trips through storage", () => {
    const map = storage();
    const chosen = {
      ...DEFAULT_TERMINAL_APPEARANCE,
      themeDark: "dracula" as const,
      themeLight: "one-half-light" as const,
      padding: "spacious" as const,
    };
    saveTerminalAppearance(chosen);
    expect(map.get(STORAGE_KEY)).toBe(JSON.stringify(chosen));
    expect(readTerminalAppearance()).toEqual(chosen);
  });
});

describe("font stacks", () => {
  it("falls back to the face the app ships, whichever one is chosen", () => {
    for (const font of TERMINAL_FONTS) {
      // `Geist Mono` alone is not a family this app registers — the bundled one
      // is `Geist Mono Variable`, and a stack that misses it lands on whatever
      // monospace the OS happens to have.
      expect(fontStackFor(font.id), font.id).toContain('"Geist Mono Variable"');
    }
  });

  it("puts the chosen face first", () => {
    for (const font of TERMINAL_FONTS.filter((candidate) => !candidate.bundled)) {
      expect(fontStackFor(font.id).startsWith(`"${font.label}"`), font.id).toBe(true);
    }
  });
});

describe("applying to a live terminal", () => {
  const target = (): { options: Partial<ITerminalOptions> } => ({ options: {} });

  it("writes every option when nothing was applied before", () => {
    const terminal = target();
    applyTerminalAppearance(terminal, DEFAULT_TERMINAL_APPEARANCE, null);

    expect(terminal.options.fontSize).toBe(DEFAULT_TERMINAL_APPEARANCE.fontSize);
    expect(terminal.options.fontFamily).toBe(fontStackFor(DEFAULT_TERMINAL_APPEARANCE.fontId));
    expect(terminal.options.lineHeight).toBe(DEFAULT_TERMINAL_APPEARANCE.lineHeight);
    expect(terminal.options.cursorStyle).toBe(DEFAULT_TERMINAL_APPEARANCE.cursorStyle);
    expect(terminal.options.cursorBlink).toBe(DEFAULT_TERMINAL_APPEARANCE.cursorBlink);
    expect(terminal.options.scrollback).toBe(DEFAULT_TERMINAL_APPEARANCE.scrollback);
  });

  it("touches only what changed", () => {
    const terminal = target();
    const previous = DEFAULT_TERMINAL_APPEARANCE;
    applyTerminalAppearance(terminal, { ...previous, fontSize: 18 }, previous);

    // xterm clears and re-measures for each of these, so writing the ones that
    // did not change would clear six times to move one pixel.
    expect(Object.keys(terminal.options)).toEqual(["fontSize"]);
  });

  it("leaves the theme and the padding to the stylesheet", () => {
    const terminal = target();
    const previous = DEFAULT_TERMINAL_APPEARANCE;
    applyTerminalAppearance(
      terminal,
      { ...previous, themeDark: "monokai", padding: "compact" },
      previous,
    );

    expect(Object.keys(terminal.options)).toEqual([]);
  });

  it("knows which changes move the grid", () => {
    const previous = DEFAULT_TERMINAL_APPEARANCE;
    for (const patch of [{ fontSize: 18 }, { lineHeight: 1.2 }, { padding: "compact" as const }, { fontId: "fira-code" as const }]) {
      expect(changesGrid({ ...previous, ...patch }, previous), JSON.stringify(patch)).toBe(true);
    }
    for (const patch of [{ themeId: "nord" as const }, { cursorStyle: "bar" as const }, { cursorBlink: false }, { scrollback: 5_000 }]) {
      expect(changesGrid({ ...previous, ...patch }, previous), JSON.stringify(patch)).toBe(false);
    }
    expect(changesGrid(previous, null)).toBe(true);
  });

  it("offers every theme the stylesheet is expected to define", () => {
    expect([...TERMINAL_THEME_IDS]).toHaveLength(10);
    expect(new Set(TERMINAL_THEME_IDS).size).toBe(TERMINAL_THEME_IDS.length);
  });

  it("has palettes on both sides of the polarity, or following the app is a lie", () => {
    // A light window follows into the light slot: with no light palette that
    // slot would hold a dark one and following would change nothing.
    expect(terminalThemesOf("light").length).toBeGreaterThan(0);
    expect(terminalThemesOf("dark").length).toBeGreaterThan(0);
    expect(isLightPalette(DEFAULT_TERMINAL_APPEARANCE.themeLight)).toBe(true);
    expect(isLightPalette(DEFAULT_TERMINAL_APPEARANCE.themeDark)).toBe(false);
  });
});
