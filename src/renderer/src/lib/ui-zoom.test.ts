/**
 * The zoom preference's storage and startup application, away from the store.
 * A corrupt or unreadable value must behave like "never chosen"; a stored one
 * must land on the page before the first paint.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  setZoomLevel: vi.fn(),
  zoomLevel: vi.fn(() => 0),
}));
const windowZoom = vi.hoisted(() => ({ syncWindowZoom: vi.fn() }));

vi.mock("./api", () => api);
vi.mock("./window-zoom", () => windowZoom);

import {
  applyStoredZoomLevel,
  applyZoomLevel,
  currentZoomLevel,
  readStoredZoomLevel,
  saveZoomLevel,
} from "./ui-zoom";

const KEY = "colabdesk.uiZoomLevel";
const storage = new Map<string, string>();
let getThrows = false;
let setThrows = false;

vi.stubGlobal("localStorage", {
  getItem: (key: string) => {
    if (getThrows) throw new Error("storage disabled");
    return storage.get(key) ?? null;
  },
  setItem: (key: string, value: string) => {
    if (setThrows) throw new Error("quota exceeded");
    storage.set(key, value);
  },
});

beforeEach(() => {
  storage.clear();
  getThrows = false;
  setThrows = false;
  api.setZoomLevel.mockClear();
  api.zoomLevel.mockReset().mockReturnValue(0);
  windowZoom.syncWindowZoom.mockClear();
});

describe("readStoredZoomLevel", () => {
  it("is null until the setting has been chosen", () => {
    expect(readStoredZoomLevel()).toBeNull();
  });

  it("reads a stored level and clamps it to Electron's range", () => {
    storage.set(KEY, "0.5");
    expect(readStoredZoomLevel()).toBe(0.5);
    storage.set(KEY, "12");
    expect(readStoredZoomLevel()).toBe(9);
    storage.set(KEY, "-20");
    expect(readStoredZoomLevel()).toBe(-8);
  });

  it("treats a corrupt or unreadable value as absent", () => {
    storage.set(KEY, "not-a-number");
    expect(readStoredZoomLevel()).toBeNull();
    getThrows = true;
    expect(readStoredZoomLevel()).toBeNull();
  });
});

describe("saveZoomLevel", () => {
  it("writes the level, and a storage failure does not throw", () => {
    saveZoomLevel(1.5);
    expect(storage.get(KEY)).toBe("1.5");
    setThrows = true;
    expect(() => saveZoomLevel(2)).not.toThrow();
  });
});

describe("applying the zoom", () => {
  it("applies a stored level before the first paint and publishes the factor", () => {
    storage.set(KEY, "1");

    applyStoredZoomLevel();

    expect(api.setZoomLevel).toHaveBeenCalledWith(1);
    expect(windowZoom.syncWindowZoom).toHaveBeenCalledTimes(1);
  });

  it("with nothing stored, leaves the page's level alone but publishes the factor", () => {
    applyStoredZoomLevel();

    expect(api.setZoomLevel).not.toHaveBeenCalled();
    expect(windowZoom.syncWindowZoom).toHaveBeenCalledTimes(1);
  });

  it("normalizes a level outside Electron's range", () => {
    applyZoomLevel(12);
    expect(api.setZoomLevel).toHaveBeenCalledWith(9);
    expect(windowZoom.syncWindowZoom).toHaveBeenCalledTimes(1);
  });

  it("reads the level the page is actually wearing", () => {
    api.zoomLevel.mockReturnValue(1.5);
    expect(currentZoomLevel()).toBe(1.5);
  });
});
