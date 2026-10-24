import { describe, expect, it } from "vitest";
import {
  groupRects,
  isSameOrder,
  isSplitDropNoOp,
  leafGroups,
  moveWithin,
  pickNextActiveTab,
  resolveDropZone,
  removeGroup,
  splitAt,
  splitRects,
  type GroupLayout,
  type TabGroup,
} from "./tab-groups";

const leaf = (groupId: string): GroupLayout => ({
  kind: "leaf",
  id: `leaf:${groupId}`,
  groupId,
});

const split = (
  id: string,
  direction: "row" | "column",
  ratio: number,
  first: GroupLayout,
  second: GroupLayout,
): GroupLayout => ({ kind: "split", id, direction, ratio, first, second });

const group = (order: string[], active: string, recent: string[] = order): TabGroup => ({
  id: "group-a",
  session: "alpha",
  tabOrder: order,
  activeTabId: active,
  recentTabIds: recent,
});

describe("group rectangles", () => {
  it("divides a row by the ratio and keeps the second half on the right", () => {
    expect([...groupRects(split("s1", "row", 0.3, leaf("a"), leaf("b")))]).toEqual([
      ["a", { left: 0, top: 0, width: 0.3, height: 1 }],
      ["b", { left: 0.3, top: 0, width: 0.7, height: 1 }],
    ]);
  });

  it("multiplies nested ratios instead of flattening them", () => {
    const layout = split(
      "root",
      "row",
      0.5,
      leaf("a"),
      split("inner", "column", 0.25, leaf("b"), leaf("c")),
    );

    expect([...groupRects(layout)]).toEqual([
      ["a", { left: 0, top: 0, width: 0.5, height: 1 }],
      ["b", { left: 0.5, top: 0, width: 0.5, height: 0.25 }],
      ["c", { left: 0.5, top: 0.25, width: 0.5, height: 0.75 }],
    ]);
  });

  it("accepts a live ratio override for a divider drag", () => {
    const layout = split("root", "row", 0.5, leaf("a"), leaf("b"));
    const rects = groupRects(layout, { root: 0.7 });

    expect(rects.get("a")?.width).toBeCloseTo(0.7);
    expect(rects.get("b")?.left).toBeCloseTo(0.7);
  });

  it("clamps a corrupt ratio rather than painting outside the surface", () => {
    const rects = groupRects(split("root", "column", Number.NaN, leaf("a"), leaf("b")));
    expect(rects.get("a")?.height).toBe(0.5);
  });
});

describe("split rectangles", () => {
  it("reports each split's own area, including nested ones", () => {
    const layout = split(
      "root",
      "row",
      0.4,
      leaf("a"),
      split("inner", "column", 0.75, leaf("b"), leaf("c")),
    );

    expect(splitRects(layout)).toEqual([
      { id: "root", direction: "row", ratio: 0.4, rect: { left: 0, top: 0, width: 1, height: 1 } },
      {
        id: "inner",
        direction: "column",
        ratio: 0.75,
        rect: { left: 0.4, top: 0, width: 0.6, height: 1 },
      },
    ]);
  });
});

describe("splitting a pane", () => {
  const base = split("root", "row", 0.5, leaf("a"), leaf("b"));

  it("puts the new group on the left of the target", () => {
    const next = splitAt(base, "b", "left", "c", "s2");
    expect(leafGroups(next)).toEqual(["a", "c", "b"]);
    expect(next.kind).toBe("split");
    if (next.kind === "split") {
      expect(next.direction).toBe("row");
      expect(next.second.kind).toBe("split");
    }
  });

  it("puts the new group on the right of the target", () => {
    const next = splitAt(base, "a", "right", "c", "s2");
    expect(leafGroups(next)).toEqual(["a", "c", "b"]);
  });

  it("uses a column for top and bottom", () => {
    const top = splitAt(base, "a", "top", "c", "s2");
    const bottom = splitAt(base, "b", "bottom", "c", "s3");

    expect(leafGroups(top)).toEqual(["c", "a", "b"]);
    expect(leafGroups(bottom)).toEqual(["a", "b", "c"]);
    if (top.kind === "split" && top.first.kind === "split") expect(top.first.direction).toBe("column");
    if (bottom.kind === "split" && bottom.second.kind === "split") {
      expect(bottom.second.direction).toBe("column");
    }
  });
});

describe("removing a group", () => {
  it("collapses its parent and gives the space to the sibling", () => {
    const layout = split("root", "row", 0.4, leaf("a"), leaf("b"));
    expect(removeGroup(layout, "a")).toEqual(leaf("b"));
    expect(removeGroup(layout, "b")).toEqual(leaf("a"));
  });

  it("collapses nested splits one level at a time", () => {
    const layout = split(
      "root",
      "row",
      0.5,
      leaf("a"),
      split("inner", "column", 0.25, leaf("b"), leaf("c")),
    );
    expect(leafGroups(removeGroup(layout, "c")!)).toEqual(["a", "b"]);
    expect(leafGroups(removeGroup(layout, "a")!)).toEqual(["b", "c"]);
  });

  it("returns null when the only leaf goes", () => {
    expect(removeGroup(leaf("a"), "a")).toBeNull();
  });
});

