/**
 * What the updater needs from an update library.
 *
 * Narrow on purpose. electron-updater's own surface is wide and reaches into
 * Electron, which would make the state machine untestable and force the E2E
 * suite to drive a real AppImage — its Linux implementation refuses to run
 * outside one. This is the whole of what the module above actually uses, so the
 * real adapter and the E2E fake are interchangeable at the same seam.
 */

import type { UpdateEvent } from "./update-machine";

export interface UpdateBackend {
  /** Subscribes to lifecycle events; returns the unsubscribe. */
  subscribe(listener: (event: UpdateEvent) => void): () => void;
  check(): void;
  download(): void;
  /**
   * Quit and hand the process to the installer. Does not return usefully on
   * success — the process is gone by then.
   */
  install(): void;
}
