import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import type { ConnectionState } from "@shared/types";
import {
  ackTerminal,
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
import { translate } from "../../i18n/i18n";
import { applyTerminalAppearance, changesGrid, fontStackFor, isLightPalette, type TerminalThemeId } from "../../lib/terminal-appearance";
import { answerColorQueries } from "../../lib/terminal-color-reply";
import { readTerminalPalette } from "../../lib/terminal-theme";
import { useAppStore } from "../../store";
import { Button } from "../../components/ui/Button";
import { TerminalSearchBar } from "./TerminalSearchBar";

/**
 * How much output an unclaimed pane will hold on to. The window it defends is a
 * round trip wide, so anything near this is a bug rather than a burst.
 */
const UNCLAIMED_LIMIT = 256 * 1024;

/**
 * How much parsed output is acknowledged in one message, and how long the last
 * bit of a burst may wait before it is acknowledged on its own. Both exist so
 * the main process learns that the backlog cleared without a message per write.
 */
const ACK_BATCH_BYTES = 64 * 1024;
const ACK_TAIL_MS = 150;

/** Pasted text is not allowed to carry the sequence that ends a bracketed paste. */
function withoutEscapes(text: string): string {
  return text.includes("\u001b") ? text.replaceAll("\u001b", "\u241b") : text;
}

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
 * The terminal and the shell it is connected to have separate lifetimes on
 * purpose: reconnecting opens a new shell in the same terminal, so the retry
 * button costs the connection and not the scrollback.
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
  const terminalThemeId = useAppStore((state) => state.terminalThemeId);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const channelRef = useRef<number | null>(null);
  const unclaimed = useRef(new Map<number, Uint8Array[]>());
  const unclaimedBytes = useRef(0);
  const unclaimedClosed = useRef(new Set<number>());
  /** What the pane's terminal is already wearing, so a change applies once. */
  const applied = useRef<typeof appearance | null>(null);
  /**
   * The palette the terminal is wearing. Separate from `applied` because it can
   * move while the appearance record sits perfectly still: following the app's
   * polarity is a change to the *resolved* id and nothing else.
   */
  const paletteApplied = useRef<TerminalThemeId | null>(null);
  const [state, setState] = useState<ConnectionState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  /** Bumped by the retry button; re-runs the connect effect. */
  const [attempt, setAttempt] = useState(0);

  /** What the handlers below need, read when they run rather than when they were made. */
  const latest = useRef({ active, appearance });
  useEffect(() => {
    latest.current = { active, appearance };
  });

  // Stable on purpose: this is a dependency of the shell effect, and a new
  // identity there would close the shell on a language switch.
  const markClosed = useCallback((): void => {
    channelRef.current = null;
    const banner = translate("terminal.connectionClosedBanner", "[连接已断开]");
    terminalRef.current?.write(`\r\n\x1b[90m${banner}\x1b[0m\r\n`);
    setState("closed");
  }, []);

  useEffect(() => {
    // The cleanup clears the same buffers this effect fills, so it takes them
    // once here rather than reading `.current` at teardown.
    const buffers = unclaimed.current;
    const closedIds = unclaimedClosed.current;

    const offData = onTerminalData(({ channelId, session: from, data }) => {
      if (from !== session) return;
      if (channelRef.current === null) {
        const pending = buffers.get(channelId) ?? [];
        pending.push(data);
        buffers.set(channelId, pending);
        unclaimedBytes.current += data.length;
        if (unclaimedBytes.current > UNCLAIMED_LIMIT) {
          buffers.clear();
          unclaimedBytes.current = 0;
        }
        return;
      }
      if (channelId !== channelRef.current) return;
      write(data);
    });

    const offClosed = onTerminalClosed(({ channelId, session: from }) => {
      if (from !== session) return;
      if (channelRef.current === null) {
        closedIds.add(channelId);
        return;
      }
      if (channelId !== channelRef.current) return;
      markClosed();
    });

    return () => {
      offData();
      offClosed();
      buffers.clear();
      unclaimedBytes.current = 0;
      closedIds.clear();
    };
  }, [markClosed, session]);

  /**
   * Output, and the acknowledgement that lets more of it through.
   *
   * The renderer is the side that knows how far behind it is, so it is the side
   * that reports: xterm calls back when the parser has consumed a write, and the
   * count goes to the main process in batches. Without it a command that prints
   * faster than the screen repaints would queue without limit on both sides.
   */
  const written = useRef(0);
  const ackTimer = useRef<number | null>(null);
  function write(data: Uint8Array): void {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.write(data, () => {
      const channelId = channelRef.current;
      if (channelId === null) return;
      written.current += data.length;
      if (written.current >= ACK_BATCH_BYTES) {
        flushAck();
        return;
      }
      if (ackTimer.current === null) ackTimer.current = window.setTimeout(flushAck, ACK_TAIL_MS);
    });
  }

  function flushAck(): void {
    if (ackTimer.current !== null) {
      window.clearTimeout(ackTimer.current);
      ackTimer.current = null;
    }
    const channelId = channelRef.current;
    if (channelId === null || written.current === 0) return;
    ackTerminal(channelId, written.current);
    written.current = 0;
  }

  // The terminal itself: built once per session, and kept across reconnects.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const opening = latest.current.appearance;
    const terminal = new Terminal({
      theme: readTerminalPalette(),
      // A palette drawn on a light background gets a contrast floor: yellow on
      // white is the light-terminal failure, and one number beats hand-tuning 16
      // colours. Dark palettes keep xterm's own default (1) — they are published
      // values, and correcting them at paint time would undo that.
      minimumContrastRatio: isLightPalette(terminalThemeId) ? 4.5 : 1,
      fontFamily: fontStackFor(opening.fontId),
      fontSize: opening.fontSize,
      lineHeight: opening.lineHeight,
      cursorStyle: opening.cursorStyle,
      cursorBlink: opening.cursorBlink,
      scrollback: opening.scrollback,
      // The width table the unicode11 addon installs is behind xterm's proposed
      // API. Wide characters are not optional in a terminal that shows Chinese
      // and emoji, so the flag is the price.
      allowProposedApi: true,
    });
    paletteApplied.current = terminalThemeId;
    const fit = new FitAddon();
    const search = new SearchAddon();
    terminal.loadAddon(fit);
    terminal.loadAddon(search);
    // Unicode 11 rather than the table xterm ships: emoji and the newer wide
    // characters take two cells, and a training log full of them otherwise
    // drifts a column per line.
    terminal.loadAddon(new Unicode11Addon());
    terminal.unicode.activeVersion = "11";
    // Links open in the system browser — the window's own handler decides that,
    // so nothing here reimplements it.
    terminal.loadAddon(new WebLinksAddon());
    terminal.open(host);
    terminalRef.current = terminal;
    fitRef.current = fit;
    searchRef.current = search;
    applied.current = opening;
    // `bat`, `delta`, `eza` and friends ask which background they are drawing on;
    // xterm has nobody to answer, so a light palette would get dark-assuming
    // output. The reply goes out through `onData` below, i.e. the same path a
    // keystroke takes, so it lands on this pane's channel and no other.
    const colorReply = answerColorQueries(terminal);
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

    /**
     * Through xterm's own paste, not straight into the shell: it normalizes the
     * line endings and, when the program asked for bracketed paste, wraps the
     * text so that the program can tell a paste from typing. Escape sequences
     * are shown rather than sent — a clipboard is not allowed to smuggle the
     * sequence that ends the paste.
     */
    const paste = async () => {
      const text = await readClipboard();
      if (text) terminal.paste(withoutEscapes(text));
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
      if (withShift && event.code === "KeyF") {
        setSearchOpen(true);
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

    return () => {
      observer.disconnect();
      host.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onMacCopy);
      if (ackTimer.current !== null) window.clearTimeout(ackTimer.current);
      colorReply.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
      searchRef.current = null;
      applied.current = null;
      paletteApplied.current = null;
    };
    // Appearance and visibility are applied by the effects below: neither may
    // restart the shell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // The shell: opened on mount, and reopened by the retry button into the same
  // terminal — a reconnect should not cost the scrollback of what already ran.
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal || !hostRef.current) return;

    let disposed = false;
    setState("connecting");
    setError(null);
    terminal.writeln(`\x1b[90m${translate("terminal.connecting", "正在连接 {{session}}…", { session })}\x1b[0m`);

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
        for (const chunk of unclaimed.current.get(handle.channelId) ?? []) write(chunk);
        unclaimed.current.clear();
        unclaimedBytes.current = 0;
      })
      .catch((cause) => {
        if (disposed) return;
        const message = messageOf(cause);
        setState("error");
        setError(message);
        terminal.writeln(`\x1b[31m${translate("terminal.connectionFailed", "连接失败：{{message}}", { message })}\x1b[0m`);
      });

    return () => {
      disposed = true;
      const channelId = channelRef.current;
      channelRef.current = null;
      written.current = 0;
      if (channelId !== null) void closeTerminal(channelId);
    };
    // `t` is deliberately not a dependency: react-i18next hands back a new
    // function when the language changes, and re-running this effect would
    // close every shell the user is running work in.
  }, [session, attempt, markClosed]);

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
    if (!changesGrid(appearance, previous)) return;
    if (!latest.current.active) return;
    try {
      fitRef.current?.fit();
    } catch {
      // ignore transient sizes
    }
  }, [appearance]);

  // The palette follows the *resolved* id rather than the record: with the
  // terminal set to follow the app, flipping the interface's polarity changes the
  // palette while the record it came from sits still.
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    if (paletteApplied.current === terminalThemeId) return;
    paletteApplied.current = terminalThemeId;

    // Read after the store switched the attribute, so this is the new palette.
    terminal.options.theme = readTerminalPalette();
    // In xterm's re-measure list: written only when it really changes, or the
    // grid is cleared and re-measured (and the remote PTY told) for nothing.
    terminal.options.minimumContrastRatio = isLightPalette(terminalThemeId) ? 4.5 : 1;
  }, [terminalThemeId]);

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

  /**
   * Search walks the buffer and selects what it finds. No decorations: the
   * addon's own highlight is the terminal's selection colour, which every one of
   * the seven palettes already defines — a second set of invented colours would
   * be one more thing to keep legible on all of them.
   */
  function find(direction: "next" | "previous"): void {
    const search = searchRef.current;
    if (!search || !query) return;
    if (direction === "next") search.findNext(query);
    else search.findPrevious(query);
  }

  return (
    <div
      className="terminal-area"
      data-terminal-padding={appearance.padding}
      hidden={!active}
      inert={!active}
    >
      {searchOpen && (
        <TerminalSearchBar
          value={query}
          onChange={setQuery}
          onSubmit={() => find("next")}
          onNext={() => find("next")}
          onPrevious={() => find("previous")}
          onClose={() => {
            setSearchOpen(false);
            searchRef.current?.clearDecorations();
            terminalRef.current?.focus();
          }}
        />
      )}
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
