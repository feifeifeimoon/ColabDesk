import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../components/ui/Button";
import {
  ActivityIcon,
  CloseIcon,
  CloseWindowIcon,
  MaximizeIcon,
  MinimizeIcon,
  MoonIcon,
  PanelLeftIcon,
  PanelRightIcon,
  PlusIcon,
  RestoreIcon,
  SunIcon,
  TerminalIcon,
} from "../components/ui/icons";
import { closeWindow, minimizeWindow, onWindowMaximized, toggleMaximizeWindow } from "../lib/api";
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
 * terminal, and the theme toggle stays because it is the whole window's.
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
  const theme = useAppStore((state) => state.resolvedTheme);
  const toggleSidebar = useAppStore((state) => state.toggleSidebar);
  const toggleFiles = useAppStore((state) => state.toggleFiles);
  const toggleTheme = useAppStore((state) => state.toggleTheme);
  const openTab = useAppStore((state) => state.openTab);
  const closeTab = useAppStore((state) => state.closeTab);
  const focusTab = useAppStore((state) => state.focusTab);

  // The strip is the selected session's workspace, so it shows that session's
  // shells and nothing else. Memoised rather than selected: a selector that
  // built this array would hand back a new reference on every store write.
  const sessionTabs = useMemo(
    () => tabs.filter((tab) => tab.session === selectedSession),
    [tabs, selectedSession],
  );

  const toggled = theme === "dark" ? t("topbar.themeLight", "浅色") : t("topbar.themeDark", "深色");

  return (
    <header
      className="topbar"
      style={IS_MAC ? { paddingLeft: MAC_INSET } : undefined}
      onDoubleClick={(event) => {
        // Double-clicking a title bar maximizes — over the same surface that
        // drags it, i.e. everywhere the double click does not land on a control.
        const target = event.target as Element | null;
        if (!target?.closest("button, [role='tab'], .menu, input")) void toggleMaximizeWindow();
      }}
    >
      <div className="topbar__side" data-rail={sidebarOpen || settingsOpen ? "open" : "closed"}>
        <span className="topbar__brand" title={t("topbar.brand", "ColabDesk")}>
          <BrandMark />
        </span>
        {!settingsOpen && (
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
        )}
      </div>

      <div className="topbar__tabs" role="tablist">
        {sessionTabs.map((tab) => {
          const onScreen = tab.id === activeTabId && !settingsOpen;
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={onScreen}
              className={`session-tab ${onScreen ? "session-tab--active" : ""}`}
              onMouseDown={(event) => {
                // Middle click closes, like every terminal emulator.
                if (event.button === 1) {
                  event.preventDefault();
                  closeTab(tab.id);
                } else if (event.button === 0) {
                  focusTab(tab.id);
                }
              }}
            >
              <span className="truncate">{t("topbar.terminalTab", "终端 {{index}}", { index: tab.ordinal })}</span>
              <button
                type="button"
                className="session-tab__close"
                aria-label={t("topbar.terminalClose", "关闭终端 {{index}}", { index: tab.ordinal })}
                title={t("topbar.terminalCloseTitle", "关闭当前终端（保持会话连接）")}
                onClick={(event) => {
                  event.stopPropagation();
                  closeTab(tab.id);
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
          title={t("topbar.newTerminalTitle", "在当前会话里新建终端（Ctrl+Shift+T）")}
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
        <Button
          variant="ghost"
          icon
          data-testid="toggle-theme"
          aria-label={t("topbar.themeToggle", "切换到{{theme}}主题", { theme: toggled })}
          title={t("topbar.themeToggle", "切换到{{theme}}主题", { theme: toggled })}
          onClick={toggleTheme}
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </Button>
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

const ACCELERATOR_RATES: Record<string, string> = {
  A100: "~13.08/h",
  V100: "~5.45/h",
  L4: "~2.50/h",
  T4: "~1.25/h",
  "TPU v2": "~1.30/h",
  CPU: "0.00/h",
  NONE: "0.00/h",
};

const CONNECTION_TONE: Record<string, "good" | "warn" | "danger" | "neutral"> = {
  idle: "neutral",
  connecting: "warn",
  ready: "good",
  error: "danger",
  closed: "neutral",
};

export function formatSessionExpiry(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return null;
  const diffMs = target - Date.now();
  if (diffMs <= 0) return "已过期";
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours > 0) return `剩余 ~${hours}h${mins > 0 ? ` ${mins}m` : ""}`;
  return `剩余 ~${mins}m`;
}

/**
 * The bottom bar: cockpit for quota assets, active tasks, and open terminals.
 * Left: Mini progress bar + CU balance + spend rate + active sessions,
 *       with hover popover showing single-line quota header + single-line per session.
 * Right: Total terminals open across all sessions.
 */
export function StatusBar() {
  const { t } = useTranslation();
  const usage = useAppStore((state) => state.usage);
  const tabs = useAppStore((state) => state.tabs);
  const sessions = useAppStore((state) => state.sessions);
  const connections = useAppStore((state) => state.connections);

  const [popoverOpen, setPopoverOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const balance = usage?.usage.balance ?? null;
  const rate = usage?.usage.rate ?? 0;
  const assignments = usage?.usage.assignments ?? 0;
  const terminalCount = tabs.length;

  const ratio = computeBalanceRatio(balance);
  const meterTone = balanceMeterTone(ratio);

  const projectedHours =
    balance !== null && balance > 0 && rate > 0
      ? (balance / rate).toFixed(1)
      : null;

  const projectedText = projectedHours
    ? t("statusbar.projectedHours", "约 {{hours}} 小时", { hours: projectedHours })
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
        onMouseEnter={openPopover}
        onMouseLeave={closePopover}
      >
        <div
          className="statusbar__meter"
          role="progressbar"
          aria-valuenow={Math.round(ratio * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={`statusbar__meter-bar statusbar__meter-bar--${meterTone}`}
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>

        <span className="statusbar__item" data-testid="statusbar-balance">
          {balance !== null
            ? t("statusbar.balanceUnit", "{{balance}} CU", { balance: balance.toFixed(2) })
            : "— CU"}
        </span>

        <span className="statusbar__sep" aria-hidden="true">·</span>

        <span className="statusbar__item" data-testid="statusbar-rate">
          {rate > 0
            ? t("statusbar.rateUnit", "~{{rate}}/h", { rate: rate.toFixed(2) })
            : t("statusbar.rateUnit", "0.00/h", { rate: "0.00" })}
        </span>

        <span className="statusbar__sep" aria-hidden="true">·</span>

        <span
          className="statusbar__item"
          data-testid="statusbar-assignments"
          title={t("statusbar.activeSessionsTitle", "活跃会话：{{count}} 台", { count: assignments })}
        >
          <ActivityIcon size={13} />
          <span>{assignments}</span>
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
                aria-valuenow={Math.round(ratio * 100)}
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
                {rate > 0
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
                  const accelerator =
                    session.accelerator === "NONE" || !session.accelerator ? "CPU" : session.accelerator;
                  const shape =
                    session.machine_shape && session.machine_shape !== "STANDARD"
                      ? ` · ${session.machine_shape.replace("_", "-")}`
                      : "";
                  const expiry = formatSessionExpiry(session.token_expires_at);
                  const durationLabel =
                    expiry ?? (state === "ready" ? t("statusbar.connected", "已连接") : t("statusbar.standby", "待命"));
                  const cost = ACCELERATOR_RATES[accelerator] ?? "0.00/h";

                  return (
                    <div key={session.name} className="statusbar-popover__row">
                      <span className="statusbar-popover__name">
                        <span className={`statusbar-popover__dot statusbar-popover__dot--${tone}`} />
                        <strong title={session.name}>{session.name}</strong>
                      </span>
                      <span className="statusbar-popover__model">
                        {accelerator}{shape}
                      </span>
                      <span className="statusbar-popover__duration">
                        {durationLabel}
                      </span>
                      <span className="statusbar-popover__cost">
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

      <div
        className="statusbar__group"
        title={t("statusbar.terminalsTitle", "所有会话总计 {{count}} 个终端", { count: terminalCount })}
      >
        <span className="statusbar__item" data-testid="terminal-count">
          <TerminalIcon size={13} />
          <span>{terminalCount}</span>
        </span>
      </div>
    </footer>
  );
}

/** Centered modal for a form that is genuinely a detour — the create-session one. */
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
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t("dialog.close", "关闭")}
          </Button>
        </header>
        <div className="dialog__body">{children}</div>
        {footer ? <footer className="dialog__head">{footer}</footer> : null}
      </div>
    </div>
  );
}
