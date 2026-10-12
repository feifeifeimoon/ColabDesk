import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Status, type StatusTone } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import {
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
} from "../components/ui/icons";
import { closeWindow, minimizeWindow, onWindowMaximized, toggleMaximizeWindow } from "../lib/api";
import { useAppStore } from "../store";
import {
  sshCommandFor,
  useActiveAccelerator,
  useActiveConnection,
  useActiveRemotePath,
  useHasWorkSurface,
  useTransferCount,
} from "../store/selectors";
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

const CONNECTION_TONE: Record<string, StatusTone> = {
  idle: "neutral",
  connecting: "warn",
  ready: "good",
  error: "danger",
  closed: "neutral",
};

/**
 * The bottom bar: the machine state that should never need a click — link
 * health, the remote path, quota, and what CLI answers. Mono, because every
 * value here is reported by a machine.
 */
export function StatusBar() {
  const { t } = useTranslation();
  const connection = useActiveConnection();
  const accelerator = useActiveAccelerator();
  const path = useActiveRemotePath();
  const transfers = useTransferCount();
  const sshCommand = useAppStore((state) =>
    state.selectedSession ? sshCommandFor(state.selectedSession) : null,
  );
  const usage = useAppStore((state) => state.usage);
  const env = useAppStore((state) => state.env);

  const statusKey = connection?.status ?? "idle";
  const balance = usage?.usage.balance;
  const rate = usage?.usage.rate;

  const connectionLabels: Record<string, string> = {
    idle: t("statusbar.statusIdle", "未连接"),
    connecting: t("statusbar.statusConnecting", "连接中…"),
    ready: t("statusbar.statusReady", "已连接"),
    error: t("statusbar.statusError", "连接失败"),
    closed: t("statusbar.statusClosed", "已断开"),
  };

  return (
    <footer className="statusbar">
      <div className="statusbar__group">
        <span data-testid="terminal-status">
          <Status tone={CONNECTION_TONE[statusKey] ?? "neutral"}>
            {connectionLabels[statusKey] ?? statusKey}
          </Status>
        </span>
        {accelerator && <span className="statusbar__item">{accelerator}</span>}
        {sshCommand && (
          <span className="statusbar__item" title={t("statusbar.sshCommandTitle", "当前运行时的 SSH 别名，外部终端也可使用")}>
            {sshCommand}
          </span>
        )}
        {path && (
          <span className="statusbar__item" title={path}>
            {path}
          </span>
        )}
        {transfers > 0 && (
          <span className="statusbar__item">
            {t("statusbar.transferring", "传输中 {{count}}", { count: transfers })}
          </span>
        )}
      </div>

      <div className="statusbar__spacer" />

      <div className="statusbar__group">
        {usage?.needs_login && <span className="statusbar__item">{t("statusbar.needsLogin", "未授权")}</span>}
        {balance !== null && balance !== undefined && (
          <span className="statusbar__item" title={t("statusbar.balanceTitle", "计算单元余额")}>
            {t("statusbar.balanceUnit", "{{balance}} CU", { balance: balance.toFixed(2) })}
          </span>
        )}
        {rate !== null && rate !== undefined && rate > 0 && (
          <span className="statusbar__item" title={t("statusbar.rateTitle", "消耗速率")}>
            {t("statusbar.rateUnit", "{{rate}}/h", { rate: rate.toFixed(2) })}
          </span>
        )}
        {env?.account && (
          <span className="statusbar__item" title={env.account.subject ?? env.account.email}>
            {env.account.email}
          </span>
        )}
        {env?.cli_version && (
          <span className="statusbar__item" title={env.cli_path ?? ""}>
            colab {env.cli_version}
            {env.cli_source === "bundled" ? t("statusbar.cliBundled", " · 内置") : ""}
          </span>
        )}
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
