/**
 * The settings layer over the workbench. It is separate from the layout
 * preferences because it is an open question ("am I in settings right now"),
 * not a remembered choice.
 *
 * Nothing here unmounts the workbench: the terminals underneath are live SSH
 * sessions, so a layer covers them rather than replacing them.
 */

import type { StateCreator } from "zustand";
import type { AppState, SurfacesSlice } from "../types";

export const createSurfacesSlice: StateCreator<AppState, [], [], SurfacesSlice> = (set, get) => ({
  settingsOpen: false,
  settingsSection: "appearance",

  openSettings: (section) =>
    set(section ? { settingsOpen: true, settingsSection: section } : { settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  toggleSettings: () => set({ settingsOpen: !get().settingsOpen }),
  setSettingsSection: (section) => set({ settingsSection: section }),

});
