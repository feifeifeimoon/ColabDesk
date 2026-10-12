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
import { applyTerminalThemeAttribute } from "../../lib/terminal-theme";
import { normalizeUiLanguage, type UiLanguage } from "@shared/ui-language";
import type { AppState, PreferencesSlice } from "../types";

const LANGUAGE_KEY = "colabdesk.language";

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

export const createPreferencesSlice: StateCreator<AppState, [], [], PreferencesSlice> = (set, get) => {
  const theme = readThemePreference();
  const terminal = readTerminalAppearance();

  return {
    theme,
    resolvedTheme: resolveTheme(theme),
    language: readLanguage(),
    terminal,
    sidebarOpen: true,
    filesOpen: true,
    panelWidths: { sidebar: readPanelWidth("sidebar"), files: readPanelWidth("files") },

    /** An explicit choice, which from then on outranks the OS. */
    setTheme: (preference) => {
      saveThemePreference(preference);
      set({ theme: preference, resolvedTheme: applyTheme(preference) });
    },

    toggleTheme: () => get().setTheme(toggleThemePreference(get().theme)),

    applySystemTheme: () => set({ resolvedTheme: applyTheme(get().theme) }),

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
      // and the panes read it back when they hand xterm a new theme.
      applyTerminalThemeAttribute(next.themeId);
      set({ terminal: next });
    },

    toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),

    toggleFiles: () => set({ filesOpen: !get().filesOpen }),

    setPanelWidth: (side, width) => {
      const clamped = clampPanelWidth(side, width);
      localStorage.setItem(PANEL_WIDTH_KEYS[side], String(clamped));
      set({ panelWidths: { ...get().panelWidths, [side]: clamped } });
    },
  };
};
