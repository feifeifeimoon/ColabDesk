import type { BrowserWindow } from "electron";
import { describe, expect, it, vi } from "vitest";
import { syncTrafficLightPosition, trafficLightPosition } from "./window";

describe("trafficLightPosition", () => {
  it("centers the 12px traffic lights in the 40px top bar at 1x zoom", () => {
    expect(trafficLightPosition()).toEqual({ x: 14, y: 14 });
    expect(trafficLightPosition(1)).toEqual({ x: 14, y: 14 });
  });

  it("scales the top bar center with zoomFactor while keeping button size and x fixed", () => {
    expect(trafficLightPosition(0.5)).toEqual({ x: 14, y: 4 });
    expect(trafficLightPosition(0.7)).toEqual({ x: 14, y: 8 });
    expect(trafficLightPosition(1.5)).toEqual({ x: 14, y: 24 });
  });

  it("clamps y to 0 on extreme zoom out and falls back to 1x on invalid factors", () => {
    expect(trafficLightPosition(0.2)).toEqual({ x: 14, y: 0 });
    expect(trafficLightPosition(0)).toEqual({ x: 14, y: 14 });
    expect(trafficLightPosition(Number.NaN)).toEqual({ x: 14, y: 14 });
  });
});

describe("syncTrafficLightPosition", () => {
  it("updates the native window button position on macOS when the window is alive", () => {
    const setWindowButtonPosition = vi.fn();
    const win = {
      isDestroyed: () => false,
      setWindowButtonPosition,
    } as unknown as BrowserWindow;

    syncTrafficLightPosition(win, 0.7, "darwin");

    expect(setWindowButtonPosition).toHaveBeenCalledWith({ x: 14, y: 8 });
  });

  it("does nothing on non-macOS platforms or destroyed windows", () => {
    const setWindowButtonPosition = vi.fn();
    const alive = {
      isDestroyed: () => false,
      setWindowButtonPosition,
    } as unknown as BrowserWindow;
    const destroyed = {
      isDestroyed: () => true,
      setWindowButtonPosition,
    } as unknown as BrowserWindow;

    syncTrafficLightPosition(alive, 0.7, "win32");
    syncTrafficLightPosition(destroyed, 0.7, "darwin");

    expect(setWindowButtonPosition).not.toHaveBeenCalled();
  });
});
