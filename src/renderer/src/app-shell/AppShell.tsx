import type { Session } from "@shared/types";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, IconButton } from "../components/ui/Button";
import {
  ActivityIcon,
  CloseIcon,
  CloseWindowIcon,
  MaximizeIcon,
  MinimizeIcon,
  PanelLeftIcon,
  PanelRightIcon,
  SettingsIcon,
  PlusIcon,
  RestoreIcon,
  SyncIcon,
  TerminalIcon,
} from "../components/ui/icons";
import { closeWindow, minimizeWindow, onWindowMaximized, toggleMaximizeWindow } from "../lib/api";
import { acceleratorLabel, sessionRate, sessionRateText } from "../features/sessions/accelerators";
import { useAppStore } from "../store";
import { useHasWorkSurface } from "../store/selectors";
import { BrandMark } from "./BrandMark";

/** macOS keeps its native traffic lights; everyone else gets ours. */
const IS_MAC = navigator.userAgent.includes("Mac");
/** Room for the traffic lights, which sit over the bar on macOS. */
const MAC_INSET = 78;

/**
 * The single top bar: it is the window's title bar too. Panel toggles sit at
 * both ends, the session tabs in the middle, and — on Windows and Linux, where
 * the OS frame is gone — the window controls at the far right.
 *
 * While settings is up, the two panel toggles stand down: they act on a layout
 * that is not on screen. The tabs stay, because they are the way back to a
 * terminal.
 */
