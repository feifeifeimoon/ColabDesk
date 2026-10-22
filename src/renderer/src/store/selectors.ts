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

/** Whether the panel toggles have a layout to act on: a selected session with a tab. */
export function useHasWorkSurface(): boolean {
  return useAppStore((state) =>
    state.tabs.some((tab) => tab.session === state.selectedSession),
  );
}
