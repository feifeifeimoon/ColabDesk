import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { PlusIcon } from "../../components/ui/icons";
import type { TabGroup } from "../../lib/tab-groups";
import { useAppStore } from "../../store";
import type { WorkspaceTab } from "../../store/types";
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
}: {
  group: TabGroup;
  tabs: WorkspaceTab[];
  /** 1-based position in the split tree, for the accessible name. */
  index: number;
  focused: boolean;
  style: CSSProperties;
  /** The session is on screen; a parked session keeps its strips out of the DOM. */
  visible: boolean;
}) {
  const { t } = useTranslation();
  const openTab = useAppStore((state) => state.openTab);
  const focusGroup = useAppStore((state) => state.focusGroup);

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
      style={style}
      onPointerDown={() => focusGroup(group.session, group.id)}
      onMouseDown={(event) => {
        // The strip is a control surface, but pressing it must not take focus
        // from the terminal: a drag that splits the focused tab keeps the same
        // `focused` prop, so xterm would never be asked for the keyboard back.
        // Cancelling the mouse event's default keeps the activeElement where it
        // was; click/double-click still fire, so rename and middle-click work.
        if (event.button === 0) event.preventDefault();
      }}
    >
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
