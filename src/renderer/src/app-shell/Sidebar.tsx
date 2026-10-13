import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Status, type StatusTone } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { PlusIcon, SettingsIcon, SyncIcon } from "../components/ui/icons";
import { Menu } from "../components/ui/Menu";
import { PanelDivider } from "../components/ui/PanelDivider";
import { PANEL_WIDTH } from "../lib/panel-width";
import { useAppStore } from "../store";
import { acceleratorLabel } from "../store/selectors";

const CONNECTION_TONE: Record<string, StatusTone> = {
  connecting: "warn",
  ready: "good",
  error: "danger",
  closed: "neutral",
};

/**
 * The left rail: one row per session, the way a terminal app lists hosts.
 * Clicking a row opens (or focuses) its tab; the row's own actions live behind
 * the ⋯ trigger, which only appears while the row is pointed at. The foot of the
 * rail is the app's own corner: the quota readout and the way into settings.
 */
export function Sidebar() {
  const { t } = useTranslation();
  const open = useAppStore((state) => state.sidebarOpen);
  const railRef = useRef<HTMLElement | null>(null);

  /**
   * Publishes this rail's width for the top bar's first section, which is drawn
   * exactly this wide so the tab strip starts where the terminal does.
   *
   * Measured rather than recomputed there: the rail's width is whatever the
   * layout gave it — on a narrow window it gives way to the terminal — and a
   * second copy of that arithmetic would drift from this one the first time
   * either changes.
   */
  useEffect(() => {
    const rail = railRef.current;
    if (!open || !rail) return;
    const publish = (): void => {
      const { width } = rail.getBoundingClientRect();
      document.documentElement.style.setProperty("--rail-width", `${width}px`);
    };
    const observer = new ResizeObserver(publish);
    observer.observe(rail);
    publish();
    return () => {
      observer.disconnect();
      // Collapsed: the section falls back to its own two controls.
      document.documentElement.style.removeProperty("--rail-width");
    };
  }, [open]);

  const width = useAppStore((state) => state.panelWidths.sidebar);
  const setPanelWidth = useAppStore((state) => state.setPanelWidth);
  const sessions = useAppStore((state) => state.sessions);
  const loading = useAppStore((state) => state.sessionsLoading);
  const untrackedSessions = useAppStore((state) => state.untrackedSessions);
  const untrackedError = useAppStore((state) => state.untrackedError);
  const selectedSession = useAppStore((state) => state.selectedSession);
  const tabs = useAppStore((state) => state.tabs);
  const connections = useAppStore((state) => state.connections);
  const busyAction = useAppStore((state) => state.busyAction);
  const runSessionAction = useAppStore((state) => state.runSessionAction);
  const syncSessions = useAppStore((state) => state.syncSessions);
  const syncing = useAppStore((state) => state.sessionsSyncing);
  const openNewSession = useAppStore((state) => state.openNewSession);
  const openSettings = useAppStore((state) => state.openSettings);

  // Collapsing unmounts the rail; that is the one panel whose contents nobody
  // expects to survive a collapse.
  if (!open) return null;

  const connectionLabels: Record<string, string> = {
    connecting: t("statusbar.statusConnecting", "连接中"),
    ready: t("statusbar.statusReady", "已连接"),
    error: t("statusbar.statusError", "失败"),
    closed: t("statusbar.statusClosed", "已断开"),
  };

  return (
    <aside className="sidebar" ref={railRef} style={{ width, minWidth: PANEL_WIDTH.sidebar.min }}>
      <PanelDivider
        side="sidebar"
        edge="right"
        label={t("sidebar.widthLabel", "会话栏宽度")}
        width={width}
        onCommit={(next) => setPanelWidth("sidebar", next)}
      />
      <div className="sidebar__section">
        <span>{t("sidebar.sessions", "会话")}</span>
        <span className="row" style={{ gap: "var(--space-1)" }}>
          <Button
            variant="ghost"
            size="sm"
            icon
            disabled={syncing}
            data-testid="sync-sessions"
            aria-label={syncing ? t("sidebar.syncing", "同步中…") : t("sidebar.sync", "同步")}
            title={syncing ? t("sidebar.syncing", "同步中…") : t("sidebar.syncTitle", "同步云端状态")}
            onClick={() => void syncSessions()}
          >
            <SyncIcon size={14} className={syncing ? "spin-sync" : undefined} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon
            onClick={openNewSession}
            aria-label={t("sidebar.newSessionTitle", "新建会话")}
            title={t("sidebar.newSessionTitle", "新建会话")}
          >
            <PlusIcon size={14} />
          </Button>
        </span>
      </div>

      <div className="sidebar__list" data-testid="sidebar-list">
        {syncing && (
          <div className="sidebar__overlay" data-testid="sidebar-overlay" aria-live="polite">
            <span className="spinner" aria-hidden="true" />
            <span className="sidebar__overlay-text">{t("sidebar.syncingHint", "正在同步会话…")}</span>
          </div>
        )}

        {loading && (
          <p className="hint" style={{ padding: "var(--space-2)" }}>
            {t("sidebar.loading", "读取中…")}
          </p>
        )}

        {!loading && sessions.length === 0 && (
          <p className="hint" style={{ padding: "var(--space-2)" }}>
            {t("sidebar.empty", "本地还没有会话。点击上方「+」新建运行时。")}
          </p>
        )}

        {/*
          Only while the rail would otherwise read as empty, which is the one
          case where it would be claiming to be complete: with local rows on
          screen the list is honest, and this read loses to every network blip.
        */}
        {untrackedError && sessions.length === 0 && (
          <p className="hint" style={{ padding: "var(--space-2)" }}>
            {untrackedError}
          </p>
        )}

        {sessions.map((session) => {
          const connection = connections[session.name];
          const state = connection?.status ?? "closed";
          // "Closed" is the resting state and says nothing; every other state
          // is written out (a dot alone never carries the state).
          const stateLabel = state === "closed" ? null : (connectionLabels[state] ?? state);
          const busy = busyAction?.startsWith(`${session.name}:`) ?? false;
          const shells = tabs.filter((tab) => tab.session === session.name).length;
          // The shell count goes in the tooltip rather than a second badge: the
          // tab strip is the authoritative "how many shells" display, and the
          // badge squeezed the session name down to an ellipsis.
          return (
            <div
              key={session.name}
              data-testid="session-row"
              className={`session-row ${session.name === selectedSession ? "session-row--active" : ""}`}
              title={`${connection?.error ?? session.endpoint ?? session.name}${shells > 1 ? t("sidebar.terminalsCount", " · {{count}} 个终端", { count: shells }) : ""}`}
              onContextMenu={(event) => {
                event.preventDefault();
                void runSessionAction(session.name, "open");
              }}
            >
              <button
                type="button"
                className="session-row__main"
                onClick={() => void runSessionAction(session.name, "open")}
              >
                <span
                  aria-hidden="true"
                  className={`status ${CONNECTION_TONE[state] ? `status--${CONNECTION_TONE[state]}` : ""}`}
                />
                <span className="session-row__name">{session.name}</span>
              </button>

              <span className="session-row__sub">
                {stateLabel && (
                  <span
                    {...(session.name === selectedSession ? { "data-testid": "terminal-status" } : {})}
                    className={`status ${CONNECTION_TONE[state] ? `status--${CONNECTION_TONE[state]}` : ""}`}
                  >
                    {stateLabel}
                  </span>
                )}
                <Badge tone="ink">{acceleratorLabel(session)}</Badge>
              </span>

              <Menu
                label={t("sidebar.menuActionLabel", "{{name}} 的操作", { name: session.name })}
                items={[
                  shells > 0
                    ? { label: t("sidebar.menuFocusTerminal", "聚焦终端"), onSelect: () => void runSessionAction(session.name, "open") }
                    : { label: t("sidebar.menuOpenTerminal", "打开终端"), onSelect: () => void runSessionAction(session.name, "open") },
                  { label: t("sidebar.menuNewTerminal", "新建终端"), onSelect: () => void runSessionAction(session.name, "new-terminal") },
                  {
                    label: busy && busyAction?.endsWith("restart-kernel") ? t("sidebar.menuRestartingKernel", "重启中…") : t("sidebar.menuRestartKernel", "重启内核"),
                    disabled: busy,
                    onSelect: () => void runSessionAction(session.name, "restart-kernel"),
                  },
                  {
                    label: t("sidebar.menuSshConfig", "写入 SSH 配置"),
                    disabled: busy,
                    onSelect: () => void runSessionAction(session.name, "ssh-config"),
                  },
                  { label: t("sidebar.menuCopySsh", "复制 ssh 命令"), onSelect: () => void runSessionAction(session.name, "copy-ssh") },
                  // Closing every shell is what hangs up: one tab on its own
                  // leaves the connection up for the others.
                  ...(shells > 0
                    ? [
                        {
                          label: t("sidebar.menuCloseAllTerminals", "关闭全部终端"),
                          onSelect: () => void runSessionAction(session.name, "close-all"),
                        },
                      ]
                    : []),
                  {
                    label: busy && busyAction?.endsWith("stop") ? t("sidebar.menuStoppingSession", "停止中…") : t("sidebar.menuStopSession", "停止会话"),
                    danger: true,
                    disabled: busy,
                    onSelect: () => void runSessionAction(session.name, "stop"),
                  },
                ]}
              />
            </div>
          );
        })}

        {/*
          The runtimes the server has that no local record mentions — what
          `colab sessions` prints with a `[?]` where a name would be. They are
          listed because they are running and spending quota; they are not
          controls because everything this app does to a session needs a record
          that does not exist for them.
        */}
        {untrackedSessions.map((session) => (
          <div
            key={session.name}
            data-testid="untracked-row"
            className="session-row session-row--untracked"
            title={t(
              "sidebar.untrackedTitle",
              "云端存在此运行时但本地无对应连接凭据。如需终止请前往 Colab 网页控制台。",
            )}
          >
            <div className="session-row__main">
              <span aria-hidden="true" className="status status--warn" />
              <span className="session-row__name session-row__name--endpoint">{session.name}</span>
            </div>
            <span className="session-row__sub">
              <Status tone="warn">{t("sidebar.untracked", "未在本地记录")}</Status>
              <Badge tone="ink">{acceleratorLabel(session)}</Badge>
            </span>
          </div>
        ))}
      </div>

      <div className="sidebar__footer">
        <button
          type="button"
          className="sidebar__action"
          data-testid="open-settings"
          title={t("sidebar.settingsTitle", "设置（Ctrl+,）")}
          onClick={openSettings}
        >
          <span className="sidebar__action-label">
            <SettingsIcon size={15} />
            {t("sidebar.settings", "设置")}
          </span>
        </button>
      </div>
    </aside>
  );
}