export function TopBar() {
  const { t } = useTranslation();
  const sidebarOpen = useAppStore((state) => state.sidebarOpen);
  const filesOpen = useAppStore((state) => state.filesOpen);
  const settingsOpen = useAppStore((state) => state.settingsOpen);
  const tabs = useAppStore((state) => state.tabs);
  const selectedSession = useAppStore((state) => state.selectedSession);
  const activeTabId = useAppStore((state) => state.activeTabId);
  const hasWorkSurface = useHasWorkSurface();
  const toggleSidebar = useAppStore((state) => state.toggleSidebar);
  const openSettings = useAppStore((state) => state.openSettings);
  const signedOut = useAppStore((state) => state.env?.authenticated === false);
  const toggleFiles = useAppStore((state) => state.toggleFiles);
  const openTab = useAppStore((state) => state.openTab);
  // Closing a tab is a request, not an action: a file tab with unsaved edits
  // gets asked about first (see the workspace slice).
  const requestCloseTab = useAppStore((state) => state.requestCloseTab);
  const focusTab = useAppStore((state) => state.focusTab);
  const dirtyTabs = useAppStore((state) => state.dirtyTabs);
  const renameTab = useAppStore((state) => state.renameTab);

  // Renaming in place: one tab at a time, and the draft lives here rather than
  // in the store — nothing else can start an edit, so nothing else needs to see
  // it. `initial` is the name that was on screen when the edit opened, which is
  // what "did the user change it?" has to be measured against.
  const [renaming, setRenaming] = useState<{ id: string; draft: string; initial: string } | null>(
    null,
  );
  const renameCancelled = useRef(false);

  /**
   * Enter commits, losing focus commits, Escape cancels. Escape has to raise a
   * flag first: whether unmounting a focused input also fires blur is not
   * something to rely on across browsers (React routes blur through focusout),
   * and a stray commit there would save a draft the user threw away.
   */
  function commitRename(edit: { id: string; draft: string; initial: string }): void {
    if (renameCancelled.current) return;
    setRenaming(null);
    const next = edit.draft.trim();
    // Unchanged means "no name of mine": the default is a translated string, and
    // storing it would freeze this tab's label into the language of the moment.
    if (next === edit.initial.trim()) return;
    renameTab(edit.id, next === "" ? null : next);
  }

  // The strip is the selected session's workspace, so it shows that session's
  // shells and nothing else. Memoised rather than selected: a selector that
  // built this array would hand back a new reference on every store write.
  const sessionTabs = useMemo(
    () => tabs.filter((tab) => tab.session === selectedSession),
    [tabs, selectedSession],
  );

  return (
    <header
      className="topbar"
      onDoubleClick={(event) => {
        // Double-clicking a title bar maximizes — over the same surface that
        // drags it, i.e. everywhere the double click does not land on a control.
        const target = event.target as Element | null;
        if (!target?.closest("button, [role='tab'], .menu, input")) void toggleMaximizeWindow();
      }}
    >
      {/* The traffic lights sit over this corner on macOS, so the room for them
          is padding *inside* the section rather than on the bar: the section
          still ends where the rail does, which is what puts the tabs above the
          terminal and the seam on the column below. */}
      <div
        className="topbar__side"
        data-rail={!signedOut && (sidebarOpen || settingsOpen) ? "open" : "closed"}
        style={IS_MAC ? { paddingLeft: MAC_INSET } : undefined}
      >
        <span className="topbar__brand" title={t("topbar.brand", "ColabDesk")}>
          <BrandMark />
        </span>
        {/* Exactly one control lives beside the brand: the rail toggle while
            there is a rail, and the way into settings while there is not (its
            usual home is the rail's foot, which is not on screen). They never
            appear together, so this is a seat, not a second entry point. */}
        {!settingsOpen &&
          (signedOut ? (
            <IconButton
              variant="ghost"
              data-testid="open-settings"
              label={t("topbar.settings", "设置")}
              title={t("topbar.settingsTooltip", "设置（Ctrl+,）")}
              onClick={() => openSettings()}
            >
              <SettingsIcon size={15} />
            </IconButton>
          ) : (
            <Button
              variant="ghost"
              icon
              data-testid="toggle-sidebar"
              aria-pressed={sidebarOpen}
              aria-label={sidebarOpen ? t("topbar.sidebarCollapse", "收起会话栏") : t("topbar.sidebarExpand", "展开会话栏")}
              title={t("topbar.sidebarTooltip", "{{action}}会话栏（Ctrl+Shift+E）", {
                action: sidebarOpen ? t("topbar.actionCollapse", "收起") : t("topbar.actionExpand", "展开"),
              })}
              onClick={toggleSidebar}
            >
              <PanelLeftIcon />
            </Button>
          ))}
      </div>

      <div className="topbar__tabs" role="tablist">
        {sessionTabs.map((tab) => {
          const onScreen = tab.id === activeTabId && !settingsOpen;
          const label =
            tab.kind === "file"
              ? tab.name
              : (tab.customTitle ??
                t("topbar.terminalTab", "终端 {{index}}", { index: tab.ordinal }));
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={onScreen}
              className={`session-tab ${onScreen ? "session-tab--active" : ""}`}
              onMouseDown={(event) => {
                // Middle click closes, like every terminal emulator does — and
                // like the × does: a file tab with unsaved edits is a question.
                if (event.button === 1) {
                  event.preventDefault();
                  requestCloseTab(tab.id);
                } else if (event.button === 0) {
                  focusTab(tab.id);
                }
              }}
            >
              {renaming?.id === tab.id ? (
                <input
                  className="session-tab__rename"
                  value={renaming.draft}
                  autoFocus
                  spellCheck={false}
                  aria-label={t("topbar.terminalRename", "重命名终端")}
                  data-testid="tab-rename"
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => setRenaming({ ...renaming, draft: event.target.value })}
                  // The keyboard and the pointer belong to the field while it is
                  // open: the tab treats middle click as "close".
                  onMouseDown={(event) => event.stopPropagation()}
                  onDoubleClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    // An Enter that is picking an IME candidate is not a commit.
                    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                    if (event.key === "Enter") commitRename(renaming);
                    else if (event.key === "Escape") {
                      renameCancelled.current = true;
                      setRenaming(null);
                    }
                  }}
                  onBlur={() => commitRename(renaming)}
                />
              ) : (
                /* The path is the tooltip for a file: the strip truncates the name,
                   and where the file lives is the thing a name cannot say. A dot
                   says "not on the runtime yet" — the pane puts it in words. A
                   renamed shell shows its own name here, since truncation has to
                   be recoverable. */
                <span
                  className="truncate"
                  title={tab.kind === "file" ? tab.path : (tab.customTitle ?? undefined)}
                  onDoubleClick={
                    tab.kind === "shell"
                      ? (event) => {
                          event.stopPropagation();
                          renameCancelled.current = false;
                          // Opens on the name that is on screen: replace it by
                          // typing, adjust it with the arrow keys.
                          setRenaming({ id: tab.id, draft: label, initial: label });
                        }
                      : undefined
                  }
                >
                  {dirtyTabs[tab.id] ? <span className="session-tab__dot" aria-hidden="true" /> : null}
                  {label}
                </span>
              )}
              <button
                type="button"
                className="session-tab__close"
                aria-label={
                  // A tab with a name of its own is closed by that name — the
                  // number is not what the reader just called it.
                  tab.kind === "file"
                    ? t("topbar.tabCloseNamed", "关闭 {{name}}", { name: tab.name })
                    : tab.customTitle
                      ? t("topbar.tabCloseNamed", "关闭 {{name}}", { name: tab.customTitle })
                      : t("topbar.terminalClose", "关闭终端 {{index}}", { index: tab.ordinal })
                }
                title={tab.kind === "file" ? t("topbar.fileTabCloseTitle", "关闭文件") : t("topbar.terminalCloseTitle", "关闭终端")}
                onClick={(event) => {
                  event.stopPropagation();
                  requestCloseTab(tab.id);
                }}
              >
                <CloseIcon />
              </button>
            </div>
          );
        })}

        <button
          type="button"
          className="session-tab session-tab--add"
          data-testid="new-terminal"
          onClick={() => selectedSession && openTab(selectedSession)}
          disabled={selectedSession === null}
          aria-label={t("topbar.newTerminal", "新建终端")}
          title={t("topbar.newTerminalTitle", "新建终端（Ctrl+Shift+T）")}
        >
          <PlusIcon />
        </button>
      </div>

      {/* The file panel's edge, continued up through the bar: the line that
          divides the bar where it divides the window. Drawn rather than given
          to a section, because the controls to its right are their own width. */}
      {filesOpen && hasWorkSurface && !settingsOpen && (
        <span className="topbar__seam" data-testid="seam-files" aria-hidden="true" />
      )}

      <div className="topbar__actions">
        {/* The file panel belongs to the selected session's shells: with none
            there is no panel for this button to act on, so it stands down — the
            rule the panel toggles already follow while settings is up. */}
        {!settingsOpen && hasWorkSurface && (
          <Button
            variant="ghost"
            icon
            data-testid="toggle-files"
            aria-pressed={filesOpen}
            aria-label={filesOpen ? t("topbar.filesCollapse", "收起文件面板") : t("topbar.filesExpand", "展开文件面板")}
            title={t("topbar.filesTooltip", "{{action}}文件面板（Ctrl+Shift+B）", {
              action: filesOpen ? t("topbar.actionCollapse", "收起") : t("topbar.actionExpand", "展开"),
            })}
            onClick={toggleFiles}
          >
            <PanelRightIcon />
          </Button>
        )}
      </div>

      {!IS_MAC && <WindowControls />}
    </header>
  );
}

