import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Badge, type StatusTone } from "../components/ui/Badge";
import { Button, IconButton } from "../components/ui/Button";
import {
  ChipIcon,
  CloseIcon,
  CopyIcon,
  GpuIcon,
  KeyIcon,
  PanelLeftIcon,
  PlusIcon,
  RestartIcon,
  SettingsIcon,
  StopIcon,
  SyncIcon,
  TpuIcon,
} from "../components/ui/icons";
import { Menu, type MenuItem } from "../components/ui/Menu";
import { PanelDivider } from "../components/ui/PanelDivider";
import { acceleratorKind, acceleratorLabel } from "../features/sessions/accelerators";
import { toggleMaximizeWindow } from "../lib/api";
import { PANEL_WIDTH } from "../lib/panel-width";
import { IS_MAC, MAC_INSET } from "../lib/platform";
import { useAppStore } from "../store";
import { useWorkspaceChrome } from "../store/selectors";
import { BrandMark } from "./BrandMark";

const CONNECTION_TONE: Record<string, StatusTone> = {
  connecting: "warn",
  ready: "good",
  error: "danger",
  closed: "neutral",
};

/** The machine class as a picture: the tile at the head of a card. */
const MACHINE_ICON = { cpu: ChipIcon, gpu: GpuIcon, tpu: TpuIcon };

/**
 * The left rail: one card per session, the way a terminal app lists hosts.
 * Clicking the card opens (or focuses) its tab; the card's own actions live
 * behind the `+` and `⋯` at its top right, which only appear while the card is
 * pointed at. The foot of the rail is the app's own corner: the way into
 * settings.
 *
 * In a live workspace the rail also draws the window titlebar's left section:
 * a 40px head with the brand and the way to collapse it. The global bar is not
 * drawn there, so these controls do not exist twice.
 *
 * A row is two lines because the name and the machine's facts used to share
 * one. They were never equal: the machine type is as long as it likes
 * (`A100-SXM4-40GB`) and it was the name that paid, down to an ellipsis three
 * characters wide. The name now owns the first line outright, and the facts
 * sit under it — which is also what lets the rail be narrowed, the one thing a
 * host list must survive.
 */
