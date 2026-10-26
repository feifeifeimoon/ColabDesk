import { describe, expect, it, vi } from "vitest";
import { syncWindowZoom, watchWindowZoom } from "./window-zoom";

function fakeEnv() {
  const properties = new Map<string, string>();
  const listeners = new Set<() => void>();
  return {
    properties,
    target: {
      setProperty: (name: string, value: string) => {
        properties.set(name, value);
      },
      addEventListener: (_type: "resize", listener: () => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_type: "resize", listener: () => void) => {
        listeners.delete(listener);
      },
    },
    emitResize: () => {
      for (const listener of listeners) listener();
    },
    listenerCount: () => listeners.size,
  };
}

describe("syncWindowZoom", () => {
  it("writes --ui-zoom-factor and repositions macOS traffic lights", () => {
    const env = fakeEnv();
    const syncButtons = vi.fn();

    const factor = syncWindowZoom({
      readZoomFactor: () => 0.8,
      syncButtons,
      isMac: true,
      setProperty: env.target.setProperty,
    });

    expect(factor).toBe(0.8);
    expect(env.properties.get("--ui-zoom-factor")).toBe("0.8");
    expect(syncButtons).toHaveBeenCalledWith(0.8);
  });

  it("writes --ui-zoom-factor without touching traffic lights on non-macOS", () => {
    const env = fakeEnv();
    const syncButtons = vi.fn();

    syncWindowZoom({
      readZoomFactor: () => 1.2,
      syncButtons,
      isMac: false,
      setProperty: env.target.setProperty,
    });

    expect(env.properties.get("--ui-zoom-factor")).toBe("1.2");
    expect(syncButtons).not.toHaveBeenCalled();
  });
});

describe("watchWindowZoom", () => {
  it("syncs on start, updates when resize changes zoomFactor, and ignores plain window resizes", () => {
    const env = fakeEnv();
    const syncButtons = vi.fn();
    let currentZoom = 1;

    const stop = watchWindowZoom({
      readZoomFactor: () => currentZoom,
      syncButtons,
      isMac: true,
      target: env.target,
    });

    expect(env.properties.get("--ui-zoom-factor")).toBe("1");
    expect(syncButtons).toHaveBeenCalledTimes(1);
    expect(syncButtons).toHaveBeenLastCalledWith(1);

    // A plain window drag-resize does not change zoomFactor.
    env.emitResize();
    expect(syncButtons).toHaveBeenCalledTimes(1);

    // Zooming out changes zoomFactor and triggers resize.
    currentZoom = 0.7;
    env.emitResize();
    expect(env.properties.get("--ui-zoom-factor")).toBe("0.7");
    expect(syncButtons).toHaveBeenCalledTimes(2);
    expect(syncButtons).toHaveBeenLastCalledWith(0.7);

    stop();
    expect(env.listenerCount()).toBe(0);
  });

  it("reports the level on start and after a zoom change, but not on a plain resize", () => {
    const env = fakeEnv();
    let factor = 1;
    let level = 0;
    const levels: number[] = [];

    const stop = watchWindowZoom({
      readZoomFactor: () => factor,
      readZoomLevel: () => level,
      onLevel: (next) => levels.push(next),
      syncButtons: vi.fn(),
      isMac: false,
      target: env.target,
    });

    expect(levels).toEqual([0]);

    factor = 1.2;
    level = 1;
    env.emitResize();
    expect(levels).toEqual([0, 1]);

    // A plain window resize moves neither the factor nor the level.
    env.emitResize();
    expect(levels).toEqual([0, 1]);

    stop();
  });
});