/** Minimize / maximize-restore / close, drawn by us because the frame is ours. */
function WindowControls() {
  const { t } = useTranslation();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => onWindowMaximized(setMaximized), []);

  return (
    <div className="window-controls">
      <button
        type="button"
        className="window-controls__button"
        data-testid="window-minimize"
        aria-label={t("topbar.windowMinimize", "最小化")}
        title={t("topbar.windowMinimize", "最小化")}
        onClick={() => void minimizeWindow()}
      >
        <MinimizeIcon />
      </button>
      <button
        type="button"
        className="window-controls__button"
        data-testid="window-maximize"
        aria-label={maximized ? t("topbar.windowRestore", "还原") : t("topbar.windowMaximize", "最大化")}
        title={maximized ? t("topbar.windowRestore", "还原") : t("topbar.windowMaximize", "最大化")}
        onClick={() => void toggleMaximizeWindow()}
      >
        {maximized ? <RestoreIcon /> : <MaximizeIcon />}
      </button>
      <button
        type="button"
        className="window-controls__button window-controls__button--close"
        data-testid="window-close"
        aria-label={t("topbar.windowClose", "关闭")}
        title={t("topbar.windowClose", "关闭")}
        onClick={() => void closeWindow()}
      >
        <CloseWindowIcon />
      </button>
    </div>
  );
}