export function Sidebar() {
  const { t } = useTranslation();
  const open = useAppStore((state) => state.sidebarOpen);
  const signedOut = useAppStore((state) => state.env?.authenticated === false);
  const railRef = useRef<HTMLElement | null>(null);

  /**
   * Publishes this rail's width for the top bar's first section, which is drawn
   * exactly this wide so the bar's middle starts where the terminal does.
   *
   * Measured rather than recomputed there: the rail's width is whatever the
   * layout gave it — on a narrow window it gives way to the terminal — and a
   * second copy of that arithmetic would drift from this one the first time
   * either changes.
   */
  useEffect(() => {
    const rail = railRef.current;
    if (!open || signedOut || !rail) return;
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
  }, [open, signedOut]);

  const width = useAppStore((state) => state.panelWidths.sidebar);
  const setPanelWidth = useAppStore((state) => state.setPanelWidth);
  const sessions = useAppStore((state) => state.sessions);
  const loading = useAppStore((state) => state.sessionsLoading);
  const untrackedSessions = useAppStore((state) => state.untrackedSessions);
  const untrackedError = useAppStore((state) => state.untrackedError);
  const runtimeEndpoints = useAppStore((state) => state.runtimeEndpoints);
  const previousAccount = useAppStore((state) => state.previousAccount);
  const selectedSession = useAppStore((state) => state.selectedSession);
  const tabs = useAppStore((state) => state.tabs);
  const connections = useAppStore((state) => state.connections);
  const busyAction = useAppStore((state) => state.busyAction);
  const runSessionAction = useAppStore((state) => state.runSessionAction);
  const syncSessions = useAppStore((state) => state.syncSessions);
  const syncing = useAppStore((state) => state.sessionsSyncing);
  const openNewSession = useAppStore((state) => state.openNewSession);
  const openSettings = useAppStore((state) => state.openSettings);
  const toggleSidebar = useAppStore((state) => state.toggleSidebar);
  const workspaceChrome = useWorkspaceChrome();

  // Collapsing unmounts the rail; that is the one panel whose contents nobody
  // expects to survive a collapse. Signed out, the whole rail goes with it: its
  // rows belong to another account and every action in it would fail, so drawing
  // it would only offer things that cannot be done.
  if (!open || signedOut) return null;

  const connectionLabels: Record<string, string> = {
    connecting: t("statusbar.statusConnecting", "连接中"),
    ready: t("statusbar.statusReady", "已连接"),
    error: t("statusbar.statusError", "失败"),
    closed: t("statusbar.statusClosed", "已断开"),
  };

  return (
    <aside className="sidebar" ref={railRef} style={{ width, minWidth: PANEL_WIDTH.sidebar.min }}>
      {workspaceChrome && (
        <div
          className="sidebar__head"
          style={IS_MAC ? { paddingLeft: MAC_INSET } : undefined}
          onDoubleClick={(event) => {
            const target = event.target as Element | null;
            if (!target?.closest("button, .menu, input")) void toggleMaximizeWindow();
          }}
        >
          <span className="sidebar__brand" title={t("topbar.brand", "ColabDesk")}>
            <BrandMark />
          </span>
          <Button
            variant="ghost"
            icon
            data-testid="toggle-sidebar"
            aria-pressed={open}
            aria-label={t("topbar.sidebarCollapse", "收起会话栏")}
            title={t("topbar.sidebarTooltip", "{{action}}会话栏（Ctrl+Shift+E）", {
              action: t("topbar.actionCollapse", "收起"),
            })}
            onClick={toggleSidebar}
          >
            <PanelLeftIcon />
          </Button>
        </div>
      )}
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
            // Nothing to create until somebody is signed in; the front door is
            // where the way in lives, and a create that can only fail is worse
            // than a control that says why it is unavailable.
            disabled={signedOut}
            onClick={openNewSession}
            aria-label={signedOut ? t("sidebar.signInFirst", "先登录 Google 账号") : t("sidebar.newSessionTitle", "新建会话")}
            title={signedOut ? t("sidebar.signInFirst", "先登录 Google 账号") : t("sidebar.newSessionTitle", "新建会话")}
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
            {t("sidebar.empty", "本地暂无会话。使用上方「+」新建运行时。")}
          </p>
        )}

        {/*
          Only while the rail would otherwise read as empty, which is the one
          case where it would be claiming to be complete: with local rows on
          screen the list is honest, and this read loses to every network blip.

          The sentence is ours — the main process only reports *that* the read
          failed and what it said, because that text is a diagnostic, not a
          piece of UI copy.
        */}
        {untrackedError && sessions.length === 0 && (
          <p className="hint" style={{ padding: "var(--space-2)" }} title={untrackedError}>
            {t("sidebar.untrackedUnavailable", "无法读取云端运行时列表（令牌过期或网络不通），请使用上方「同步」重试。")}
          </p>
        )}

        {/*
          A different account signed in since these records were made. Nothing is
          deleted on its own: these rows are the only copy, and switching back is
          a legitimate thing to do. The way out is the sync that already exists —
          it is what prunes the list against the server.
        */}
        {previousAccount && sessions.length > 0 && (
          <div className="sidebar__previous-account" data-testid="previous-account">
            <p className="hint">
              {t(
                "sidebar.previousAccount",
                "以下记录属于此前登录的账号（{{email}}）。同步将按当前账号移除这些记录。",
                { email: previousAccount },
              )}
            </p>
            <Button variant="outline" size="sm" disabled={syncing} onClick={() => void syncSessions()}>
              {t("sidebar.previousAccountSync", "同步并清理")}
            </Button>
          </div>
        )}

        {sessions.map((session) => {
          const connection = connections[session.name];
          const state = connection?.status ?? "closed";
          // `neutral` has no modifier: `.status`'s own colour is the resting one.
          const tone = CONNECTION_TONE[state] ?? "neutral";
          const stateClass = ["status", tone === "neutral" ? "" : `status--${tone}`]
            .filter(Boolean)
            .join(" ");
          const MachineIcon = MACHINE_ICON[acceleratorKind(session.accelerator)];
          const busy = busyAction?.startsWith(`${session.name}:`) ?? false;
          const sessionTabs = tabs.filter((tab) => tab.session === session.name);
          // The tooltip counts shells, which is what it says; the menu below is
          // about the session's workbench, which is every tab it has.
          const shells = sessionTabs.filter((tab) => tab.kind === "shell").length;
          /*
            What the server said about this record — or nothing, which is the
            third answer and the reason it is not a boolean. A read that did not
            come back must leave the row silent: "gone" is a claim about
            somebody's machine, and a network blip is not allowed to make it.
          */
          const cloud =
            runtimeEndpoints === null || !session.endpoint
              ? null
              : runtimeEndpoints.includes(session.endpoint)
                ? "running"
                : "gone";
          // A dead record is painted, not written: the tooltip says why. A live
          // connection outranks a stale server list, so a ready row stays normal.
          const released = cloud === "gone" && state !== "ready";
          const title = [
            session.name,
            cloud === "running"
              ? t("sidebar.cloudRunning", "云端运行中")
              : cloud === "gone"
                ? t("sidebar.cloudGoneTitle", "云端已无此运行时；同步将移除该本地记录。")
                : null,
            connectionLabels[state] ?? state,
            connection?.error ?? null,
            session.endpoint && session.endpoint !== session.name ? session.endpoint : null,
            shells > 1 ? t("sidebar.terminalsCount", "{{count}} 个终端", { count: shells }) : null,
          ]
            .filter((part): part is string => Boolean(part))
            .join(" · ");
          /*
            The rail paints machines, not connections: the state is in the
            tooltip and in the hidden text a screen reader gets, and a failed
            connection is written into the terminal the row opens. Keeping the
            status classes here is what lets the e2e fixture wait for readiness
            without reading the store.
          */
          const hiddenState = [
            connectionLabels[state] ?? state,
            released ? t("sidebar.cloudGoneTitle", "云端已无此运行时；同步将移除该本地记录。") : null,
          ]
            .filter((part): part is string => Boolean(part))
            .join(" · ");
          const menuItems: MenuItem[] = [
            {
              label:
                busy && busyAction?.endsWith("restart-kernel")
                  ? t("sidebar.menuRestartingKernel", "重启中…")
                  : t("sidebar.menuRestartKernel", "重启内核"),
              icon: <RestartIcon size={14} />,
              disabled: busy,
              onSelect: () => void runSessionAction(session.name, "restart-kernel"),
            },
            {
              label: t("sidebar.menuSshConfig", "写入 SSH 配置"),
              icon: <KeyIcon size={14} />,
              disabled: busy,
              onSelect: () => void runSessionAction(session.name, "ssh-config"),
            },
            {
              label: t("sidebar.menuCopySsh", "复制 ssh 命令"),
              icon: <CopyIcon size={14} />,
              onSelect: () => void runSessionAction(session.name, "copy-ssh"),
            },
            // Closing every tab is what hangs up — a file tab holds the
            // connection too — and one tab on its own leaves it up for the
            // others.
            ...(sessionTabs.length > 0
              ? [
                  {
                    label: t("sidebar.menuCloseAllTerminals", "关闭全部标签"),
                    icon: <CloseIcon size={14} />,
                    onSelect: () => void runSessionAction(session.name, "close-all"),
                  },
                ]
              : []),
            {
              label:
                busy && busyAction?.endsWith("stop")
                  ? t("sidebar.menuStoppingSession", "停止中…")
                  : t("sidebar.menuStopSession", "停止会话"),
              icon: <StopIcon size={14} />,
              danger: true,
              disabled: busy,
              dividerBefore: true,
              onSelect: () => void runSessionAction(session.name, "stop"),
            },
          ];
          return (
            <div
              key={session.name}
              data-testid="session-row"
              className={[
                "session-row",
                session.name === selectedSession ? "session-row--active" : "",
                released ? "session-row--released" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              title={title}
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
                <span className="session-row__machine" aria-hidden="true">
                  <MachineIcon size={16} />
                </span>
                <span className="session-row__name">{session.name}</span>
                <span className="session-row__badge">
                  <Badge>{acceleratorLabel(session.accelerator)}</Badge>
                </span>
                {/* Not painted: the connection state is a tooltip and a screen-
                    reader sentence, and a failure is written into the terminal
                    this button opens. */}
                <span
                  className={`visually-hidden ${stateClass}`}
                  data-testid={session.name === selectedSession ? "terminal-status" : undefined}
                >
                  {hiddenState}
                </span>
              </button>

              <span className="session-row__actions">
                <IconButton
                  variant="ghost"
                  size="sm"
                  label={t("sidebar.newTerminalFor", "为「{{name}}」新建终端", { name: session.name })}
                  onClick={() => void runSessionAction(session.name, "new-terminal")}
                >
                  <PlusIcon size={14} />
                </IconButton>
                <Menu
                  label={t("sidebar.menuActionLabel", "{{name}} 的操作", { name: session.name })}
                  items={menuItems}
                />
              </span>
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
        {untrackedSessions.map((session) => {
          const UntrackedIcon = MACHINE_ICON[acceleratorKind(session.accelerator)];
          return (
            <div
              key={session.name}
              data-testid="untracked-row"
              className="session-row session-row--untracked"
              title={`${session.name} · ${t("sidebar.untracked", "未在本地记录")} · ${t(
                "sidebar.untrackedTitle",
                "云端存在此运行时但本地无对应连接凭据。如需终止请前往 Colab 网页控制台。",
              )}`}
            >
              <div className="session-row__main">
                <span className="session-row__machine" aria-hidden="true">
                  <UntrackedIcon size={16} />
                </span>
                <span className="session-row__name session-row__name--endpoint">{session.name}</span>
                <span className="session-row__badge">
                  <Badge>{acceleratorLabel(session.accelerator)}</Badge>
                </span>
                <span className="visually-hidden">{t("sidebar.untracked", "未在本地记录")}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="sidebar__footer">
        <button
          type="button"
          className="sidebar__action"
          data-testid="open-settings"
          title={t("sidebar.settingsTitle", "设置（Ctrl+,）")}
          onClick={() => openSettings()}
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
