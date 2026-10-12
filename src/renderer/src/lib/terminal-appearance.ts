/**
 * What the terminal looks like, as a preference.
 *
 * One record and one action rather than eight fields and eight setters: every
 * knob here is applied together, in one pass, to every open pane, so splitting
 * the writes would buy nothing and give the same value two ways in. The
 * constants, limits and clamping live here rather than in the store because the
 * settings controls need the same numbers — the shape `panel-width.ts` has.
 *
 * Stored as one JSON value under one key. Its neighbours are scalar-per-key
 * (`colabdesk.panel.sidebarWidth`) because each is a single number; this is a
 * record that is only ever written whole, and a partial write is the one way it
 * could go wrong. `colabdesk.terminal.fontSize` is the key it replaces, and is
 * still read once so a size someone already chose survives the upgrade.
 *
 * Labels for themes and fonts are literals — they are other people's product
 * names and do not translate. Everything that is a word (`紧凑`, `方块`, `下划线`)
 * carries an i18n key instead.
 */

import type { ITerminalOptions } from "@xterm/xterm";

export const TERMINAL_THEME_IDS = [
  "titanium",
  "tokyo-night",
  "catppuccin",
  "one-dark",
  "dracula",
  "nord",
  "monokai",
] as const;

export type TerminalThemeId = (typeof TERMINAL_THEME_IDS)[number];

/**
 * The choices. `bundled` means the face ships with the app, so it can never be
 * missing and is never the one being asked about; the rest are only in the stack
 * if the machine has them, which is what settings says out loud.
 *
 * The bundled family is `Geist Mono Variable` — the name `@fontsource-variable`
 * registers — so it is in every stack. Naming a face that omits it would fall
 * past the fallback to whatever monospace the OS has, which is the one thing the
 * stacks exist to prevent.
 */
export const TERMINAL_FONTS = [
  {
    id: "geist-mono",
    label: "Geist Mono",
    bundled: true,
    stack: '"Geist Mono Variable", "Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  {
    id: "jetbrains-mono",
    label: "JetBrains Mono",
    bundled: false,
    stack: '"JetBrains Mono", "Geist Mono Variable", ui-monospace, monospace',
  },
  {
    id: "fira-code",
    label: "Fira Code",
    bundled: false,
    stack: '"Fira Code", "Geist Mono Variable", ui-monospace, monospace',
  },
  {
    id: "cascadia-code",
    label: "Cascadia Code",
    bundled: false,
    stack: '"Cascadia Code", "Geist Mono Variable", ui-monospace, monospace',
  },
] as const;

export type TerminalFontId = (typeof TERMINAL_FONTS)[number]["id"];

/** The bundled face is in every stack, so a missing system font still reads well. */
export function fontStackFor(fontId: TerminalFontId): string {
  return (TERMINAL_FONTS.find((font) => font.id === fontId) ?? TERMINAL_FONTS[0]).stack;
}

/**
 * `8`–`24`: the range the shortcut has always clamped to. The settings page
 * steps through it rather than offering a fixed list, so a size someone reached
 * with the keyboard stays representable.
 */
export const TERMINAL_FONT_SIZE = { min: 8, max: 24, step: 1, initial: 13 } as const;

export const TERMINAL_LINE_HEIGHTS = [1, 1.2, 1.35] as const;
export const TERMINAL_CURSOR_STYLES = ["block", "bar", "underline"] as const;
export const TERMINAL_PADDINGS = ["compact", "normal", "spacious"] as const;
export const TERMINAL_SCROLLBACKS = [5_000, 10_000, 20_000, 50_000] as const;

export type TerminalCursorStyle = (typeof TERMINAL_CURSOR_STYLES)[number];
export type TerminalPadding = (typeof TERMINAL_PADDINGS)[number];

export interface TerminalAppearance {
  themeId: TerminalThemeId;
  fontId: TerminalFontId;
  fontSize: number;
  lineHeight: number;
  cursorStyle: TerminalCursorStyle;
  cursorBlink: boolean;
  padding: TerminalPadding;
  scrollback: number;
}

/**
 * The terminal as it has always looked. Line height stays at xterm's `1.0` — the
 * design's preferred `1.2` is offered in settings, but making it the default
 * would reflow every existing terminal on the first launch after an upgrade, and
 * the grid of a running session is not ours to move.
 */
export const DEFAULT_TERMINAL_APPEARANCE: TerminalAppearance = {
  themeId: "titanium",
  fontId: "geist-mono",
  fontSize: TERMINAL_FONT_SIZE.initial,
  lineHeight: 1,
  cursorStyle: "block",
  cursorBlink: true,
  padding: "normal",
  scrollback: 10_000,
};

