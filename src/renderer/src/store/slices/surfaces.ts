/**
 * The settings layer over the workbench. It is separate from the layout
 * preferences because it is an open question ("am I in settings right now"),
 * not a remembered choice.
 *
 * Nothing here unmounts the workbench: the terminals underneath are live SSH
 * sessions, so a layer covers them rather than replacing them.
 *
 * A confirmation is a layer too, and it is here for the same reason: the caller
 * awaits the answer, so the question has to survive the renders between the
 * ask and the click.
 */

import type { StateCreator } from "zustand";
import type { AppState, SurfacesSlice } from "../types";

export const createSurfacesSlice: StateCreator<AppState, [], [], SurfacesSlice> = (set, get) => ({
  settingsOpen: false,
  settingsSection: "appearance",
  confirmation: null,

  openSettings: (section) =>
    set(section ? { settingsOpen: true, settingsSection: section } : { settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  toggleSettings: () => set({ settingsOpen: !get().settingsOpen }),
  setSettingsSection: (section) => set({ settingsSection: section }),

  requestConfirmation: (request) =>
    new Promise<boolean>((resolve) => {
      // One question owns the screen; a second one replaces it and the first
      // caller gets "no" instead of a promise nobody will ever resolve.
      get().confirmation?.resolve(false);
      set({ confirmation: { ...request, resolve } });
    }),

  resolveConfirmation: (confirmed) => {
    const current = get().confirmation;
    if (!current) return;
    // Clear first: resolving lets the caller run, and it may ask again.
    set({ confirmation: null });
    current.resolve(confirmed);
  },
});
