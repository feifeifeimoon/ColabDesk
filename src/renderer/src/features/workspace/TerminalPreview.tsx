/**
 * The settings sandbox: what the knobs around it do, drawn by the terminal that
 * will do it.
 *
 * Read-only by construction — no IPC, no shell, `disableStdin`, and the frame is
 * `inert` so it cannot take the keyboard the settings page is holding. It is one
 * more terminal rather than a mock-up: the same options and the same palette go
 * in through the same two modules the panes use, so the two cannot drift.
 *
 * The palette is a prop, not the live one: settings shows one set at a time and
 * hands this sandbox the set being edited, so choosing a palette for the mode
 * the app is not currently in is still visible. The wrapper carries
 * `data-terminal-theme`, so the palette's variables resolve here without
 * touching the document root the panes read.
 *
 * The cursor is the one thing a read-only terminal does not draw for itself:
 * xterm leaves it uninitialized until the terminal takes focus, so the sandbox
 * seeds that state with a buffer round trip, wears the chosen shape through
 * `cursorInactiveStyle`, and lets the stylesheet blink it (xterm's own blink
 * only runs while focused). The cursor is left on the sample's last line, which
 * is what makes it fall inside the frame instead of one row below it.
 *
 * The sample output is deliberately un-translated. It is a terminal, and a
 * terminal speaks the language the machine speaks.
 */

import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import "@xterm/xterm/css/xterm.css";
import {
  applyTerminalAppearance,
  changesGrid,
  fontStackFor,
  isLightPalette,
  type TerminalAppearance,
  type TerminalThemeId,
} from "../../lib/terminal-appearance";
import { readTerminalPalette } from "../../lib/terminal-theme";
import { useAppStore } from "../../store";

/** A session's output, from the prompt down: the palette is proven by the strips
    in the palette panel, not by a swatch row the terminal itself never prints. */
const SAMPLE = [
  "\x1b[32mroot@colab-v100\x1b[0m:\x1b[34m/content\x1b[0m# python train.py",
  "[12:30:15] \x1b[36mINFO\x1b[0m    loading dataset…",
  "[12:30:17] \x1b[32mSUCCESS\x1b[0m model loaded (V100 16G)",
  "",
  "\x1b[90m>>>\x1b[0m import torch",
  "\x1b[90m>>>\x1b[0m x = torch.randn(3, 3).cuda()",
  "\x1b[90m>>>\x1b[0m print(x.device)",
  "cuda:0",
  "",
  "epoch 1/10 \x1b[33m100%\x1b[0m|██████████| loss: \x1b[35m0.1428\x1b[0m",
];

/**
 * The short variant, for a grid that cannot hold the full sample. It keeps the
 * prompt and one line of each kind, and stays under 32 columns so it does not
 * wrap at the largest type size.
 */
const COMPACT_SAMPLE = [
  "\x1b[32mroot@colab-v100\x1b[0m:\x1b[34m/content\x1b[0m# ",
  "[12:30:17] \x1b[32mSUCCESS\x1b[0m model loaded",
  "\x1b[90m>>>\x1b[0m print(x.device)",
  "cuda:0",
];

/** What fits this grid, from the top: the full sample, or the short one. */
function sampleFor(terminal: Terminal): readonly string[] {
  // The full sample's longest line plus its cursor is 46 columns; below that it
  // would wrap and push the opening prompt out of view.
  const lines = terminal.cols >= 48 ? SAMPLE : COMPACT_SAMPLE;
  const visible = lines.slice(0, Math.max(1, terminal.rows));
  // A slice can end on a blank spacer; the cursor wants a line with text on it.
  while (visible.length > 1 && visible[visible.length - 1] === "") visible.pop();
  return visible;
}

/**
 * Writes the sample from the top, as much of it as the grid holds.
 *
 * It is re-written whenever the grid changes, and not only on mount: a larger
 * font fits fewer rows and columns, and the first line is the prompt that opens
 * the session — the sample reads as a session from there down. Writing more
 * than fits scrolls that opening away, which is the failure this function's
 * line count exists to prevent.
 *
 * The last line is written without a newline, so the cursor sits on the sample
 * rather than on the empty row below it — one row past the grid is a cursor
 * nobody can see, which is exactly what the cursor settings need to show.
 */
