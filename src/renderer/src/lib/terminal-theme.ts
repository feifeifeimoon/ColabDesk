/**
 * The terminal's palette: one attribute on `<html>`, 21 CSS variables, and the
 * `ITheme` xterm actually needs.
 *
 * The colours live in `assets/terminal-themes.css` — the design system keeps
 * every colour in CSS and forbids hex in component code — so resolving a palette
 * means reading back the variables the remembered theme put on the root element.
 * That is also what makes the pane's frame and xterm's canvas agree by
 * construction: both take `--terminal-bg`, one through CSS, one through here.
 *
 * A palette is applied by switching the attribute and reading it back, in that
 * order; a reader that runs first would hand xterm the previous theme.
 */

import type { ITheme } from "@xterm/xterm";
import type { TerminalThemeId } from "./terminal-appearance";

/**
 * The channels a palette declares, in xterm's own vocabulary. One table serves
 * three callers: the resolver below, the test that parses the stylesheet, and
 * anyone reading this file to find out what a theme is made of.
 */
const PALETTE: readonly (readonly [keyof ITheme, string])[] = [
  ["background", "--terminal-bg"],
  ["foreground", "--terminal-fg"],
  ["cursor", "--terminal-cursor"],
  ["cursorAccent", "--terminal-cursor-accent"],
  ["selectionBackground", "--terminal-selection"],
  ["black", "--terminal-ansi-black"],
  ["red", "--terminal-ansi-red"],
  ["green", "--terminal-ansi-green"],
  ["yellow", "--terminal-ansi-yellow"],
  ["blue", "--terminal-ansi-blue"],
  ["magenta", "--terminal-ansi-magenta"],
  ["cyan", "--terminal-ansi-cyan"],
  ["white", "--terminal-ansi-white"],
  ["brightBlack", "--terminal-ansi-bright-black"],
  ["brightRed", "--terminal-ansi-bright-red"],
  ["brightGreen", "--terminal-ansi-bright-green"],
  ["brightYellow", "--terminal-ansi-bright-yellow"],
  ["brightBlue", "--terminal-ansi-bright-blue"],
  ["brightMagenta", "--terminal-ansi-bright-magenta"],
  ["brightCyan", "--terminal-ansi-bright-cyan"],
  ["brightWhite", "--terminal-ansi-bright-white"],
];

/** Every variable a stylesheet block has to declare to be a complete palette. */
export const TERMINAL_THEME_VARIABLES: readonly string[] = PALETTE.map(([, variable]) => variable);

/** Where the palette is switched. Read by the stylesheet, so it switches there too. */
export function applyTerminalThemeAttribute(themeId: TerminalThemeId): void {
  document.documentElement.dataset.terminalTheme = themeId;
}

/** What the resolver reads through; a test hands it a map instead of the DOM. */
export type PaletteReader = (variable: string) => string;

const readRootVariable: PaletteReader = (variable) =>
  getComputedStyle(document.documentElement).getPropertyValue(variable).trim();

/** The one literal here: the value the terminal has always fallen back to. */
const LAST_RESORT_FOREGROUND = "#ededed";

/**
 * The palette currently switched on. A channel that is missing resolves to the
 * theme's own foreground rather than to nothing: xterm fills a missing colour
 * from its built-in Tango palette, which is tuned for a *light* background, so
 * "draw it as ordinary text" is the honest failure — visibly monochrome instead
 * of quietly muddy. `terminal-theme.test.ts` parses the stylesheet and makes the
 * case unreachable.
 */
export function readTerminalPalette(read: PaletteReader = readRootVariable): ITheme {
  const foreground = read("--terminal-fg") || LAST_RESORT_FOREGROUND;

  const theme: Record<string, string> = {};
  for (const [channel, variable] of PALETTE) {
    theme[channel] = read(variable) || foreground;
  }
  return theme as ITheme;
}
