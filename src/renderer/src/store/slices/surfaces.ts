/**
 * The two layers that sit over the workbench — settings and the create-session
 * dialog. They are separate from the layout preferences because they are open
 * questions ("am I in settings right now"), not remembered choices.
 *
 * Nothing here unmounts the workbench: the terminals underneath are live SSH
 * sessions, so a layer covers them rather than replacing them.
 */

import type { StateCreator } from "zustand";
import type { AppState, SurfacesSlice } from "../types";

export const createSurfacesSlice: StateCreator<AppState, [], [], SurfacesSlice> = (set, get) => ({
  settingsOpen: false,
  settingsSection: "account",
  newSessionOpen: false,

  openSettings: (section) =>
    set(section ? { settingsOpen: true, settingsSection: section } : { settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  toggleSettings: () => set({ settingsOpen: !get().settingsOpen }),
  setSettingsSection: (section) => set({ settingsSection: section }),

  openNewSession: () => set({ newSessionOpen: true, settingsOpen: false }),
  closeNewSession: () => set({ newSessionOpen: false }),
});
