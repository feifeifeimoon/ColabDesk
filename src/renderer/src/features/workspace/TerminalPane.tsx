import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import type { ConnectionState } from "@shared/types";
import {
  closeTerminal,
  messageOf,
  onTerminalClosed,
  onTerminalData,
  openTerminal,
  readClipboard,
  resizeTerminal,
  writeClipboard,
  writeTerminal,
} from "../../lib/api";
import { applyTerminalAppearance, changesGrid, fontStackFor } from "../../lib/terminal-appearance";
import { readTerminalPalette } from "../../lib/terminal-theme";
import { useAppStore } from "../../store";
import { Button } from "../../components/ui/Button";

function decodeBase64(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * How much output an unclaimed pane will hold on to. The window it defends is a
 * round trip wide, so anything near this is a bug rather than a burst.
 */
const UNCLAIMED_LIMIT = 256 * 1024;

/**
 * One shell on a session's connection, filling part of the middle column.
 *
 * A pane outlives its turn on screen: every open tab keeps one mounted, and the
 * parked ones keep their shell and their scrollback. That is why "am I the
 * visible one" is asked at event time — fitting a pane that is out of the
 * layout would measure zero and push a nonsense window size to the remote PTY,
 * and a parked pane that grabbed the keyboard would swallow the copy the
 * visible one should get.
 *
 * Output is routed by channel, but a pane does not know its channel until the
 * open round trip finishes — and the shell's first bytes can beat that. So
 * anything arriving before the claim is filed by channel and only the claimed
 * one is flushed: the first prompt is kept, and a sibling tab's banner is not.
 *
 * The keys follow terminal convention rather than app convention: copy and
 * paste need a modifier (plain Ctrl+C must stay SIGINT), a right click copies
 * the selection or pastes, and Ctrl+Shift+± resizes the font.
 *
 * How it looks is a global preference the pane subscribes to itself: colours,
 * type, cursor and buffer are read from the store here rather than threaded down
 * from the workbench, so changing one repaints the panes once and leaves the
 * rest of the window alone. None of it may restart the shell.
 */
export function TerminalPane({
  session,
  active,
}: {
  session: string;
  /** The pane the user is looking at; the others stay mounted but parked. */
  active: boolean;
}) {
  const { t } = useTranslation();
  const appearance = useAppStore((state) => state.terminal);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const channelRef = useRef<number | null>(null);
  const unclaimed = useRef(new Map<number, Uint8Array[]>());
  const unclaimedBytes = useRef(0);
  const unclaimedClosed = useRef(new Set<number>());
  /** What the pane's terminal is already wearing, so a change applies once. */
  const applied = useRef<typeof appearance | null>(null);
  const [state, setState] = useState<ConnectionState>("connecting");
  const [error, setError] = useState<string | null>(null);
  /** Bumped by the retry button; re-runs the connect effect. */
  const [attempt, setAttempt] = useState(0);

  /** What the handlers below need, read when they run rather than when they were made. */
  const latest = useRef({ active, appearance });
  useEffect(() => {
    latest.current = { active, appearance };
  });

  const markClosed = useCallback((): void => {
    channelRef.current = null;
    const banner = t("terminal.connectionClosedBanner", "[连接已断开]");
    terminalRef.current?.write(`\r\n\x1b[90m${banner}\x1b[0m\r\n`);
    setState("closed");
  }, [t]);

  useEffect(() => {
    const offData = onTerminalData(({ channelId, session: from, data }) => {
      if (from !== session) return;
      const bytes = decodeBase64(data);

      if (channelRef.current === null) {
        const pending = unclaimed.current.get(channelId) ?? [];
        pending.push(bytes);
        unclaimed.current.set(channelId, pending);
        unclaimedBytes.current += bytes.length;
        if (unclaimedBytes.current > UNCLAIMED_LIMIT) {
          unclaimed.current.clear();
          unclaimedBytes.current = 0;
        }
        return;
      }
      if (channelId !== channelRef.current) return;
      terminalRef.current?.write(bytes);
    });

    const offClosed = onTerminalClosed(({ channelId, session: from }) => {
      if (from !== session) return;
      if (channelRef.current === null) {
        unclaimedClosed.current.add(channelId);
        return;
      }
      if (channelId !== channelRef.current) return;
      markClosed();
    });

    return () => {
      offData();
      offClosed();
      unclaimed.current.clear();
      unclaimedBytes.current = 0;
      unclaimedClosed.current.clear();
    };
  }, [markClosed, session]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    const opening = latest.current.appearance;
    const terminal = new Terminal({
      theme: readTerminalPalette(),
      fontFamily: fontStackFor(opening.fontId),
      fontSize: opening.fontSize,
      lineHeight: opening.lineHeight,
      cursorStyle: opening.cursorStyle,
      cursorBlink: opening.cursorBlink,
      scrollback: opening.scrollback,
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host);
    terminalRef.current = terminal;
    fitRef.current = fit;
    applied.current = opening;
    if (latest.current.active) {
      try {
        fit.fit();
      } catch {
        // Zero-sized during the first paint; the observer below fits it.
      }
      terminal.focus();
    }

    const send = (data: string) => {
      const channelId = channelRef.current;
      if (channelId !== null) void writeTerminal(channelId, data);
    };

    const copySelection = () => {
      const selection = terminal.getSelection();
      if (selection) void writeClipboard(selection);
      return selection.length > 0;
    };

    const paste = async () => {
      const text = await readClipboard();
      if (text) send(text);
    };

    /** One write path for the font size; the record's limits do the clamping. */
    const resizeFont = (step: number): void => {
      const { fontSize } = latest.current.appearance;
      useAppStore.getState().setTerminalAppearance({ fontSize: fontSize + step });
    };

    // Terminal-convention keys, intercepted before xterm turns them into input:
    // plain Ctrl+C must stay SIGINT, so copy/paste need the Shift modifier.
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") return true;
      const withShift = (event.ctrlKey || event.metaKey) && event.shiftKey;
      if (withShift && event.code === "KeyC") {
        copySelection();
        return false;
      }
      if (withShift && event.code === "KeyV") {
        void paste();
        return false;
      }
      if (withShift && (event.code === "Equal" || event.code === "NumpadAdd")) {
        resizeFont(1);
        return false;
      }
      if (withShift && (event.code === "Minus" || event.code === "NumpadSubtract")) {
        resizeFont(-1);
        return false;
      }
      return true;
    });

    // A macOS-style Cmd+C/V also copies and pastes, since there is no Ctrl there.
    // Gated on visibility: this listens on the window, so every parked pane
    // would otherwise answer and the first one would swallow the event.
    const onMacCopy = (event: KeyboardEvent) => {
      if (!latest.current.active) return;
      if (!event.metaKey || event.shiftKey) return;
      if (event.code === "KeyC") {
        copySelection();
        event.preventDefault();
      } else if (event.code === "KeyV") {
        void paste();
        event.preventDefault();
      }
    };
    if (navigator.userAgent.includes("Mac")) window.addEventListener("keydown", onMacCopy);

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      if (!copySelection()) void paste();
    };
    host.addEventListener("contextmenu", onContextMenu);

    terminal.onData(send);
    terminal.onResize(({ cols, rows }) => {
      const channelId = channelRef.current;
      if (channelId !== null) void resizeTerminal(channelId, cols, rows);
    });

    const observer = new ResizeObserver(() => {
      // A parked pane measures 0×0. It refits when it comes back into view,
      // which is also the only moment its grid matters.
      if (!latest.current.active) return;
      try {
        fit.fit();
      } catch {
        // ignore transient sizes
      }
    });
    observer.observe(host);

    setState("connecting");
    setError(null);
    terminal.writeln(`\x1b[90m${t("terminal.connecting", "正在连接 {{session}} …", { session })}\x1b[0m`);

    openTerminal(session, terminal.cols, terminal.rows)
      .then((handle) => {
        if (disposed) {
          void closeTerminal(handle.channelId);
          return;
        }
        channelRef.current = handle.channelId;
        if (unclaimedClosed.current.has(handle.channelId)) {
          markClosed();
          return;
        }
        setState("ready");
        // Whatever this shell said before we knew its channel is ours; a
        // sibling tab's is not, and stays behind.
        for (const chunk of unclaimed.current.get(handle.channelId) ?? []) terminal.write(chunk);
        unclaimed.current.clear();
        unclaimedBytes.current = 0;
        // Land where the runtime keeps its files, like the CLI's own ssh mode.
        void writeTerminal(handle.channelId, "cd /content 2>/dev/null\n");
      })
      .catch((cause) => {
        if (disposed) return;
        const message = messageOf(cause);
        setState("error");
        setError(message);
        terminal.writeln(`\x1b[31m${t("terminal.connectionFailed", "连接失败：{{message}}", { message })}\x1b[0m`);
      });

    return () => {
      disposed = true;
      observer.disconnect();
      host.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onMacCopy);
      const channelId = channelRef.current;
      channelRef.current = null;
      if (channelId !== null) void closeTerminal(channelId);
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
      applied.current = null;
    };
    // fontSize and visibility are applied by the effects below: neither may
    // restart the shell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, attempt]);

  // Appearance is injected into the live terminal rather than applied by
  // rebuilding it: the shell, its scrollback and whatever it is running all stay
  // put. Only the panes that are on screen re-fit — a parked pane measures 0×0,
  // and fitting one would push a nonsense window size to the remote PTY. Focus
  // is left alone for the same reason it is handed over when settings opens: the
  // user asked for a colour, not for the keyboard.
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    const previous = applied.current;
    applied.current = appearance;

    applyTerminalAppearance(terminal, appearance, previous);
    if (previous === null || previous.themeId !== appearance.themeId) {
      // Read after the store switched the attribute, so this is the new palette.
      terminal.options.theme = readTerminalPalette();
    }
    if (!changesGrid(appearance, previous)) return;
    if (!latest.current.active) return;
    try {
      fitRef.current?.fit();
    } catch {
      // ignore transient sizes
    }
  }, [appearance]);

  // Back into view: the pane was out of the layout, so it neither repainted nor
  // followed the window's size while it was parked.
  useEffect(() => {
    if (!active) return;
    const terminal = terminalRef.current;
    if (!terminal) return;
    try {
      fitRef.current?.fit();
    } catch {
      // ignore transient sizes
    }
    // Output written while hidden updates the buffer without ever being
    // presented, and a fit that lands on the same grid does not repaint either.
    terminal.refresh(0, terminal.rows - 1);
    terminal.focus();
  }, [active]);

  return (
    <div
      className="terminal-area"
      data-terminal-padding={appearance.padding}
      hidden={!active}
      inert={!active}
    >
      <div className="terminal-host" ref={hostRef} />
      {(state === "error" || state === "closed") && (
        <div className="terminal-notice">
          <div className="row">
            {/* The reason is already written into the terminal; this bar is only
                the way back. */}
            <span className="hint">{t("terminal.connectionClosedNotice", "连接已断开。")}</span>
            <Button
              size="sm"
              variant="outline"
              title={error ?? undefined}
              onClick={() => setAttempt((value) => value + 1)}
            >
              {t("terminal.retryConnection", "重试连接")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