const STORAGE_KEY = "colabdesk.terminal.appearance";
const LEGACY_FONT_SIZE_KEY = "colabdesk.terminal.fontSize";

function pick<T>(allowed: readonly T[], value: unknown, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function numberIn(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, min), max) : fallback;
}

/**
 * Anything unreadable, out of range or written by an older build lands on the
 * nearest legal value instead of on a terminal nobody can read. Exported because
 * the test for this is the only cheap way to hold eight fields to their limits.
 */
export function normalizeTerminalAppearance(raw: unknown): TerminalAppearance {
  const value = (raw ?? {}) as Partial<Record<keyof TerminalAppearance, unknown>>;
  return {
    themeId: pick(TERMINAL_THEME_IDS, value.themeId, DEFAULT_TERMINAL_APPEARANCE.themeId),
    fontId: pick(
      TERMINAL_FONTS.map((font) => font.id),
      value.fontId,
      DEFAULT_TERMINAL_APPEARANCE.fontId,
    ),
    fontSize: numberIn(value.fontSize, TERMINAL_FONT_SIZE.min, TERMINAL_FONT_SIZE.max, DEFAULT_TERMINAL_APPEARANCE.fontSize),
    lineHeight: pick(TERMINAL_LINE_HEIGHTS, value.lineHeight, DEFAULT_TERMINAL_APPEARANCE.lineHeight),
    cursorStyle: pick(TERMINAL_CURSOR_STYLES, value.cursorStyle, DEFAULT_TERMINAL_APPEARANCE.cursorStyle),
    cursorBlink: typeof value.cursorBlink === "boolean" ? value.cursorBlink : DEFAULT_TERMINAL_APPEARANCE.cursorBlink,
    padding: pick(TERMINAL_PADDINGS, value.padding, DEFAULT_TERMINAL_APPEARANCE.padding),
    scrollback: pick(TERMINAL_SCROLLBACKS, value.scrollback, DEFAULT_TERMINAL_APPEARANCE.scrollback),
  };
}

/** The size the preference was stored under before this record existed. */
function readLegacyFontSize(): number | null {
  try {
    const stored = Number.parseInt(localStorage.getItem(LEGACY_FONT_SIZE_KEY) ?? "", 10);
    return Number.isFinite(stored) && stored >= TERMINAL_FONT_SIZE.min && stored <= TERMINAL_FONT_SIZE.max
      ? stored
      : null;
  } catch {
    return null;
  }
}

export function readTerminalAppearance(): TerminalAppearance {
  let stored: unknown = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    stored = raw === null ? null : JSON.parse(raw);
  } catch {
    // Unreadable or disabled storage: the defaults are the answer, as elsewhere.
    stored = null;
  }
  if (stored !== null) return normalizeTerminalAppearance(stored);

  const legacy = readLegacyFontSize();
  return legacy === null
    ? DEFAULT_TERMINAL_APPEARANCE
    : { ...DEFAULT_TERMINAL_APPEARANCE, fontSize: legacy };
}

export function saveTerminalAppearance(appearance: TerminalAppearance): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance));
  } catch {
    // ignore storage quota/disabled errors
  }
}

/**
 * The hot path: an appearance change is written onto the live terminal, and
 * nothing here touches the connection. Only what changed is assigned — xterm
 * clears the screen and re-measures for each of the typography options, so
 * writing all of them on every change would clear six times to move one pixel.
 *
 * The theme is not here: it comes from the stylesheet, and the module that reads
 * it owns that. Padding is a stylesheet rule too, driven by the attribute.
 */
export function applyTerminalAppearance(
  target: { options: Partial<ITerminalOptions> },
  next: TerminalAppearance,
  previous: TerminalAppearance | null,
): void {
  const options = target.options;
  const changed = <K extends keyof TerminalAppearance>(key: K): boolean =>
    previous === null || previous[key] !== next[key];

  if (changed("fontId")) options.fontFamily = fontStackFor(next.fontId);
  if (changed("fontSize")) options.fontSize = next.fontSize;
  if (changed("lineHeight")) options.lineHeight = next.lineHeight;
  if (changed("cursorStyle")) options.cursorStyle = next.cursorStyle;
  if (changed("cursorBlink")) options.cursorBlink = next.cursorBlink;
  if (changed("scrollback")) options.scrollback = next.scrollback;
}

/** Whether the change moved the grid, which is what needs a `fit()` afterwards. */
export function changesGrid(next: TerminalAppearance, previous: TerminalAppearance | null): boolean {
  return (
    previous === null ||
    previous.fontId !== next.fontId ||
    previous.fontSize !== next.fontSize ||
    previous.lineHeight !== next.lineHeight ||
    previous.padding !== next.padding
  );
}
