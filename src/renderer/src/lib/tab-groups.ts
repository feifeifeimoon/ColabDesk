/**
 * The pane model: tabs belong to a tab group, and groups form a binary split
 * tree. A group is a pane with its own tab strip; only its active tab is shown.
 *
 * Everything here is a pure function over plain data. The store owns the state
 * and the DOM owns the pixels; keeping the tree arithmetic out of both is what
 * lets the drag preview and the committed layout share one answer.
 */

/** `row` puts the first group left of the second; `column` puts it above. */
export type GroupDirection = "row" | "column";

/** A split zone, named after where the *new* group lands. */
export type PaneZone = "left" | "right" | "top" | "bottom";
export type DropZone = PaneZone | "center";

export interface PaneRect {
  /** Fractions of the containing surface, 0–1. */
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TabGroup {
  id: string;
  session: string;
  /** The group's own strip order. This is the order, not the flat tab list. */
  tabOrder: string[];
  activeTabId: string;
  /** Most-recently-used first at the tail; closing the active tab falls back here. */
  recentTabIds: string[];
}

export type GroupLayout =
  | { kind: "leaf"; id: string; groupId: string }
  | {
      kind: "split";
      id: string;
      direction: GroupDirection;
      /** Share of the first child, 0.15–0.85. */
      ratio: number;
      first: GroupLayout;
      second: GroupLayout;
    };

export const MIN_RATIO = 0.15;
export const MAX_RATIO = 0.85;
export const DEFAULT_RATIO = 0.5;
/** The pane's own tab row; the content starts below it. */
export const GROUP_STRIP_HEIGHT = 32;
/** A divider drag keeps this much room on each side when the surface allows it.
    A file pane's head (path + view toggle + Save) is the widest fixed content a
    split has to keep usable, so the floor is a pane's floor, not a terminal's. */
export const MIN_GROUP_PX = 240;

let nextId = 0;

/** Group ids are global: one record holds every session's groups. */
export function createGroupId(session: string): string {
  nextId += 1;
  return `${session}:group:${nextId}`;
}

export function createSplitId(session: string): string {
  nextId += 1;
  return `${session}:split:${nextId}`;
}

/** A leaf is owned by its group; the id is derivable and never has to travel. */
export function leafIdFor(groupId: string): string {
  return `leaf:${groupId}`;
}

export function leafLayout(groupId: string): GroupLayout {
  return { kind: "leaf", id: leafIdFor(groupId), groupId };
}

export function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_RATIO;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, value));
}

/**
 * The rectangle each group occupies, including its own strip. Nested ratios
 * multiply, so the result is exactly what a percentage-positioned flat slot
 * needs. `overrides` is for a live divider drag: the tree is not committed yet.
 */
export function groupRects(
  layout: GroupLayout,
  overrides?: Record<string, number>,
): Map<string, PaneRect> {
  const rects = new Map<string, PaneRect>();
  const walk = (node: GroupLayout, rect: PaneRect): void => {
    if (node.kind === "leaf") {
      rects.set(node.groupId, rect);
      return;
    }
    const ratio = clampRatio(overrides?.[node.id] ?? node.ratio);
    if (node.direction === "row") {
      walk(node.first, { ...rect, width: rect.width * ratio });
      walk(node.second, {
        left: rect.left + rect.width * ratio,
        top: rect.top,
        width: rect.width * (1 - ratio),
        height: rect.height,
      });
      return;
    }
    walk(node.first, { ...rect, height: rect.height * ratio });
    walk(node.second, {
      left: rect.left,
      top: rect.top + rect.height * ratio,
      width: rect.width,
      height: rect.height * (1 - ratio),
    });
  };
  walk(layout, { left: 0, top: 0, width: 1, height: 1 });
  return rects;
}

export interface SplitRect {
  id: string;
  direction: GroupDirection;
  ratio: number;
  rect: PaneRect;
}

/** Every split node's own area, for placing a divider and dragging its ratio. */
export function splitRects(
  layout: GroupLayout,
  overrides?: Record<string, number>,
): SplitRect[] {
  const splits: SplitRect[] = [];
  const walk = (node: GroupLayout, rect: PaneRect): void => {
    if (node.kind === "leaf") return;
    const ratio = clampRatio(overrides?.[node.id] ?? node.ratio);
    splits.push({ id: node.id, direction: node.direction, ratio, rect });
    if (node.direction === "row") {
      walk(node.first, { ...rect, width: rect.width * ratio });
      walk(node.second, {
        left: rect.left + rect.width * ratio,
        top: rect.top,
        width: rect.width * (1 - ratio),
        height: rect.height,
      });
      return;
    }
    walk(node.first, { ...rect, height: rect.height * ratio });
    walk(node.second, {
      left: rect.left,
      top: rect.top + rect.height * ratio,
      width: rect.width,
      height: rect.height * (1 - ratio),
    });
  };
  walk(layout, { left: 0, top: 0, width: 1, height: 1 });
  return splits;
}

