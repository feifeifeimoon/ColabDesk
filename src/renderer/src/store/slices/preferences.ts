/**
 * Preferences: the things the user chooses and the app remembers.
 *
 * The only slice that touches browser APIs (`localStorage`, the DOM attributes
 * the themes resolve to) — the theme's own storage and resolution live in
 * `lib/theme.ts`, and the terminal's in `lib/terminal-appearance.ts` and
 * `lib/terminal-theme.ts`. Those modules are reused rather than reimplemented,
 * which is also why the terminal's eight fields are one record here: they are
 * written whole, and the limits live next to the controls that offer them.
 */

import type { StateCreator } from "zustand";
import { clampUiZoomLevel, normalizeStoredZoomLevel } from "@shared/zoom";
import { PANEL_WIDTH, clampPanelWidth, type PanelSide } from "../../lib/panel-width";
import {
  applyTheme,
  readThemePreference,
  resolveTheme,
  saveThemePreference,
  toggleThemePreference,
} from "../../lib/theme";
import {
  normalizeTerminalAppearance,
  readTerminalAppearance,
  saveTerminalAppearance,
} from "../../lib/terminal-appearance";
import { applyTerminalThemeAttribute, resolveTerminalThemeId } from "../../lib/terminal-theme";
import { applyZoomLevel, readStoredZoomLevel, saveZoomLevel } from "../../lib/ui-zoom";
import { normalizeUiLanguage, type UiLanguage } from "@shared/ui-language";
import type { AppState, PreferencesSlice } from "../types";

const LANGUAGE_KEY = "colabdesk.language";
const FILE_SIZES_KEY = "colabdesk.files.showSizes";

const PANEL_WIDTH_KEYS: Record<PanelSide, string> = {
  sidebar: "colabdesk.panel.sidebarWidth",
  files: "colabdesk.panel.filesWidth",
};

function readLanguage(): UiLanguage {
  try {
    return normalizeUiLanguage(localStorage.getItem(LANGUAGE_KEY));
  } catch {
    return normalizeUiLanguage(null);
  }
}

/** A stored width outside today's limits is brought back inside them. */
function readPanelWidth(side: PanelSide): number {
  const stored = Number.parseInt(localStorage.getItem(PANEL_WIDTH_KEYS[side]) ?? "", 10);
  return Number.isFinite(stored) ? clampPanelWidth(side, stored) : PANEL_WIDTH[side].initial;
}

/** The name is the row's point; sizes are opt-in. */
function readShowFileSizes(): boolean {
  try {
    return localStorage.getItem(FILE_SIZES_KEY) === "true";
  } catch {
    return false;
  }
}

export const createPreferencesSlice: StateCreator<AppState, [], [], PreferencesSlice> = (set, get) => {
  const theme = readThemePreference();
  const terminal = readTerminalAppearance();

  return {
    theme,
    resolvedTheme: resolveTheme(theme),
    language: readLanguage(),
    terminal,
    // The palette the terminal is wearing, resolved once here rather than in each
    // pane: the app's polarity can change without the terminal's record moving,
    // and panes need a value to subscribe to when that happens.
    terminalThemeId: resolveTerminalThemeId(terminal, resolveTheme(theme)),
    sidebarOpen: true,
    filesOpen: true,
    panelWidths: { sidebar: readPanelWidth("sidebar"), files: readPanelWidth("files") },
    showFileSizes: readShowFileSizes(),
    // The page can carry a Chromium zoom level from before this setting
    // existed; the zoom watcher adopts it into the store on the first resize.
    zoomLevel: readStoredZoomLevel() ?? 0,

    /** An explicit choice, which from then on outranks the OS. */
    setTheme: (preference) => {
      saveThemePreference(preference);
      const resolvedTheme = applyTheme(preference);
      const terminalThemeId = resolveTerminalThemeId(get().terminal, resolvedTheme);
      applyTerminalThemeAttribute(terminalThemeId);
      set({ theme: preference, resolvedTheme, terminalThemeId });
    },

    toggleTheme: () => get().setTheme(toggleThemePreference(get().theme)),

    applySystemTheme: () => {
      const resolvedTheme = applyTheme(get().theme);
      const terminalThemeId = resolveTerminalThemeId(get().terminal, resolvedTheme);
      applyTerminalThemeAttribute(terminalThemeId);
      set({ resolvedTheme, terminalThemeId });
    },

    setLanguage: (language) => {
      try {
        localStorage.setItem(LANGUAGE_KEY, language);
      } catch {
        // ignore storage quota/disabled errors
      }
      set({ language });
    },

    setTerminalAppearance: (patch) => {
      const next = normalizeTerminalAppearance({ ...get().terminal, ...patch });
      saveTerminalAppearance(next);
      // The palette is CSS: switching the attribute is what repaints the frames,
      // and the panes read it back when they hand xterm a new theme. Resolved
      // first (the slot depends on the app's polarity), written before the store
      // so a pane that reacts to the store never reads the previous palette.
      const terminalThemeId = resolveTerminalThemeId(next, get().resolvedTheme);
      applyTerminalThemeAttribute(terminalThemeId);
      set({ terminal: next, terminalThemeId });
    },

    toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),

    toggleFiles: () => set({ filesOpen: !get().filesOpen }),

    setPanelWidth: (side, width) => {
      const clamped = clampPanelWidth(side, width);
      localStorage.setItem(PANEL_WIDTH_KEYS[side], String(clamped));
      set({ panelWidths: { ...get().panelWidths, [side]: clamped } });
    },

    setShowFileSizes: (show) => {
      try {
        localStorage.setItem(FILE_SIZES_KEY, String(show));
      } catch {
        // ignore storage quota/disabled errors
      }
      set({ showFileSizes: show });
    },

    setZoomLevel: (level) => {
      const next = clampUiZoomLevel(level);
      saveZoomLevel(next);
      applyZoomLevel(next);
      set({ zoomLevel: next });
    },

    /** A zoom chord moved the page; it is already applied, only remember it. */
    syncZoomLevel: (level) => {
      const next = normalizeStoredZoomLevel(level);
      if (next === get().zoomLevel) return;
      saveZoomLevel(next);
      set({ zoomLevel: next });
    },
  };
};