describe("split drop no-op", () => {
  const layout = split("root", "row", 0.5, leaf("a"), leaf("b"));

  it("is a no-op for a one-tab group dropped on its own edge", () => {
    expect(
      isSplitDropNoOp({
        layout,
        sourceGroupId: "a",
        targetGroupId: "a",
        zone: "left",
        sourceTabCount: 1,
      }),
    ).toBe(true);
  });

  it("is a no-op on the matching edge of a direct sibling", () => {
    expect(
      isSplitDropNoOp({
        layout,
        sourceGroupId: "b",
        targetGroupId: "a",
        zone: "right",
        sourceTabCount: 1,
      }),
    ).toBe(true);
    expect(
      isSplitDropNoOp({
        layout,
        sourceGroupId: "a",
        targetGroupId: "b",
        zone: "left",
        sourceTabCount: 1,
      }),
    ).toBe(true);
  });

  it("is not a no-op when the drop would swap the two panes", () => {
    expect(
      isSplitDropNoOp({
        layout,
        sourceGroupId: "b",
        targetGroupId: "a",
        zone: "left",
        sourceTabCount: 1,
      }),
    ).toBe(false);
    expect(
      isSplitDropNoOp({
        layout,
        sourceGroupId: "a",
        targetGroupId: "b",
        zone: "right",
        sourceTabCount: 1,
      }),
    ).toBe(false);
  });

  it("is never a no-op when the source group keeps other tabs", () => {
    expect(
      isSplitDropNoOp({
        layout,
        sourceGroupId: "b",
        targetGroupId: "b",
        zone: "left",
        sourceTabCount: 2,
      }),
    ).toBe(false);
  });

  it("recognises a matching edge inside a nested column", () => {
    const nested = split(
      "root",
      "row",
      0.5,
      leaf("a"),
      split("inner", "column", 0.5, leaf("b"), leaf("c")),
    );
    expect(
      isSplitDropNoOp({
        layout: nested,
        sourceGroupId: "c",
        targetGroupId: "b",
        zone: "bottom",
        sourceTabCount: 1,
      }),
    ).toBe(true);
  });
});

describe("choosing the next active tab", () => {
  it("returns to the most recent tab that is still open", () => {
    expect(pickNextActiveTab(group(["a", "b", "c"], "b", ["a", "c", "b"]), "b", ["a", "c"])).toBe(
      "c",
    );
  });

  it("skips closed tabs in the history", () => {
    expect(
      pickNextActiveTab(group(["a", "b", "c"], "c", ["b", "c", "a"]), "c", ["a", "b"]),
    ).toBe("a");
  });

  it("falls back to the tab that took the closed tab's place", () => {
    expect(pickNextActiveTab(group(["a", "b", "c"], "b", []), "b", ["a", "c"])).toBe("c");
    expect(pickNextActiveTab(group(["a", "b", "c"], "c", []), "c", ["a", "b"])).toBe("b");
  });

  it("returns null for a group that has no tabs left", () => {
    expect(pickNextActiveTab(group(["a"], "a", []), "a", [])).toBeNull();
  });
});

describe("tab order", () => {
  it("moves a tab before another one", () => {
    expect(moveWithin(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
    expect(moveWithin(["a", "b", "c"], "a", "c")).toEqual(["b", "a", "c"]);
  });

  it("appends when there is no before target", () => {
    expect(moveWithin(["a", "b", "c"], "a", null)).toEqual(["b", "c", "a"]);
  });

  it("compares orders by value", () => {
    expect(isSameOrder(["a", "b"], ["a", "b"])).toBe(true);
    expect(isSameOrder(["a", "b"], ["b", "a"])).toBe(false);
  });
});

describe("drop zones", () => {
  const rect = { left: 0, top: 0, width: 100, height: 100 };

  it("finds the four edges and the centre", () => {
    expect(resolveDropZone(rect, { x: 5, y: 50 })).toBe("left");
    expect(resolveDropZone(rect, { x: 95, y: 50 })).toBe("right");
    expect(resolveDropZone(rect, { x: 50, y: 5 })).toBe("top");
    expect(resolveDropZone(rect, { x: 50, y: 95 })).toBe("bottom");
    expect(resolveDropZone(rect, { x: 50, y: 50 })).toBe("center");
  });

  it("resolves a corner to the nearer edge", () => {
    expect(resolveDropZone(rect, { x: 2, y: 8 })).toBe("left");
    expect(resolveDropZone(rect, { x: 8, y: 2 })).toBe("top");
  });
});
