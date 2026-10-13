/**
 * The updater's state in the renderer.
 *
 * Nothing here decides anything: the main process owns every transition and
 * pushes the whole status. This slice stores it and forwards the three things
 * a person can ask for, so no component has to know how an update works.
 */

import type { StateCreator } from "zustand";
import { checkForUpdates, downloadUpdate, installUpdate } from "../../lib/api";
import type { AppState, UpdateSlice } from "../types";

export const createUpdateSlice: StateCreator<AppState, [], [], UpdateSlice> = (set, get) => ({
  // Until the first read answers, the honest value is "we do not know yet",
  // which is what `idle` means here — `unavailable` is a fact, not a default.
  update: { state: "idle" },
  dismissedVersion: null,

  setUpdateStatus(status) {
    // A new version replaces whatever was waved away: dismissing one build
    // should not hide the next. The version has to be a real one — `error`
    // carries the version it failed on, which is `null` for a check that never
    // got that far, and treating that as "a different version" would quietly
    // un-dismiss the build the user just waved away.
    const dismissed = get().dismissedVersion;
    const named = "version" in status ? status.version : null;
    if (dismissed !== null && named !== null && named !== dismissed) {
      set({ dismissedVersion: null });
    }
    set({ update: status });
  },

  dismissUpdate(version) {
    set({ dismissedVersion: version });
  },

  async checkForUpdates() {
    await checkForUpdates();
  },
  async downloadUpdate() {
    await downloadUpdate();
  },
  async installUpdate() {
    await installUpdate();
  },
});
