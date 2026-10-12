/**
 * The settings sandbox: what the knobs above do, drawn by the terminal that will
 * do it.
 *
 * Read-only by construction — no IPC, no shell, `disableStdin`, and the frame is
 * `inert` so it cannot take the keyboard the settings page is holding. It is one
 * more terminal rather than a mock-up: the same options and the same palette go
 * in through the same two modules the panes use, so the two cannot drift.
 *
 * The sample output is deliberately un-translated. It is a terminal, and a
 * terminal speaks the language the machine speaks.
 */

import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { applyTerminalAppearance, changesGrid, fontStackFor, type TerminalAppearance } from "../../lib/terminal-appearance";
import { readTerminalPalette } from "../../lib/terminal-theme";
import { useAppStore } from "../../store";

/** Every channel the palette defines, then the output it exists to colour. */
const SAMPLE = [
  "\x1b[30m●\x1b[0m \x1b[31m●\x1b[0m \x1b[32m●\x1b[0m \x1b[34m●\x1b[0m \x1b[35m●\x1b[0m \x1b[36m●\x1b[0m \x1b[37m●\x1b[0m \x1b[90m●\x1b[0m \x1b[91m●\x1b[0m \x1b[92m●\x1b[0m \x1b[94m●\x1b[0m \x1b[95m●\x1b[0m \x1b[96m●\x1b[0m \x1b[97m●\x1b[0m",
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
 * Writes the sample from the top.
 *
 * It is re-written whenever the grid changes, and not only on mount: a larger
 * font fits fewer rows, and the first line — the one row that shows all 14
 * channels — is the whole reason the sample starts where it starts. Letting it
 * scroll away would leave the sandbox showing the part that proves least.
 */
function paintSample(terminal: Terminal): void {
  terminal.reset();
  for (const line of SAMPLE) terminal.writeln(line);
}

export function TerminalPreview() {
  const appearance = useAppStore((state) => state.terminal);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const applied = useRef<TerminalAppearance | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const opening = useAppStore.getState().terminal;
    const terminal = new Terminal({
      theme: readTerminalPalette(),
      fontFamily: fontStackFor(opening.fontId),
      fontSize: opening.fontSize,
      lineHeight: opening.lineHeight,
      cursorStyle: opening.cursorStyle,
      cursorBlink: opening.cursorBlink,
      scrollback: 0,
      disableStdin: true,
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host);
    terminalRef.current = terminal;
    fitRef.current = fit;
    applied.current = opening;
    paintSample(terminal);

    // The section is unmounted while settings is closed, so this pane is laid
    // out on mount rather than resized into place.
    const observer = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        // ignore transient sizes
      }
    });
    observer.observe(host);
    try {
      fit.fit();
    } catch {
      // ignore transient sizes
    }

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
    if (previous === null || previous.themeId !== appearance.themeId) {
      terminal.options.theme = readTerminalPalette();
    }
    if (!changesGrid(appearance, previous)) return;
    try {
      fitRef.current?.fit();
    } catch {
      // ignore transient sizes
    }
    paintSample(terminal);
  }, [appearance]);

  return (
    <div className="terminal-preview" data-terminal-padding={appearance.padding} inert>
      <div className="terminal-host" ref={hostRef} />
    </div>
  );
}
