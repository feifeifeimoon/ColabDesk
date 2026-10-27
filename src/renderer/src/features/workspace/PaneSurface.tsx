import { useMemo, useRef, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import {
  GROUP_STRIP_HEIGHT,
  TITLEBAR_HEIGHT,
  groupRects,
  leafGroups,
  splitRects,
  type GroupLayout,
  type PaneRect,
  type SplitRect,
  type TabGroup,
} from "../../lib/tab-groups";
import { useAppStore } from "../../store";
import { useWorkspaceChrome } from "../../store/selectors";
import type { WorkspaceTab } from "../../store/types";
import { FileView } from "./FileView";
import { GroupStrip } from "./GroupStrip";
import { PaneDivider } from "./PaneDivider";
import { TerminalPane } from "./TerminalPane";

function pct(value: number): string {
  return `${value * 100}%`;
}

/** A top-row group's strip is the window titlebar, one rung taller. */
function stripHeightFor(rect: PaneRect): number {
  return Math.abs(rect.top) < 1e-6 ? TITLEBAR_HEIGHT : GROUP_STRIP_HEIGHT;
}

function contentStyle(rect: PaneRect): CSSProperties {
  const strip = stripHeightFor(rect);
  return {
    left: pct(rect.left),
    width: pct(rect.width),
    top: `calc(${pct(rect.top)} + ${strip}px)`,
    height: `calc(${pct(rect.height)} - ${strip}px)`,
  };
}

function stripStyle(rect: PaneRect): CSSProperties {
  return {
    left: pct(rect.left),
    top: pct(rect.top),
    width: pct(rect.width),
    height: stripHeightFor(rect),
  };
}

function escapeSelector(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}

function paintContent(element: HTMLElement, rect: PaneRect): void {
  const strip = stripHeightFor(rect);
  element.style.left = pct(rect.left);
  element.style.width = pct(rect.width);
  element.style.top = `calc(${pct(rect.top)} + ${strip}px)`;
  element.style.height = `calc(${pct(rect.height)} - ${strip}px)`;
}

function paintDivider(element: HTMLElement, split: SplitRect): void {
  if (split.direction === "row") {
    element.style.left = pct(split.rect.left + split.rect.width * split.ratio);
    element.style.top = pct(split.rect.top);
    element.style.height = pct(split.rect.height);
    return;
  }
  element.style.left = pct(split.rect.left);
  element.style.top = pct(split.rect.top + split.rect.height * split.ratio);
  element.style.width = pct(split.rect.width);
}

/**
 * One session's panes, drawn as a flat set of absolutely positioned slots.
 *
 * The flatness is load-bearing: a TerminalPane is a live xterm and an SSH
 * channel, so moving one tab from pane A to pane B must not move its component
 * to another parent. Every tab stays a direct child of this surface; a split,
 * a move, or a close only changes which slot is visible and where its rectangle
 * is. The group strips are separate chrome and never wrap terminal content.
 */
export function PaneSurface({
  session,
  tabs,
  groups,
  layout,
  focusedGroupId,
  shown,
}: {
  session: string;
  tabs: WorkspaceTab[];
  groups: Record<string, TabGroup>;
  layout: GroupLayout;
  focusedGroupId: string | undefined;
  /** The session is the one on screen; parked sessions keep their slots mounted. */
  shown: boolean;
}) {
  const { t } = useTranslation();
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const focusGroup = useAppStore((state) => state.focusGroup);
  const setGroupRatio = useAppStore((state) => state.setGroupRatio);
  const sidebarOpen = useAppStore((state) => state.sidebarOpen);
  const filesOpen = useAppStore((state) => state.filesOpen);
  const workspaceChrome = useWorkspaceChrome();

  const rects = useMemo(() => groupRects(layout), [layout]);
  const splits = useMemo(() => splitRects(layout), [layout]);
  const leaves = useMemo(() => leafGroups(layout), [layout]);
  const tabById = useMemo(() => new Map(tabs.map((tab) => [tab.id, tab])), [tabs]);
  const topLeaves = leaves.filter((groupId) => Math.abs(rects.get(groupId)?.top ?? 1) < 1e-6);
  const firstTop = topLeaves[0];
  const lastTop = topLeaves[topLeaves.length - 1];

  /** Divider preview: repaint every group, not just the dragged seam. */
  function paint(overrides: Record<string, number>): void {
    const surface = surfaceRef.current;
    if (!surface) return;

    for (const [groupId, rect] of groupRects(layout, overrides)) {
      const strip = surface.querySelector<HTMLElement>(
        `[data-group-strip-id="${escapeSelector(groupId)}"]`,
      );
      if (strip) {
        strip.style.left = pct(rect.left);
        strip.style.top = pct(rect.top);
        strip.style.width = pct(rect.width);
      }

      const slot = Array.from(surface.querySelectorAll<HTMLElement>(".pane-slot:not([hidden])")).find(
        (element) => element.dataset.groupId === groupId,
      );
      if (slot) paintContent(slot, rect);
    }

    for (const split of splitRects(layout, overrides)) {
      const divider = surface.querySelector<HTMLElement>(
        `[data-split-id="${escapeSelector(split.id)}"]`,
      );
      if (divider) paintDivider(divider, split);
    }
  }

  return (
    <div className="pane-surface" data-session={session} ref={surfaceRef}>
      {tabs.map((tab) => {
        const group = groups[tab.groupId];
        const rect = group ? rects.get(group.id) : undefined;
        const visible = shown && Boolean(group) && tab.id === group?.activeTabId;
        return (
          <div
            key={tab.id}
            className="pane-slot"
            data-tab-id={tab.id}
            data-group-id={tab.groupId}
            data-tone={tab.kind === "shell" ? "terminal" : "app"}
            hidden={!visible}
            inert={!visible}
            style={rect ? contentStyle(rect) : undefined}
            onPointerDownCapture={() => {
              if (group) focusGroup(session, group.id);
            }}
            onFocusCapture={() => {
              if (group) focusGroup(session, group.id);
            }}
          >
            {tab.kind === "shell" ? (
              <TerminalPane
                session={tab.session}
                visible={visible}
                focused={visible && group?.id === focusedGroupId}
              />
            ) : (
              <FileView
                session={tab.session}
                path={tab.path}
                name={tab.name}
                tabId={tab.id}
                visible={visible}
              />
            )}
          </div>
        );
      })}

      {/* Strips and dividers are chrome, not tab content. They are one local
          stack (isolated in the stylesheet), so a pane's z-indexes can never
          paint over a layer that covers the workbench. */}
      <div className="pane-chrome">
        {shown &&
          leaves.map((groupId, index) => {
            const group = groups[groupId];
            const rect = rects.get(groupId);
            if (!group || !rect) return null;
            const groupTabs = group.tabOrder
              .map((tabId) => tabById.get(tabId))
              .filter((tab): tab is WorkspaceTab => Boolean(tab));
            return (
              <GroupStrip
                key={groupId}
                group={group}
                tabs={groupTabs}
                index={index + 1}
                focused={groupId === focusedGroupId}
                style={stripStyle(rect)}
                visible={shown}
                titlebar={workspaceChrome && topLeaves.includes(groupId)}
                leading={workspaceChrome && !sidebarOpen && groupId === firstTop}
                trailing={
                  workspaceChrome && !filesOpen && groupId === lastTop
                    ? "calc(var(--window-controls-width, 0px) + 44px)"
                    : undefined
                }
              />
            );
          })}

        {shown &&
          splits.map((split, index) => (
            <PaneDivider
              key={split.id}
              split={split}
              label={`${t("workspace.resizePanes", "调整分屏大小")} ${index + 1}`}
              onPreview={(ratio) => paint({ [split.id]: ratio })}
              onCommit={(ratio) => setGroupRatio(session, split.id, ratio)}
            />
          ))}
      </div>
    </div>
  );
}