/** Group ids in visual order: first subtree left/above, then second. */
export function leafGroups(layout: GroupLayout): string[] {
  if (layout.kind === "leaf") return [layout.groupId];
  return [...leafGroups(layout.first), ...leafGroups(layout.second)];
}

function firstGroupId(layout: GroupLayout): string {
  return layout.kind === "leaf" ? layout.groupId : firstGroupId(layout.first);
}

/**
 * The pane that takes a removed group's place: the first leaf of the other
 * child of its parent split. In `[[A / B] | C]`, removing B focuses A, not C.
 */
export function findSiblingGroupId(layout: GroupLayout, groupId: string): string | null {
  if (layout.kind === "leaf") return null;
  if (layout.first.kind === "leaf" && layout.first.groupId === groupId) {
    return firstGroupId(layout.second);
  }
  if (layout.second.kind === "leaf" && layout.second.groupId === groupId) {
    return firstGroupId(layout.first);
  }
  return (
    findSiblingGroupId(layout.first, groupId) ?? findSiblingGroupId(layout.second, groupId)
  );
}

/**
 * The fallback when a session has no remembered pane, or the removed pane has no
 * sibling: the last leaf in visual order. `openSession`, `reconcile` and the
 * number-key focus all use this one policy.
 */
export function lastGroupId(layout: GroupLayout): string {
  return layout.kind === "leaf" ? layout.groupId : lastGroupId(layout.second);
}

export function findGroupLeaf(layout: GroupLayout, groupId: string): GroupLayout | null {
  if (layout.kind === "leaf") return layout.groupId === groupId ? layout : null;
  return findGroupLeaf(layout.first, groupId) ?? findGroupLeaf(layout.second, groupId);
}

/** Commits a divider's ratio without rebuilding the rest of the tree. */
export function setSplitRatio(layout: GroupLayout, splitId: string, ratio: number): GroupLayout {
  if (layout.kind === "leaf") return layout;
  if (layout.id === splitId) return { ...layout, ratio: clampRatio(ratio) };

  const first = setSplitRatio(layout.first, splitId, ratio);
  const second = setSplitRatio(layout.second, splitId, ratio);
  if (first === layout.first && second === layout.second) return layout;
  return { ...layout, first, second };
}

/** Splits the target group's leaf. The target keeps its own id; the new group
 * gets the remaining half. Left/top puts the new group first. */
export function splitAt(
  layout: GroupLayout,
  targetGroupId: string,
  zone: PaneZone,
  newGroupId: string,
  newSplitId: string,
): GroupLayout {
  if (layout.kind === "leaf") {
    if (layout.groupId !== targetGroupId) return layout;
    const newLeaf = leafLayout(newGroupId);
    const direction: GroupDirection = zone === "left" || zone === "right" ? "row" : "column";
    const newFirst = zone === "left" || zone === "top";
    return {
      kind: "split",
      id: newSplitId,
      direction,
      ratio: DEFAULT_RATIO,
      first: newFirst ? newLeaf : layout,
      second: newFirst ? layout : newLeaf,
    };
  }
  return {
    ...layout,
    first: splitAt(layout.first, targetGroupId, zone, newGroupId, newSplitId),
    second: splitAt(layout.second, targetGroupId, zone, newGroupId, newSplitId),
  };
}

/** Removes a group's leaf, collapsing the parent split into its sibling. */
export function removeGroup(layout: GroupLayout, groupId: string): GroupLayout | null {
  if (layout.kind === "leaf") return layout.groupId === groupId ? null : layout;

  const first = removeGroup(layout.first, groupId);
  const second = removeGroup(layout.second, groupId);
  if (!first) return second;
  if (!second) return first;
  return { ...layout, first, second };
}

/** Drops empty split nodes and keeps ratios in range. A leaf is a valid tree. */
export function normalizeLayout(layout: GroupLayout | null): GroupLayout | null {
  if (!layout) return null;
  if (layout.kind === "leaf") return layout;
  const first = normalizeLayout(layout.first);
  const second = normalizeLayout(layout.second);
  if (!first) return second;
  if (!second) return first;
  return { ...layout, ratio: clampRatio(layout.ratio), first, second };
}

/**
 * The side of a pane the pointer is nearest to. The outer fifth is the edge
 * band; corners resolve to the nearest edge. Anything else is the centre.
 */