/**
 * Compute the tier-adaptive progress ratio for compute units.
 * Base tiers: 100 CU (Pro), 500 CU (Pro+), or next 100-step ceiling.
 */
export function computeBalanceRatio(balance: number | null | undefined): number {
  if (balance === null || balance === undefined || !Number.isFinite(balance) || balance <= 0) {
    return 0;
  }
  const tier = balance <= 100 ? 100 : balance <= 500 ? 500 : Math.ceil(balance / 100) * 100;
  return Math.min(Math.max(balance / tier, 0), 1);
}

export function balanceMeterTone(ratio: number): "good" | "warn" | "danger" {
  if (ratio <= 0.05) return "danger";
  if (ratio <= 0.15) return "warn";
  return "good";
}

/**
 * The session whose own rate the account reading describes, or null.
 *
 * `consumptionRateHourly` is account-wide: with exactly one billed runtime it
 * is that runtime's rate; with two it is a sum that cannot be split. The
 * server's endpoint list is what makes the answer exact — it also counts
 * runtimes this window has no record of — and a single ready connection is the
 * fallback before that list has been read.
 */
export function soleBilledSession(
  sessions: Pick<Session, "name" | "endpoint">[],
  runtimeEndpoints: string[] | null,
  connections: Record<string, { status: string } | undefined>,
  assignments: number | null,
): string | null {
  if (assignments !== 1) return null;
  if (runtimeEndpoints !== null) {
    if (runtimeEndpoints.length !== 1) return null;
    return sessions.find((session) => session.endpoint === runtimeEndpoints[0])?.name ?? null;
  }
  const ready = sessions.filter((session) => connections[session.name]?.status === "ready");
  return ready.length === 1 ? ready[0].name : null;
}

const CONNECTION_TONE: Record<string, "good" | "warn" | "danger" | "neutral"> = {
  idle: "neutral",
  connecting: "warn",
  ready: "good",
  error: "danger",
  closed: "neutral",
};

/**
 * The bottom bar: cockpit for quota assets, active tasks, and open terminals.
 * Left: Mini progress bar + CU balance + spend rate + active sessions,
 *       with hover popover showing single-line quota header + single-line per session.
 * Right: Total terminals open across all sessions.
 */
