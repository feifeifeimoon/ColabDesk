import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/Button";
import { PanelLeftIcon, PlusIcon } from "../../components/ui/icons";
import { toggleMaximizeWindow } from "../../lib/api";
import { IS_MAC, MAC_INSET } from "../../lib/platform";
import type { TabGroup } from "../../lib/tab-groups";
import { useAppStore } from "../../store";
import type { WorkspaceTab } from "../../store/types";
import { BrandMark } from "../../app-shell/BrandMark";
import { GroupTab } from "./GroupTab";

/**
 * One pane's own tab row: the strip that makes a pane a workspace rather than a
 * slot. The + belongs to this pane, not to the window; the window bar no longer
 * carries tabs at all.
 */
export function GroupStrip({
  group,
  tabs,
  index,
  focused,
  style,
  visible,
  titlebar = false,
  leading = false,
  trailing,
}: {
  group: TabGroup;
  tabs: WorkspaceTab[];
  /** 1-based position in the split tree, for the accessible name. */
  index: number;
  focused: boolean;
  style: CSSProperties;
  /** The session is on screen; a parked session keeps its strips out of the DOM. */
  visible: boolean;
  /** This strip is on the window's top row and carries the titlebar. */
  titlebar?: boolean;
  /** The rail is collapsed: brand + expand control lead this strip. */
  leading?: boolean;
  /** Room for the top-right files toggle and window controls. */
  trailing?: string;
}) {
  const { t } = useTranslation();
  const openTab = useAppStore((state) => state.openTab);
  const focusGroup = useAppStore((state) => state.focusGroup);
  const toggleSidebar = useAppStore((state) => state.toggleSidebar);

  const labelFor = (tab: WorkspaceTab): string =>
    tab.kind === "file"
      ? tab.name
      : (tab.customTitle ?? t("topbar.terminalTab", "终端 {{index}}", { index: tab.ordinal }));

  if (!visible) return null;

  return (
    <div
      className="group-strip"
      data-group-strip-id={group.id}
      data-focused={focused ? "true" : undefined}
      data-titlebar={titlebar ? "true" : undefined}
      style={trailing ? { ...style, paddingRight: trailing } : style}
      onPointerDown={() => focusGroup(group.session, group.id)}
      onMouseDown={(event) => {
        // A lower strip is not the window's drag region, so pressing its empty
        // part must not blur the terminal. The titlebar strip's empty part is
        // the drag region; its tabs and buttons cancel their own focus move.
        if (!titlebar && event.button === 0) event.preventDefault();
      }}
      onDoubleClick={(event) => {
        if (!titlebar) return;
        const target = event.target as Element | null;
        if (!target?.closest("button, [role='tab'], .menu, input")) void toggleMaximizeWindow();
      }}
    >
      {leading && (
        <div
          className="group-strip__leading"
          style={IS_MAC ? { paddingLeft: MAC_INSET } : undefined}
        >
          <span className="group-strip__brand" title={t("topbar.brand", "ColabDesk")}>
            <BrandMark />
          </span>
          <Button
            variant="ghost"
            icon
            data-testid="toggle-sidebar"
            aria-pressed={false}
            aria-label={t("topbar.sidebarExpand", "展开会话栏")}
            title={t("topbar.sidebarTooltip", "{{action}}会话栏（Ctrl+Shift+E）", {
              action: t("topbar.actionExpand", "展开"),
            })}
            onClick={toggleSidebar}
          >
            <PanelLeftIcon />
          </Button>
        </div>
      )}
      <div
        className="group-strip__tabs"
        role="tablist"
        aria-label={t("workspace.groupTabs", "面板 {{index}} 标签", { index })}
      >
        {tabs.map((tab, position) => (
          <GroupTab
            key={tab.id}
            tab={tab}
            group={group}
            label={labelFor(tab)}
            active={tab.id === group.activeTabId}
            isLast={position === tabs.length - 1}
          />
        ))}
      </div>
      <button
        type="button"
        className="session-tab session-tab--add group-strip__add"
        data-testid="new-terminal"
        aria-label={t("workspace.newTabInGroup", "在此面板新建终端")}
        title={t("workspace.newTabInGroupTitle", "在此面板新建终端（Ctrl+Shift+T）")}
        onClick={() => openTab(group.session, group.id)}
      >
        <PlusIcon />
      </button>
    </div>
  );
}
