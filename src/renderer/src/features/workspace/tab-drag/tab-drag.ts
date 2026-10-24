import { createContext, useContext } from "react";
import type { DragEndEvent, DragMoveEvent, DragOverEvent } from "@dnd-kit/core";
import type { DropZone } from "../../../lib/tab-groups";

/**
 * One tab drag, from a strip into another strip or onto a pane edge/centre.
 * The state is deliberately outside the app store: it changes while the pointer
 * moves, and every store write re-runs every selector in the window.
 */
export interface TabDragData {
  kind: "tab";
  tabId: string;
  groupId: string;
  session: string;
  /** The name on the chip that follows the pointer. */
  label: string;
}

export interface DropBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type TabDropTarget =
  | { kind: "strip"; groupId: string; beforeTabId: string | null }
  | {
      kind: "pane";
      groupId: string;
      zone: DropZone;
      /** Viewport pixels of the half the new pane will occupy. */
      bounds: DropBounds;
      tone: "terminal" | "app";
    };

export interface TabDragContextValue {
  target: TabDropTarget | null;
  draggingTabId: string | null;
}

/** dnd-kit's own activation threshold; the click/drag authority on release. */
export const TAB_DRAG_ACTIVATION_DISTANCE = 12;

const EMPTY_DRAG: TabDragContextValue = { target: null, draggingTabId: null };

export const TabDragContext = createContext<TabDragContextValue>(EMPTY_DRAG);

export function useTabDrag(): TabDragContextValue {
  return useContext(TabDragContext);
}

export function isTabDragData(value: unknown): value is TabDragData {
  return Boolean(value) && typeof value === "object" && (value as TabDragData).kind === "tab";
}

type DragPointerEvent = Pick<
  DragMoveEvent | DragOverEvent | DragEndEvent,
  "activatorEvent" | "delta" | "active"
>;

/**
 * The pointer during a tab drag. Sortable tabs stay anchored (no transform),
 * while the drag chip follows the cursor, so the active item's translated rect
 * is not where the pointer is.
 */
export function getDragPointer(event: DragPointerEvent): { x: number; y: number } | null {
  const activator = event.activatorEvent;
  if (
    activator &&
    typeof activator === "object" &&
    "clientX" in activator &&
    "clientY" in activator &&
    typeof activator.clientX === "number" &&
    typeof activator.clientY === "number"
  ) {
    return {
      x: activator.clientX + event.delta.x,
      y: activator.clientY + event.delta.y,
    };
  }

  const initial = event.active.rect.current.initial;
  if (!initial) return null;
  return {
    x: initial.left + initial.width / 2 + event.delta.x,
    y: initial.top + initial.height / 2 + event.delta.y,
  };
}

export function sameTarget(a: TabDropTarget | null, b: TabDropTarget | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind || a.groupId !== b.groupId) return false;
  if (a.kind === "strip" && b.kind === "strip") return a.beforeTabId === b.beforeTabId;
  if (a.kind === "pane" && b.kind === "pane") return a.zone === b.zone;
  return false;
}