export function resolveDropZone(
  rect: { left: number; top: number; width: number; height: number },
  point: { x: number; y: number },
  edgeRatio = 0.2,
): DropZone {
  const dxLeft = point.x - rect.left;
  const dxRight = rect.left + rect.width - point.x;
  const dyTop = point.y - rect.top;
  const dyBottom = rect.top + rect.height - point.y;

  const thresholdX = rect.width * edgeRatio;
  const thresholdY = rect.height * edgeRatio;
  const candidates: Array<{ zone: DropZone; distance: number }> = [];

  if (thresholdX > 0) {
    if (dxLeft <= thresholdX) candidates.push({ zone: "left", distance: dxLeft / thresholdX });
    if (dxRight <= thresholdX) candidates.push({ zone: "right", distance: dxRight / thresholdX });
  }
  if (thresholdY > 0) {
    if (dyTop <= thresholdY) candidates.push({ zone: "top", distance: dyTop / thresholdY });
    if (dyBottom <= thresholdY) candidates.push({ zone: "bottom", distance: dyBottom / thresholdY });
  }

  if (candidates.length === 0) return "center";
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0]!.zone;
}

/** The direct sibling a one-tab group would land beside, if that side matches. */
function siblingOnSplitSide(
  layout: GroupLayout,
  targetGroupId: string,
  zone: PaneZone,
): string | null {
  if (layout.kind === "leaf") return null;

  if (layout.first.kind === "leaf" && layout.first.groupId === targetGroupId) {
    if (layout.direction === "row" && zone === "right" && layout.second.kind === "leaf") {
      return layout.second.groupId;
    }
    if (layout.direction === "column" && zone === "bottom" && layout.second.kind === "leaf") {
      return layout.second.groupId;
    }
  }
  if (layout.second.kind === "leaf" && layout.second.groupId === targetGroupId) {
    if (layout.direction === "row" && zone === "left" && layout.first.kind === "leaf") {
      return layout.first.groupId;
    }
    if (layout.direction === "column" && zone === "top" && layout.first.kind === "leaf") {
      return layout.first.groupId;
    }
  }

  return (
    siblingOnSplitSide(layout.first, targetGroupId, zone) ??
    siblingOnSplitSide(layout.second, targetGroupId, zone)
  );
}

/**
 * True when splitting this tab out would reproduce the layout it is already in:
 * a one-tab group dropped on its own edge, or on the matching edge of its
 * direct sibling. The old ratios must survive such a drop.
 */
export function isSplitDropNoOp(args: {
  layout: GroupLayout | null;
  sourceGroupId: string;
  targetGroupId: string;
  zone: PaneZone;
  sourceTabCount: number;
}): boolean {
  if (args.sourceGroupId === args.targetGroupId && args.sourceTabCount <= 1) return true;
  if (args.sourceTabCount !== 1 || !args.layout) return false;
  return siblingOnSplitSide(args.layout, args.targetGroupId, args.zone) === args.sourceGroupId;
}

export function pushRecent(recentTabIds: string[], tabId: string): string[] {
  const without = recentTabIds.filter((id) => id !== tabId);
  without.push(tabId);
  return without.slice(-50);
}

/**
 * Which tab a group shows after the active one leaves it. Orca returns to the
 * previously active tab; the order's neighbour is the fallback when there is no
 * history (the tab after the closing one, or the last one).
 */
export function pickNextActiveTab(
  group: TabGroup,
  leavingTabId: string,
  remainingTabIds: string[],
): string | null {
  if (remainingTabIds.length === 0) return null;
  const remaining = new Set(remainingTabIds);

  for (let index = group.recentTabIds.length - 1; index >= 0; index -= 1) {
    const id = group.recentTabIds[index]!;
    if (id !== leavingTabId && remaining.has(id)) return id;
  }

  const oldIndex = group.tabOrder.indexOf(leavingTabId);
  if (oldIndex >= 0) return remainingTabIds[Math.min(oldIndex, remainingTabIds.length - 1)]!;
  return remainingTabIds[remainingTabIds.length - 1]!;
}

/** Puts `tabId` before `beforeTabId`; `null` appends it to the strip. */
export function moveWithin(
  tabOrder: string[],
  tabId: string,
  beforeTabId: string | null,
): string[] {
  const without = tabOrder.filter((id) => id !== tabId);
  if (beforeTabId === null) return [...without, tabId];
  const index = without.indexOf(beforeTabId);
  if (index < 0) return [...without, tabId];
  without.splice(index, 0, tabId);
  return without;
}

export function isSameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}