function paintSample(terminal: Terminal): void {
  // RIS, not terminal.reset(): reset() is synchronous but does not clear queued
  // writes, so a repaint that lands while the previous one is still being
  // parsed would append a second sample. RIS travels in the same queue as the
  // sample, so the clear lands between the two paints.
  terminal.write("\x1bc");
  const lines = sampleFor(terminal);
  lines.forEach((line, index) => {
    if (index === lines.length - 1) terminal.write(line);
    else terminal.writeln(line);
  });
}

/** The palette the wrapper wears, read where the row put it. */
function paletteOn(element: HTMLElement | null) {
  return readTerminalPalette((variable) =>
    element ? getComputedStyle(element).getPropertyValue(variable).trim() : "",
  );
}

export function TerminalPreview({ themeId }: { themeId: TerminalThemeId }) {
  const appearance = useAppStore((state) => state.terminal);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const applied = useRef<TerminalAppearance | null>(null);
  /**
   * The set this sandbox opened on. The mount effect must see it, but making it
   * a dependency would tear the terminal down and rebuild it on every palette
   * click; the effect below is what applies the later ones.
   */
  const openingTheme = useRef(themeId);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const opening = useAppStore.getState().terminal;
    // Read now rather than subscribed to: this effect builds the terminal once,
    // and a palette change is applied by the effect below instead of by
    // rebuilding the sandbox (which would re-run its resize observer).
    const terminal = new Terminal({
      theme: paletteOn(wrapperRef.current),
      minimumContrastRatio: isLightPalette(openingTheme.current) ? 4.5 : 1,
      fontFamily: fontStackFor(opening.fontId),
      fontSize: opening.fontSize,
      lineHeight: opening.lineHeight,
      cursorStyle: opening.cursorStyle,
      // The sandbox never takes focus, so xterm would otherwise draw its
      // inactive outline whatever shape was chosen.
      cursorInactiveStyle: opening.cursorStyle,
      cursorBlink: opening.cursorBlink,
      scrollback: 0,
      disableStdin: true,
      // Kept in step with the panes: same options, same addons, so the sandbox
      // cannot promise a width the terminal does not deliver.
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.loadAddon(new Unicode11Addon());
    terminal.unicode.activeVersion = "11";
    terminal.open(host);
    terminalRef.current = terminal;
    fitRef.current = fit;
    applied.current = opening;
    // xterm first draws a cursor when the terminal takes focus or switches
    // buffers; this sandbox is inert and disables input, so it never focuses.
    // The round trip is a no-op on the buffer and the one signal that makes the
    // cursor exist at all — without it the cursor settings have nothing to show.
    terminal.write("\x1b[?1049h\x1b[?1049l");

    // The section is unmounted while settings is closed, so this pane is laid
    // out on mount rather than resized into place. Fit first: the sample is
    // chosen from the rows and columns the grid actually has.
    const fitNow = (): void => {
      try {
        fit.fit();
      } catch {
        // ignore transient sizes
      }
    };
    fitNow();
    paintSample(terminal);

    const observer = new ResizeObserver(() => {
      fitNow();
      paintSample(terminal);
    });
    observer.observe(host);

    return () => {
      observer.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
      applied.current = null;
    };
  }, []);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    const previous = applied.current;
    applied.current = appearance;

    applyTerminalAppearance(terminal, appearance, previous);
    // The panes keep xterm's focused/inactive distinction; this sandbox is
    // inert, so the chosen shape is written into the inactive slot as well.
    terminal.options.cursorInactiveStyle = appearance.cursorStyle;
    if (!changesGrid(appearance, previous)) return;
    try {
      fitRef.current?.fit();
    } catch {
      // ignore transient sizes
    }
    paintSample(terminal);
  }, [appearance]);

  // The sandbox wears the set being edited, which can be the one the panes are
  // not wearing: the wrapper's attribute is the whole switch.
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.theme = paletteOn(wrapperRef.current);
    terminal.options.minimumContrastRatio = isLightPalette(themeId) ? 4.5 : 1;
  }, [themeId]);

  return (
    <div
      ref={wrapperRef}
      className="terminal-preview"
      data-terminal-padding={appearance.padding}
      data-terminal-theme={themeId}
      data-terminal-cursor-blink={appearance.cursorBlink ? "true" : "false"}
      inert
    >
      <div className="terminal-host" ref={hostRef} />
    </div>
  );
}
