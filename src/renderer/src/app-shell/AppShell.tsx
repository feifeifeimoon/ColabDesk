import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, IconButton } from "../components/ui/Button";
import {
  ActivityIcon,
  PanelLeftIcon,
  PanelRightIcon,
  SettingsIcon,
  SyncIcon,
  TerminalIcon,
} from "../components/ui/icons";
import { IS_MAC, MAC_INSET } from "../lib/platform";
import { toggleMaximizeWindow } from "../lib/api";
import { acceleratorLabel, sessionRate, sessionRateText } from "../features/sessions/accelerators";
import { useAppStore } from "../store";
import { useHasWorkSurface } from "../store/selectors";
import { BrandMark } from "./BrandMark";
import { balanceMeterTone, computeBalanceRatio, soleBilledSession } from "./status-bar";
import { WindowControls } from "./WindowControls";

/**
 * The single top bar of the non-workspace views: it is the window's title bar
 * too. Panel toggles sit at both ends, the middle is the window's drag region,
 * and — on Windows and Linux, where the OS frame is gone — the window controls
 * at the far right.
 *
 * A live workspace does not draw this bar: its top pane strip is the titlebar
 * (see `WorkspaceWindowChrome` and `GroupStrip`). This bar stays for the start
 * page, settings and runtime setup, where there is no pane to carry the row.
 */
export function TopBar() {
  const { t } = useTranslation();
  const sidebarOpen = useAppStore((state) => state.sidebarOpen);
  const filesOpen = useAppStore((state) => state.filesOpen);
  const settingsOpen = useAppStore((state) => state.settingsOpen);
  const hasWorkSurface = useHasWorkSurface();
  const toggleSidebar = useAppStore((state) => state.toggleSidebar);
  const openSettings = useAppStore((state) => state.openSettings);
  const signedOut = useAppStore((state) => state.env?.authenticated === false);
  const toggleFiles = useAppStore((state) => state.toggleFiles);

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
          still ends where the rail does, which is what puts the drag region
          above the terminal and the seam on the column below. */}
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

      {/* The tab strips live in their panes now: every pane owns its own row,
          and this bar keeps only the window's chrome. The middle stays an empty
          drag region so the window can still be moved from between the ends. */}
      <div className="topbar__middle" data-testid="topbar-middle" />

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
