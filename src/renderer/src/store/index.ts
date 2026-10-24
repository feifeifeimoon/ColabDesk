/**
 * The renderer's store: one store, one slice per domain.
 *
 * Read state with a selector — `useAppStore((state) => state.tabs)` — and act
 * with an action; a slice that reads state the component does not need is what
 * turns every write into a repaint of the whole window. Outside React (key
 * handlers, the streams the main process pushes) read the same state with
 * `useAppStore.getState()` at the moment you need it.
 */

import { create } from "zustand";
import { onSessionCreateOutput, onSshStatus, onUpdateStatus, updateStatus } from "../lib/api";
import { watchSystemTheme } from "../lib/theme";
import { watchWindowZoom } from "../lib/window-zoom";
import { createCreationSlice } from "./slices/creation";
import { createEnvironmentSlice } from "./slices/environment";
import { createPreferencesSlice } from "./slices/preferences";
import { createSessionsSlice } from "./slices/sessions";
import { createSurfacesSlice } from "./slices/surfaces";
import { createToastsSlice } from "./slices/toasts";
import { createUpdateSlice } from "./slices/update";
import { createWorkspaceSlice } from "./slices/workspace";
import type { AppState } from "./types";

/** How often the quota readout is re-read; the CLI is its only source. */
const USAGE_REFRESH_MS = 5 * 60_000;

export const useAppStore = create<AppState>()((...args) => ({
  ...createWorkspaceSlice(...args),
  ...createSessionsSlice(...args),
  ...createEnvironmentSlice(...args),
  ...createPreferencesSlice(...args),
  ...createSurfacesSlice(...args),
  ...createCreationSlice(...args),
  ...createToastsSlice(...args),
  ...createUpdateSlice(...args),
}));

/**
 * Everything that happens once and lives outside React's render cycle: the
 * first read of each source, the quota poll, and the two streams the main
 * process pushes. Returns its own teardown, so it is a `useEffect` callback
 * as-is.
 */
export function startAppEvents(): () => void {
  const store = useAppStore;
  store.getState().applySystemTheme();
  const stopSystemTheme = watchSystemTheme(() => store.getState().applySystemTheme());
  const stopWindowZoom = watchWindowZoom();
  const usageTimer = window.setInterval(() => void store.getState().loadUsage(), USAGE_REFRESH_MS);
  const stopSshStatus = onSshStatus((state) => store.getState().setConnection(state));
  // Read once as well as subscribed: the updater checks on a daily timer, so a
  // listener alone would leave the panel blank for up to a day.
  void updateStatus().then((status) => store.getState().setUpdateStatus(status));
  const stopUpdateStatus = onUpdateStatus((status) => store.getState().setUpdateStatus(status));
  // The setup surface prints the CLI's own lines while a runtime is allocated;
  // each one is a sentence, not a packet, so it may go through the store.
  const stopCreateOutput = onSessionCreateOutput(({ line }) => store.getState().appendCreationLine(line));

  void store.getState().refreshEnvironment();
  void store.getState().loadSessions();
  // The rail's other half: runtimes the server has that no local record
  // mentions. Its own read, so a slow answer cannot hold up the list on disk.
  void store.getState().loadUntracked();

  return () => {
    stopSystemTheme();
    stopWindowZoom();
    window.clearInterval(usageTimer);
    stopSshStatus();
    stopUpdateStatus();
    stopCreateOutput();
  };
}

export type { AppState, SessionAction, Toast } from "./types";
