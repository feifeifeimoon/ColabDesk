/**
 * The zoom actions in the preferences slice.
 *
 * The stepper's buttons enforce its ends; `setZoomLevel` must still accept a
 * step from a page that starts outside them, and `syncZoomLevel` must remember
 * a chord's level without applying it again. Storage and application are
 * mocked here; `ui-zoom.test.ts` covers those.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";
import type { PreferencesSlice } from "../types";

const zoomApi = vi.hoisted(() => ({
  readStoredZoomLevel: vi.fn<() => number | null>(() => 0.5),
  saveZoomLevel: vi.fn(),
  applyZoomLevel: vi.fn(),
}));

vi.mock("../../lib/ui-zoom", () => zoomApi);
vi.mock("../../lib/theme", () => ({
  readThemePreference: () => "system",
  resolveTheme: () => "light",
  applyTheme: () => "light",
  saveThemePreference: vi.fn(),
  toggleThemePreference: () => "dark",
}));
vi.mock("../../lib/terminal-appearance", () => ({
  readTerminalAppearance: () => ({}),
  normalizeTerminalAppearance: (value: unknown) => value,
  saveTerminalAppearance: vi.fn(),
}));
vi.mock("../../lib/terminal-theme", () => ({
  resolveTerminalThemeId: () => "titanium",
  applyTerminalThemeAttribute: vi.fn(),
}));
vi.mock("../../lib/panel-width", () => ({
  PANEL_WIDTH: { sidebar: { initial: 260 }, files: { initial: 320 } },
  clampPanelWidth: (_side: string, width: number) => width,
}));

import { createPreferencesSlice } from "./preferences";

const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storage.set(key, value);
  },
  removeItem: (key: string) => {
    storage.delete(key);
  },
});

function store() {
  return createStore<PreferencesSlice>()((set, get, api) =>
    createPreferencesSlice(set as never, get as never, api as never),
  );
}

beforeEach(() => {
  storage.clear();
  vi.clearAllMocks();
  zoomApi.readStoredZoomLevel.mockReturnValue(0.5);
});

describe("the zoom preference", () => {
  it("starts at the stored level", () => {
    expect(store().getState().zoomLevel).toBe(0.5);
  });

  it("applies and remembers a stepper choice", () => {
    const state = store();

    state.getState().setZoomLevel(1);

    expect(zoomApi.saveZoomLevel).toHaveBeenCalledWith(1);
    expect(zoomApi.applyZoomLevel).toHaveBeenCalledWith(1);
    expect(state.getState().zoomLevel).toBe(1);
  });

  it("accepts a step from outside the stepper's range instead of jumping to its edge", () => {
    const state = store();

    // The stepper's minus at level 7 asks for 6.5; clamping to 5 would make
    // one press drop the page most of two levels.
    state.getState().setZoomLevel(6.5);

    expect(state.getState().zoomLevel).toBe(6.5);
    expect(zoomApi.applyZoomLevel).toHaveBeenCalledWith(6.5);
  });

  it("normalizes a level outside Electron's range", () => {
    const state = store();

    state.getState().setZoomLevel(100);

    expect(zoomApi.saveZoomLevel).toHaveBeenCalledWith(9);
    expect(zoomApi.applyZoomLevel).toHaveBeenCalledWith(9);
    expect(state.getState().zoomLevel).toBe(9);
  });

  it("remembers a chord's level without applying it, and only when it changes", () => {
    const state = store();

    state.getState().syncZoomLevel(6.5);

    expect(zoomApi.saveZoomLevel).toHaveBeenCalledWith(6.5);
    expect(zoomApi.applyZoomLevel).not.toHaveBeenCalled();
    expect(state.getState().zoomLevel).toBe(6.5);

    state.getState().syncZoomLevel(6.5);
    expect(zoomApi.saveZoomLevel).toHaveBeenCalledTimes(1);
  });

  it("turns a corrupt reported level into 100%", () => {
    const state = store();

    state.getState().syncZoomLevel(Number.NaN);

    expect(zoomApi.saveZoomLevel).toHaveBeenCalledWith(0);
    expect(state.getState().zoomLevel).toBe(0);
  });
});

describe("copy on select", () => {
  it("is off until chosen, and is remembered", () => {
    const state = store();
    expect(state.getState().copyOnSelect).toBe(false);

    state.getState().setCopyOnSelect(true);
    expect(storage.get("colabdesk.terminal.copyOnSelect")).toBe("true");
    expect(state.getState().copyOnSelect).toBe(true);

    storage.set("colabdesk.terminal.copyOnSelect", "true");
    expect(store().getState().copyOnSelect).toBe(true);
  });
});
