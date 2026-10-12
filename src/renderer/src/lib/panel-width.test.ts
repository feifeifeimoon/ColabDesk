/**
 * The two rails' width arithmetic. It is pure on purpose: the drag, the arrow
 * keys and the stored value all go through these two calls, so a sign error or
 * a limit that leaks between the rails is caught here rather than on screen.
 */

import { describe, expect, it } from "vitest";
import { PANEL_WIDTH, clampPanelWidth, nextPanelWidth } from "./panel-width";

describe("clampPanelWidth", () => {
  it("holds a width inside its rail's limits", () => {
    expect(clampPanelWidth("sidebar", 10)).toBe(PANEL_WIDTH.sidebar.min);
    expect(clampPanelWidth("sidebar", 99_999)).toBe(PANEL_WIDTH.sidebar.max);
    expect(clampPanelWidth("sidebar", 300)).toBe(300);
  });

  it("keeps the rails' limits apart", () => {
    // The two rails are not the same size, so a width legal for one is not
    // silently legal for the other.
    expect(PANEL_WIDTH.files.max).toBeGreaterThan(PANEL_WIDTH.sidebar.max);
    expect(clampPanelWidth("files", 120)).toBe(PANEL_WIDTH.files.min);
  });
});

describe("nextPanelWidth", () => {
  it("adds the signed travel to where the drag started", () => {
    expect(nextPanelWidth("sidebar", 260, 40)).toBe(300);
    expect(nextPanelWidth("sidebar", 260, -40)).toBe(220);
  });

  it("stops at a limit instead of running past it", () => {
    expect(nextPanelWidth("sidebar", 260, -9999)).toBe(PANEL_WIDTH.sidebar.min);
    expect(nextPanelWidth("sidebar", 260, 9999)).toBe(PANEL_WIDTH.sidebar.max);
  });

  it("does not move once a limit is reached", () => {
    // Otherwise the rail would keep drifting while the pointer is past the edge.
    const atMax = PANEL_WIDTH.files.max;
    expect(nextPanelWidth("files", atMax, 50)).toBe(atMax);
    expect(nextPanelWidth("files", atMax, -50)).toBe(atMax - 50);
  });
});
