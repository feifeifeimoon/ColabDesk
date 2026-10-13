/**
 * The updater's state, and the only place it changes.
 *
 * electron-updater reports what happened as a series of events; the renderer
 * needs one value that cannot contradict itself. Everything in between is here,
 * with no Electron and no network, so the transitions can be read and tested
 * directly instead of inferred from a running app.
 */

import type { UpdateStatus } from "@shared/types";

/** What the backend reports. One discriminant, for the same reason as the state. */
export type UpdateEvent =
  | { type: "checking" }
  | { type: "available"; version: string }
  | { type: "not-available" }
  | { type: "progress"; percent: number }
  | { type: "downloaded"; version: string }
  | { type: "error"; message: string };

export interface UpdateMachine {
  status(): UpdateStatus;
  /** A check is starting, and whether anyone asked for it. */
  checking(userInitiated: boolean): UpdateStatus;
  /** Someone pressed download, which makes whatever follows worth reporting. */
  noteDownloadRequested(): void;
  /** Answers with the status after the event, so callers push one value. */
  apply(event: UpdateEvent): UpdateStatus;
}

export function createUpdateMachine(releaseUrl: string | null = null): UpdateMachine {
  let status: UpdateStatus = { state: "idle" };
  /**
   * The version `update-available` named. `download-progress` and a failed
   * download both need it, and neither event repeats it.
   */
  let known: string | null = null;
  /**
   * Whether the last thing that happened was asked for. A background check
   * finding nothing must not put a notice on screen; a failure the user is
   * waiting on must.
   */
  let userInitiated = false;

  return {
    status: () => status,

    checking(asked) {
      userInitiated = asked;
      status = { state: "checking", userInitiated: asked };
      return status;
    },

    noteDownloadRequested() {
      userInitiated = true;
    },

    apply(event) {
      switch (event.type) {
        case "checking":
          status = { state: "checking", userInitiated };
          break;

        case "available":
          known = event.version;
          status = { state: "available", version: event.version, releaseUrl };
          break;

        case "not-available":
          // The server has nothing newer, so anything remembered is stale.
          known = null;
          status = { state: "not-available", userInitiated };
          break;

        case "progress": {
          // Only ever follows `available`; without a version there is nothing
          // truthful to say, so the event is dropped rather than rendered as an
          // empty one.
          if (known === null) break;
          const raw = Number.isFinite(event.percent) ? event.percent : 0;
          const percent = Math.min(100, Math.max(0, Math.round(raw)));
          status = { state: "downloading", version: known, percent };
          break;
        }

        case "downloaded":
          known = event.version;
          status = { state: "downloaded", version: event.version };
          break;

        case "error":
          // The version survives so the UI can offer a retry rather than
          // stranding the user until the next scheduled check.
          status = { state: "error", message: event.message, userInitiated, version: known };
          break;
      }
      return status;
    },
  };
}
