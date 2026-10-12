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
import { onSshStatus } from "../lib/api";
import { watchSystemTheme } from "../lib/theme";
import { createEnvironmentSlice } from "./slices/environment";
import { createPreferencesSlice } from "./slices/preferences";
import { createSessionsSlice } from "./slices/sessions";
import { createSurfacesSlice } from "./slices/surfaces";
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
  const usageTimer = window.setInterval(() => void store.getState().loadUsage(), USAGE_REFRESH_MS);
  const stopSshStatus = onSshStatus((state) => store.getState().setConnection(state));

  void store.getState().refreshEnvironment();
  void store.getState().loadSessions();

  return () => {
    stopSystemTheme();
    window.clearInterval(usageTimer);
    stopSshStatus();
  };
}

export type { AppState, Notice, SessionAction } from "./types";
