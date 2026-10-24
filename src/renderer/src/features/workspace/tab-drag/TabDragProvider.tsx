import { useMemo, useState, type ReactNode } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  GROUP_STRIP_HEIGHT,
  groupRects,
  isSameOrder,
  isSplitDropNoOp,
  moveWithin,
  resolveDropZone,
  type DropZone,
  type PaneRect,
} from "../../../lib/tab-groups";
import { useAppStore } from "../../../store";
import {
  getDragPointer,
  isTabDragData,
  sameTarget,
  TAB_DRAG_ACTIVATION_DISTANCE,
  TabDragContext,
  type DropBounds,
  type TabDragData,
  type TabDropTarget,
} from "./tab-drag";
import { TabDragOverlay } from "./TabDragOverlay";

const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length > 0 ? hits : closestCenter(args);
};

function inside(point: { x: number; y: number }, rect: DOMRect | DropBounds): boolean {
  return (
    point.x >= rect.left &&
    point.x <= rect.left + rect.width &&
    point.y >= rect.top &&
    point.y <= rect.top + rect.height
  );
}

function toPixels(rect: PaneRect, surface: DOMRect): DropBounds {
  return {
    left: surface.left + rect.left * surface.width,
    top: surface.top + rect.top * surface.height,
    width: rect.width * surface.width,
    height: rect.height * surface.height,
  };
}

function halfBounds(rect: DropBounds, zone: DropZone): DropBounds {
  switch (zone) {
    case "left":
      return { ...rect, width: rect.width / 2 };
    case "right":
      return { ...rect, left: rect.left + rect.width / 2, width: rect.width / 2 };
    case "top":
      return { ...rect, height: rect.height / 2 };
    case "bottom":
      return { ...rect, top: rect.top + rect.height / 2, height: rect.height / 2 };
    case "center":
      return rect;
  }
}

function findSurface(session: string): HTMLElement | null {
  return (
    Array.from(document.querySelectorAll<HTMLElement>(".pane-surface")).find(
      (element) => element.dataset.session === session,
    ) ?? null
  );
}

/**
 * Reads the pointer against the visible strips and pane rectangles. This is a
 * geometric hit test rather than dnd-kit's `over`: the terminal canvas is a
 * child of a slot, and the pane body is not a droppable, so the target has to
 * come from the layout plus the surface's own rect.
 */
function resolveDropTarget(pointer: { x: number; y: number }, data: TabDragData): TabDropTarget | null {
  const store = useAppStore.getState();
  const layout = store.groupLayouts[data.session];
  const source = store.groups[data.groupId];
  if (!layout || !source) return null;

  const surface = findSurface(data.session);
  if (!surface) return null;
  const surfaceRect = surface.getBoundingClientRect();
  if (!inside(pointer, surfaceRect)) return null;

  // A strip owns reorder and cross-group moves before the pane body does.
  for (const strip of Array.from(
    surface.querySelectorAll<HTMLElement>("[data-group-strip-id]"),
  )) {
    if (!inside(pointer, strip.getBoundingClientRect())) continue;
    const groupId = strip.dataset.groupStripId;
    if (!groupId) return null;

    let beforeTabId: string | null = null;
    for (const tabElement of Array.from(
      strip.querySelectorAll<HTMLElement>("[data-tab-id]"),
    )) {
      if (tabElement.dataset.tabId === data.tabId) continue;
      const rect = tabElement.getBoundingClientRect();
      if (pointer.x < rect.left + rect.width / 2) {
        beforeTabId = tabElement.dataset.tabId ?? null;
        break;
      }
    }

    if (groupId === data.groupId) {
      const group = store.groups[groupId];
      if (!group) return null;
      if (isSameOrder(moveWithin(group.tabOrder, data.tabId, beforeTabId), group.tabOrder)) {
        return null;
      }
    }
    return { kind: "strip", groupId, beforeTabId };
  }

  for (const [groupId, groupRect] of groupRects(layout)) {
    const panel = toPixels(groupRect, surfaceRect);
    if (!inside(pointer, panel)) continue;

    const content = {
      left: panel.left,
      top: panel.top + GROUP_STRIP_HEIGHT,
      width: panel.width,
      height: panel.height - GROUP_STRIP_HEIGHT,
    };
    if (content.height <= 0) return null;

    const zone = resolveDropZone(content, pointer);
    if (zone === "center" && groupId === data.groupId) return null;
    if (
      zone !== "center" &&
      isSplitDropNoOp({
        layout,
        sourceGroupId: data.groupId,
        targetGroupId: groupId,
        zone,
        sourceTabCount: source.tabOrder.length,
      })
    ) {
      return null;
    }

    const targetGroup = store.groups[groupId];
    const activeTab = targetGroup
      ? store.tabs.find((tab) => tab.id === targetGroup.activeTabId)
      : undefined;
    return {
      kind: "pane",
      groupId,
      zone,
      bounds: halfBounds(panel, zone),
      tone: activeTab?.kind === "file" ? "app" : "terminal",
    };
  }

  return null;
}

/**
 * One dnd-kit context over the workbench. Sortable strips provide the sensors,
 * collisions and overlay; the pane edges/centre stay our geometry because a
 * split is not a sortable drop.
 */
export function TabDragProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<TabDragData | null>(null);
  const [target, setTarget] = useState<TabDropTarget | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: TAB_DRAG_ACTIVATION_DISTANCE },
    }),
  );

  const onDragStart = (event: DragStartEvent): void => {
    const data = event.active.data.current;
    if (!isTabDragData(data)) {
      setActive(null);
      setTarget(null);
      return;
    }
    setActive(data);
    setTarget(null);
  };

  const onDragMove = (event: DragMoveEvent): void => {
    const data = event.active.data.current;
    if (!isTabDragData(data)) return;
    const pointer = getDragPointer(event);
    if (!pointer) return;
    const next = resolveDropTarget(pointer, data);
    setTarget((current) => (sameTarget(current, next) ? current : next));
  };

  const onDragEnd = (event: DragEndEvent): void => {
    const data = event.active.data.current;
    setActive(null);
    setTarget(null);
    if (!isTabDragData(data)) return;

    const pointer = getDragPointer(event);
    const drop = pointer ? resolveDropTarget(pointer, data) : null;
    if (!drop) return;

    const store = useAppStore.getState();
    if (drop.kind === "strip") {
      if (drop.groupId === data.groupId) {
        store.reorderTab(drop.groupId, data.tabId, drop.beforeTabId);
      } else {
        store.moveTabToGroup(data.tabId, drop.groupId, drop.beforeTabId);
      }
      return;
    }
    if (drop.zone === "center") {
      store.moveTabToGroup(data.tabId, drop.groupId, null);
      return;
    }
    store.splitTabToGroup(data.tabId, drop.groupId, drop.zone);
  };

  const context = useMemo(
    () => ({ target, draggingTabId: active?.tabId ?? null }),
    [target, active?.tabId],
  );

  return (
    <TabDragContext.Provider value={context}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActive(null);
          setTarget(null);
        }}
      >
        {children}
        <DragOverlay dropAnimation={null}>
          {active ? <div className="tab-drag-chip">{active.label}</div> : null}
        </DragOverlay>
      </DndContext>
      <TabDragOverlay target={target} />
    </TabDragContext.Provider>
  );
}
