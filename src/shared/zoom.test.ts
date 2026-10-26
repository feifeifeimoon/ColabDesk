import { describe, expect, it } from "vitest";
import {
  PAGE_ZOOM_MAX,
  PAGE_ZOOM_MIN,
  UI_ZOOM_MAX,
  UI_ZOOM_MIN,
  clampUiZoomLevel,
  normalizeStoredZoomLevel,
  stepUiZoomLevel,
  uiZoomPercent,
} from "./zoom";

describe("uiZoomPercent", () => {
  it("is 100% at level 0 and scales by 1.2 per level", () => {
    expect(uiZoomPercent(0)).toBe(100);
    expect(uiZoomPercent(1)).toBe(120);
    expect(uiZoomPercent(0.5)).toBe(110);
    expect(uiZoomPercent(-0.5)).toBe(91);
  });

  it("shows the stepper's ends", () => {
    expect(uiZoomPercent(UI_ZOOM_MIN)).toBe(58);
    expect(uiZoomPercent(UI_ZOOM_MAX)).toBe(249);
  });
});

describe("clampUiZoomLevel", () => {
  it("keeps the stepper inside its range and turns a bad value into 100%", () => {
    expect(clampUiZoomLevel(UI_ZOOM_MIN - 1)).toBe(UI_ZOOM_MIN);
    expect(clampUiZoomLevel(UI_ZOOM_MAX + 1)).toBe(UI_ZOOM_MAX);
    expect(clampUiZoomLevel(Number.NaN)).toBe(0);
  });
});

describe("normalizeStoredZoomLevel", () => {
  it("keeps a value a zoom chord may have left outside the stepper's range", () => {
    expect(normalizeStoredZoomLevel(-3.5)).toBe(-3.5);
    expect(normalizeStoredZoomLevel(6)).toBe(6);
  });

  it("clamps to Electron's accepted range and falls back to 100%", () => {
    expect(normalizeStoredZoomLevel(PAGE_ZOOM_MIN - 2)).toBe(PAGE_ZOOM_MIN);
    expect(normalizeStoredZoomLevel(PAGE_ZOOM_MAX + 2)).toBe(PAGE_ZOOM_MAX);
    expect(normalizeStoredZoomLevel(Number.NaN)).toBe(0);
  });
});

describe("stepUiZoomLevel", () => {
  it("steps inside the range and stops at its ends", () => {
    expect(stepUiZoomLevel(0, 0.5)).toBe(0.5);
    expect(stepUiZoomLevel(0, -0.5)).toBe(-0.5);
    expect(stepUiZoomLevel(UI_ZOOM_MAX, 0.5)).toBe(UI_ZOOM_MAX);
    expect(stepUiZoomLevel(UI_ZOOM_MIN, -0.5)).toBe(UI_ZOOM_MIN);
  });

  it("moves a page outside the range toward it, not across it", () => {
    // Zoom-in at 7 must not jump to 5 (which would shrink the page).
    expect(stepUiZoomLevel(7, 0.5)).toBe(7);
    expect(stepUiZoomLevel(7, -0.5)).toBe(6.5);
    expect(stepUiZoomLevel(-8, -0.5)).toBe(-8);
    expect(stepUiZoomLevel(-8, 0.5)).toBe(-7.5);
    // The step that reaches the boundary lands on it.
    expect(stepUiZoomLevel(5.2, -0.5)).toBe(UI_ZOOM_MAX);
    expect(stepUiZoomLevel(-3.2, 0.5)).toBe(UI_ZOOM_MIN);
  });
});
