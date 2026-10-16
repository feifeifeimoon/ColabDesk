/**
 * Answering the "what colour is your background?" queries (OSC 10 and 11).
 *
 * Tools that draw for a terminal — `bat`, `delta`, `eza`, `gh`, `fzf` — ask
 * before choosing a palette, and xterm 6.0.0 has nobody to answer: its own
 * handlers fire an event and stop (it ships the formatter, `toRgbString`, with no
 * callers), so every one of them falls back to its dark default. On the light
 * palettes that is the whole failure — light-background output drawn for a dark
 * one.
 *
 * Handlers for one identifier run newest first and stop at the first that returns
 * true, while xterm's own is registered first at construction — so registering
 * here puts this in front of it. Only a *query* is answered; a set
 * (`\x1b]11;rgb:…`) returns false and falls through to xterm's handler.
 */

import type { IDisposable, ITheme } from "@xterm/xterm";
import { readTerminalPalette } from "./terminal-theme";

const OSC_FOREGROUND = 10;
const OSC_BACKGROUND = 11;

/**
 * What answering needs from a terminal — the hook and the mouth, not the whole
 * `Terminal`. Narrow on purpose: a test can then hand it three lines instead of
 * a browser-sized object.
 */
export interface ColorQueryHost {
  parser: {
    registerOscHandler(
      ident: number,
      callback: (data: string) => boolean | Promise<boolean>,
    ): IDisposable;
  };
  input(data: string, wasUserInput?: boolean): void;
}

/**
 * `#1a1b26` → `1a1b/1a1b/1a1b`. Four hex digits per channel is what xterm's own
 * formatter emits, and every parser in the wild takes one to four.
 */
function rgbChannels(hex: string): string | null {
  const value = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(value)) return null;
  return [0, 2, 4].map((at) => value.slice(at, at + 2).repeat(2)).join("/");
}

/**
 * Hooks OSC 10 and 11 onto the terminal and answers from the palette on screen
 * at the moment of the question — the theme can change while a session runs, and
 * a program that asked about the old one would be told the wrong colour.
 */
export function answerColorQueries(
  host: ColorQueryHost,
  palette: () => ITheme = readTerminalPalette,
): IDisposable {
  const answer = (ident: number, color: string | undefined): boolean => {
    const channels = color === undefined ? null : rgbChannels(color);
    // A colour this cannot format is left unanswered rather than answered
    // wrongly: the tool then falls back exactly as it does today.
    if (channels === null) return true;
    // `false` for "not user input": this is an escape sequence on its way to the
    // program, not a keystroke — it must not clear the selection or scroll.
    host.input(`\x1b]${ident};rgb:${channels}\x1b\\`, false);
    return true;
  };

  const handlers = [
    host.parser.registerOscHandler(OSC_BACKGROUND, (data) =>
      data === "?" ? answer(OSC_BACKGROUND, palette().background) : false,
    ),
    host.parser.registerOscHandler(OSC_FOREGROUND, (data) =>
      data === "?" ? answer(OSC_FOREGROUND, palette().foreground) : false,
    ),
  ];

  return {
    dispose: () => {
      for (const handler of handlers) handler.dispose();
    },
  };
}
