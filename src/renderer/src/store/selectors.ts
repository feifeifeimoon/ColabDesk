/**
 * Reads that only make sense when two slices are combined.
 *
 * Every one returns a primitive or a reference already held by the store: a
 * selector that builds a fresh object would make the component re-render on
 * every unrelated write. The one projection that does build an array —
 * the selected session's shells — lives in the component that needs it, memoised
 * on the two values it reads.
 */

import { useAppStore } from "./index";
import type { AppState } from "./types";

/** Whether the panel toggles have a layout to act on: a selected session with a tab. */
export function useHasWorkSurface(): boolean {
  return useAppStore((state) =>
    state.tabs.some((tab) => tab.session === state.selectedSession),
  );
}

/**
 * The file tab in front, if it belongs to this session. The tree marks that row
 * the way the rail marks the session that is on screen — a path, not a copy of
 * the tab, so a pane subscribed to it does not re-render on every tab change.
 */
export function selectActiveFilePath(state: AppState, session: string): string | null {
  const tab = state.tabs.find((candidate) => candidate.id === state.activeTabId);
  return tab?.kind === "file" && tab.session === session ? tab.path : null;
}
