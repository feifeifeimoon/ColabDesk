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
 * A live workspace owns the top row: its top pane strip is the window titlebar,
 * so the global `TopBar` is not drawn. Settings and runtime setup are layers
 * over that workspace, not workspaces of their own, and keep the bar.
 *
 * A banner also takes the bar back: it is a full-width row under the titlebar,
 * and the fixed top-right window controls would otherwise sit on its actions.
 */
export function useWorkspaceChrome(): boolean {
  return useAppStore((state) => {
    const update = state.update;
    const banner =
      Boolean(state.error) ||
      update?.state === "downloaded" ||
      (update?.state === "available" &&
        update.version !== null &&
        update.version !== state.dismissedVersion);

    return (
      !state.settingsOpen &&
      !state.creation.open &&
      !banner &&
      state.tabs.some((tab) => tab.session === state.selectedSession)
    );
  });
}

/** The pane that owns the keyboard in the selected session. */
export function selectFocusedGroupId(state: AppState): string | null {
  const session = state.selectedSession;
  if (!session) return null;
  const groupId = state.focusedGroupBySession[session];
  return groupId && state.groups[groupId] ? groupId : null;
}

/** The tab the keyboard is in: the focused pane's active tab. */
export function selectFocusedTabId(state: AppState): string | null {
  const groupId = selectFocusedGroupId(state);
  if (!groupId) return null;
  return state.groups[groupId]?.activeTabId ?? null;
}

/**
 * The file tab in front of this session's focused pane, if it is a file. The
 * tree marks that row the way the rail marks the session on screen — a path,
 * not a copy of the tab, so a pane subscribed to it does not re-render on every
 * tab change.
 */
export function selectActiveFilePath(state: AppState, session: string): string | null {
  const groupId = state.focusedGroupBySession[session];
  const group = groupId ? state.groups[groupId] : null;
  if (!group) return null;
  const tab = state.tabs.find((candidate) => candidate.id === group.activeTabId);
  return tab?.kind === "file" && tab.session === session ? tab.path : null;
}
