/**
 * The updater's backend under `COLABDESK_E2E_MOCK=1`.
 *
 * electron-updater cannot be driven from a CI container at all: its Linux
 * implementation is AppImage-only and refuses to do anything when the
 * `APPIMAGE` variable is absent, which it always is inside a test runner. So
 * this replaces the backend — the same seam the CLI stub uses — and drives the
 * lifecycle on timers instead of over the network.
 *
 * Everything above it stays the production path: the same state machine, the
 * same IPC, the same screens. What the suite is asserting is that the app
 * reports those states correctly, not that electron-updater can fetch a file.
 */

import type { UpdateBackend } from "../updater/update-backend";
import type { UpdateEvent } from "../updater/update-machine";

/** What the fake answers with. Empty or absent means "nothing newer". */
function offeredVersion(): string | null {
  const value = process.env.COLABDESK_E2E_UPDATE_VERSION?.trim();
  return value ? value : null;
}

export function createE2EUpdateBackend(): UpdateBackend {
  let listener: ((event: UpdateEvent) => void) | null = null;
  const timers = new Set<NodeJS.Timeout>();

  const later = (delayMs: number, run: () => void): void => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      run();
    }, delayMs);
    timers.add(timer);
  };

  const emit = (event: UpdateEvent): void => listener?.(event);

  return {
    subscribe(next) {
      listener = next;
      return () => {
        listener = null;
        for (const timer of timers) clearTimeout(timer);
        timers.clear();
      };
    },

    check() {
      emit({ type: "checking" });
      later(20, () => {
        const version = offeredVersion();
        emit(version ? { type: "available", version } : { type: "not-available" });
      });
    },

    download() {
      // A handful of steps, so the bar is seen moving rather than appearing
      // finished — and so the test can catch a UI that only handles the ends.
      for (const percent of [0, 25, 50, 75]) {
        later(20 + percent, () => emit({ type: "progress", percent }));
      }
      later(140, () => emit({ type: "downloaded", version: offeredVersion() ?? "0.0.0" }));
    },

    install() {
      // Deliberately does not quit: the app under test has to survive so the
      // assertions after the click can run.
    },
  };
}
