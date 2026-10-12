/**
 * The palettes themselves.
 *
 * These colours live in a stylesheet, so the assertions read the stylesheet: a
 * theme that lost a channel, or that grew a value xterm cannot parse, would
 * otherwise ship as "some output is muddy" rather than as a failure.
 */

import { describe, expect, it } from "vitest";
import css from "../assets/terminal-themes.css?raw";
import { TERMINAL_THEME_IDS } from "./terminal-appearance";
import { TERMINAL_THEME_VARIABLES, readTerminalPalette } from "./terminal-theme";

/**
 * The declarations of each `[data-terminal-theme="…"]` block. `titanium` shares
 * its block with `:root`, which is why the pattern looks for the attribute
 * rather than for the start of the rule.
 */
function palettes(): Map<string, string> {
  const found = new Map<string, string>();
  const blocks = /\[data-terminal-theme="([a-z-]+)"\]\s*\{([^}]*)\}/g;
  let block: RegExpExecArray | null;
  while ((block = blocks.exec(css)) !== null) found.set(block[1], block[2]);
  return found;
}

function declared(body: string): Map<string, string> {
  const found = new Map<string, string>();
  const declarations = /(--terminal-[a-z-]+):\s*([^;]+);/g;
  let declaration: RegExpExecArray | null;
  while ((declaration = declarations.exec(body)) !== null) {
    found.set(declaration[1], declaration[2].trim());
  }
  return found;
}

describe("the palette stylesheet", () => {
  const blocks = palettes();

  it("defines exactly the themes the app offers", () => {
    expect([...blocks.keys()].sort()).toEqual([...TERMINAL_THEME_IDS].sort());
  });

  it("declares every channel in every theme", () => {
    for (const [theme, body] of blocks) {
      expect([...declared(body).keys()].sort(), theme).toEqual([...TERMINAL_THEME_VARIABLES].sort());
    }
  });

  it("uses plain hex, which is what xterm parses", () => {
    // `color-mix()` in a custom property stays a token stream at computed-value
    // time: xterm would reject it and quietly keep its own light-background
    // colour, which is the failure this whole feature removes.
    for (const [theme, body] of blocks) {
      for (const [variable, value] of declared(body)) {
        expect(value, `${theme} ${variable}`).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it("keeps black and the dim grey distinct, so dimmed output stays dim", () => {
    for (const [theme, body] of blocks) {
      const channels = declared(body);
      expect(channels.get("--terminal-ansi-black"), theme).not.toBe(
        channels.get("--terminal-ansi-bright-black"),
      );
    }
  });
});

describe("resolving a palette for xterm", () => {
  const reader = (values: Record<string, string>) => (variable: string) => values[variable] ?? "";

  it("reads all 21 channels through", () => {
    const values = Object.fromEntries(
      TERMINAL_THEME_VARIABLES.map((variable, index) => [variable, `#${index.toString(16).padStart(6, "0")}`]),
    );
    const theme = readTerminalPalette(reader(values));

    expect(Object.values(theme)).toHaveLength(21);
    expect(Object.values(theme).every((value) => typeof value === "string" && value.length > 0)).toBe(true);
    expect(theme.background).toBe(values["--terminal-bg"]);
    expect(theme.brightWhite).toBe(values["--terminal-ansi-bright-white"]);
  });

  it("draws a channel the stylesheet forgot as ordinary text, not as Tango", () => {
    const theme = readTerminalPalette(reader({ "--terminal-fg": "#ededed" }));

    // xterm fills a missing colour from its built-in palette, which is tuned for
    // a light background — the one answer that must never come back.
    expect(theme.red).toBe("#ededed");
    expect(theme.brightBlue).toBe("#ededed");
  });

  it("has an answer even with no palette at all", () => {
    const theme = readTerminalPalette(reader({}));
    expect(theme.background).toBe("#ededed");
  });
});