export function StatusBar() {
  const { t } = useTranslation();
  const usage = useAppStore((state) => state.usage);
  const usagePending = useAppStore((state) => state.usagePending);
  const tabs = useAppStore((state) => state.tabs);
  const sessions = useAppStore((state) => state.sessions);
  const connections = useAppStore((state) => state.connections);
  const runtimeEndpoints = useAppStore((state) => state.runtimeEndpoints);
  // Primitives, not the status object — a download reports progress many times
  // a second, and this bar sits at the root of the tree.
  const updateState = useAppStore((state) => state.update.state);
  const updateVersion = useAppStore((state) =>
    state.update.state === "available" || state.update.state === "downloaded" ? state.update.version : null,
  );
  const openSettings = useAppStore((state) => state.openSettings);
  const updateReady = updateState === "available" || updateState === "downloaded";

  const [popoverOpen, setPopoverOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const balance = usage?.usage.balance ?? null;
  // `null`, not `0`: an unread rate must not print as "no spend".
  const rate = usage?.usage.rate ?? null;
  const assignments = usage?.usage.assignments ?? null;
  // The account rate can only be pinned on a session when it is the only one
  // billing; with two runtimes it is a sum, and the rows fall back to reference
  // values.
  const billedSession = soleBilledSession(sessions, runtimeEndpoints, connections, assignments);
  // Shells only: a file tab is a tab, but it is not a terminal, and this
  // readout has always meant "how many shells are open".
  const terminalCount = tabs.filter((tab) => tab.kind === "shell").length;

  const ratio = computeBalanceRatio(balance);
  const meterTone = balanceMeterTone(ratio);

  const projectedHours =
    balance !== null && balance > 0 && rate !== null && rate > 0
      ? (balance / rate).toFixed(1)
      : null;

  const projectedText = projectedHours
    ? t("statusbar.projectedHours", "预计可用 {{hours}} 小时", { hours: projectedHours })
    : balance === null
      ? "—"
      : t("statusbar.noOngoingRate", "无持续扣费");

  const openPopover = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setPopoverOpen(true), 120);
  };

  const closePopover = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setPopoverOpen(false), 160);
  };

  const cancelClose = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  return (
    <footer className="statusbar">
      <div
        className="statusbar__group statusbar__group--interactive"
        aria-busy={usagePending || undefined}
        onMouseEnter={openPopover}
        onMouseLeave={closePopover}
      >
        <div
          className="statusbar__meter"
          role="progressbar"
          // Unknown is not zero: a bar that reported 0% would say the account is empty.
          aria-valuenow={balance === null ? undefined : Math.round(ratio * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={`statusbar__meter-bar statusbar__meter-bar--${meterTone}`}
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>

        <span className="statusbar__item" data-testid="statusbar-balance">
          {usagePending ? (
            <span className="skeleton skeleton--balance" aria-hidden="true" />
          ) : balance !== null ? (
            t("statusbar.balanceUnit", "{{balance}} CU", { balance: balance.toFixed(2) })
          ) : (
            "— CU"
          )}
        </span>

        <span className="statusbar__sep" aria-hidden="true">·</span>

        <span className="statusbar__item" data-testid="statusbar-rate">
          {usagePending ? (
            <span className="skeleton skeleton--rate" aria-hidden="true" />
          ) : rate === null ? (
            "—/h"
          ) : rate > 0 ? (
            t("statusbar.rateUnit", "~{{rate}}/h", { rate: rate.toFixed(2) })
          ) : (
            t("statusbar.rateUnit", "0.00/h", { rate: "0.00" })
          )}
        </span>

        <span className="statusbar__sep" aria-hidden="true">·</span>

        <span
          className="statusbar__item"
          data-testid="statusbar-assignments"
          title={
            assignments === null
              ? undefined
              : t("statusbar.activeSessionsTitle", "活跃会话：{{count}}", { count: assignments })
          }
        >
          <ActivityIcon size={13} />
          {usagePending ? (
            <span className="skeleton skeleton--count" aria-hidden="true" />
          ) : (
            <span>{assignments ?? "—"}</span>
          )}
        </span>

        {popoverOpen && (
          <div
            className="statusbar-popover"
            role="tooltip"
            onMouseEnter={cancelClose}
            onMouseLeave={closePopover}
          >
            {/* Top row: progress bar + status description */}
            <div className="statusbar-popover__header">
              <div
                className="statusbar__meter"
                role="progressbar"
                aria-valuenow={balance === null ? undefined : Math.round(ratio * 100)}
              >
                <div
                  className={`statusbar__meter-bar statusbar__meter-bar--${meterTone}`}
                  style={{ width: `${Math.round(ratio * 100)}%` }}
                />
              </div>
              <span>
                {balance !== null
                  ? t("statusbar.balanceUnit", "{{balance}} CU", { balance: balance.toFixed(2) })
                  : "— CU"}
              </span>
              <span className="statusbar__sep" aria-hidden="true">·</span>
              <span>
                {rate === null
                  ? "—/h"
                  : rate > 0
                    ? t("statusbar.rateUnit", "-{{rate}}/h", { rate: rate.toFixed(2) })
                    : "0.00/h"}
              </span>
              <span className="statusbar__sep" aria-hidden="true">·</span>
              <span>{projectedText}</span>
            </div>

            <div className="statusbar-popover__divider" aria-hidden="true" />

            {/* Session rows: each session on a single line */}
            <div className="statusbar-popover__sessions">
              {sessions.length === 0 ? (
                <div className="statusbar-popover__empty">
                  {t("statusbar.noSessions", "暂无配置的会话")}
                </div>
              ) : (
                sessions.map((session) => {
                  const connection = connections[session.name];
                  const state = connection?.status ?? "closed";
                  const tone = CONNECTION_TONE[state] ?? "neutral";
                  const highRam = session.machine_shape === "HIGH_RAM";
                  const shape =
                    session.machine_shape && session.machine_shape !== "STANDARD"
                      ? ` · ${
                          session.machine_shape === "HIGH_RAM"
                            ? "High-RAM"
                            : session.machine_shape.replace("_", "-")
                        }`
                      : "";
                  /*
                    No countdown here, and that is the point of this column.
                    The only expiry a local record carries is the runtime proxy
                    token's own — an hour, renewed in passing whenever the CLI
                    runs a command — and this app deliberately does not run one,
                    so the value freezes on whatever it was and then reads as
                    "expired" for a session that is perfectly alive. Whether the
                    runtime is still there at all is asked of the server, and
                    answered on the rail's own rows.
                  */
                  const durationLabel =
                    state === "ready" ? t("statusbar.connected", "已连接") : t("statusbar.standby", "待命");
                  const rateInfo = sessionRate(
                    session.accelerator,
                    highRam,
                    billedSession === session.name ? rate : null,
                  );
                  const cost = sessionRateText(rateInfo);
                  const costTitle = rateInfo.actual
                    ? t("statusbar.rateActualTitle", "账户当前计费速率（仅有一个运行中的会话）")
                    : rateInfo.rate === null
                      ? t("statusbar.rateUnknownTitle", "Colab 未公布该机型的费率")
                      : highRam
                        ? t("statusbar.rateHighRamTitle", "参考费率；High-RAM 使用单独估算值")
                        : t("statusbar.rateEstimatedTitle", "参考费率；实际以 Colab 计费为准");

                  return (
                    <div key={session.name} className="statusbar-popover__row">
                      <span className="statusbar-popover__name">
                        <span className={`statusbar-popover__dot statusbar-popover__dot--${tone}`} />
                        <strong title={session.name}>{session.name}</strong>
                      </span>
                      <span className="statusbar-popover__model">
                        {acceleratorLabel(session.accelerator)}{shape}
                      </span>
                      <span className="statusbar-popover__duration">
                        {durationLabel}
                      </span>
                      <span className="statusbar-popover__cost" title={costTitle}>
                        {cost}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      <div className="statusbar__spacer" />

      {updateReady && (
        <button
          type="button"
          className="statusbar__item statusbar__item--action"
          data-testid="statusbar-update"
          title={
            updateState === "downloaded"
              ? t("statusbar.updateReadyTitle", "{{version}} 已下载，重启后生效", { version: updateVersion })
              : t("statusbar.updateAvailableTitle", "有新版本 {{version}}", { version: updateVersion })
          }
          onClick={() => openSettings("about")}
        >
          <SyncIcon size={13} />
          <span>{updateState === "downloaded" ? t("statusbar.updateReady", "重启以更新") : updateVersion}</span>
        </button>
      )}

      <div
        className="statusbar__group"
        title={t("statusbar.terminalsTitle", "终端总数：{{count}}", { count: terminalCount })}
      >
        <span className="statusbar__item" data-testid="terminal-count">
          <TerminalIcon size={13} />
          <span>{terminalCount}</span>
        </span>
      </div>
    </footer>
  );
}

/** Centered modal for a surface that is genuinely a detour — a form, a question. */
export function Dialog({
  title,
  onClose,
  children,
  footer,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-label={String(title)}>
        <header className="dialog__head">
          <h2 className="dialog__title">{title}</h2>
          <IconButton label={t("dialog.close", "关闭")} variant="ghost" size="sm" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </header>
        <div className="dialog__body">{children}</div>
        {footer ? <footer className="dialog__footer">{footer}</footer> : null}
      </div>
    </div>
  );
}
