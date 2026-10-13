/**
 * The updater: one state, one timer, and the three things a user can ask for.
 *
 * Everything that makes this hard to reason about — the clock, the update
 * library, quitting the app — arrives as a parameter, so the schedule and the
 * guards can be read and tested without waiting a day or replacing a binary.
 */

import type { UpdateStatus } from "@shared/types";
import type { UpdateBackend } from "./update-backend";
import { createUpdateMachine } from "./update-machine";
import { CHECK_INTERVAL_MS, INSTALL_EXIT_WATCHDOG_MS, QUIT_AND_INSTALL_DELAY_MS, retryDelayMs } from "./update-policy";

export interface UpdaterOptions {
  backend: UpdateBackend;
  /** Every transition, including the ones nobody asked for. */
  publish(status: UpdateStatus): void;
  /** Defaults to `setTimeout`; injected so the schedule can be driven by hand. */
  after?(delayMs: number, run: () => void): () => void;
  /** Cleanup before the installer takes over — closing sockets and terminals. */
  beforeInstall?(): void | Promise<void>;
  /** Last resort when the installer never manages to close us. */
  forceExit?(): void;
}

export interface Updater {
  status(): UpdateStatus;
  /** Subscribes and runs the first check. Does nothing on a second call. */
  start(): void;
  stop(): void;
  check(userInitiated: boolean): void;
  download(): void;
  install(): void;
}

const defaultAfter = (delayMs: number, run: () => void): (() => void) => {
  const timer = setTimeout(run, delayMs);
  return () => clearTimeout(timer);
};

export function createUpdater(options: UpdaterOptions): Updater {
  const after = options.after ?? defaultAfter;
  const machine = createUpdateMachine();

  let started = false;
  let stopped = false;
  let unsubscribe: (() => void) | null = null;
  let cancelScheduled: (() => void) | null = null;

  /** Consecutive failed checks; any answer that is not a failure resets it. */
  let failures = 0;
  /** A check we started has not reached an answer yet. */
  let checking = false;
  /**
   * Tracked separately from the status: between asking for the download and the
   * first progress event the status still reads `available`, and a check
   * started in that window would repoint the feed mid-download.
   */
  let downloading = false;
  let installing = false;
  /** Last value handed to the renderer, so unchanged ones are not re-sent. */
  let published: UpdateStatus | null = null;

  function publish(): UpdateStatus {
    const status = machine.status();
    // A download reports progress on every chunk; without this the renderer
    // gets a fresh object — and a store write — for percentages that did not
    // move. Reference equality is the test because the machine returns the
    // status it already had when nothing changed.
    if (status !== published) {
      published = status;
      options.publish(status);
    }
    return status;
  }

  /** Stops the schedule for good — nothing left to wait for. */
  function cancelSchedule(): void {
    cancelScheduled?.();
    cancelScheduled = null;
  }

  function schedule(delayMs: number): void {
    cancelSchedule();
    cancelScheduled = after(delayMs, () => {
      cancelScheduled = null;
      if (stopped) return;
      check(false);
    });
  }

  function check(userInitiated: boolean): void {
    if (stopped || checking || downloading || installing) return;
    // A downloaded build is waiting on a restart. Checking again would replace
    // that with "available" — and the user, who already waited for the download
    // once, would be asked to do it again.
    if (machine.status().state === "downloaded") return;
    checking = true;
    // Recorded here rather than waiting for the backend's own "checking" event:
    // that event can be a round trip away, and the answer has to say whether
    // anyone was waiting for it when it lands.
    machine.checking(userInitiated);
    publish();
    options.backend.check();
  }

  function download(): void {
    // `downloading` rather than the status: until the first progress event
    // arrives the status still reads `available`, so two quick clicks would
    // otherwise start the same download twice.
    if (stopped || downloading || installing) return;
    const status = machine.status();
    // Retrying after a failure is allowed only when we still know which
    // version it was — otherwise there is nothing to ask for.
    const retryable = status.state === "error" && status.version !== null;
    if (status.state !== "available" && !retryable) return;
    machine.noteDownloadRequested();
    downloading = true;
    publish();
    options.backend.download();
  }

  function install(): void {
    if (stopped || installing) return;
    if (machine.status().state !== "downloaded") return;
    installing = true;
    cancelSchedule();
    // Deferred so the renderer gets a chance to flush before the process goes
    // away: this runs on the same tick the click arrived on.
    after(QUIT_AND_INSTALL_DELAY_MS, () => {
      // Armed before the cleanup, not after it. A handoff that hangs inside
      // `beforeInstall` never reaches a `.finally`, so a watchdog attached
      // there would be the one thing that fails to run exactly when it is
      // needed. A clean handoff kills this process long before it fires.
      after(INSTALL_EXIT_WATCHDOG_MS, () => options.forceExit?.());
      void Promise.resolve(options.beforeInstall?.()).finally(() => {
        options.backend.install();
      });
    });
  }

  return {
    status: () => machine.status(),

    start() {
      if (started || stopped) return;
      started = true;
      unsubscribe = options.backend.subscribe((event) => {
        const next = machine.apply(event);
        if (next !== published) {
          published = next;
          options.publish(next);
        }

        if (event.type === "checking" || event.type === "progress") return;

        if (event.type === "downloaded") {
          // Nothing left to check for: the build is on disk and the only
          // remaining step is a restart.
          downloading = false;
          cancelSchedule();
          failures = 0;
          if (checking) checking = false;
          return;
        }

        if (event.type === "error") {
          failures += 1;
          downloading = false;
        } else {
          failures = 0;
        }

        // An answer has arrived, so the next check can be scheduled from here
        // rather than from when the previous one was set.
        if (checking) {
          checking = false;
          if (!stopped) schedule(event.type === "error" ? retryDelayMs(failures) : CHECK_INTERVAL_MS);
        }
      });
      check(false);
    },

    stop() {
      stopped = true;
      cancelSchedule();
      unsubscribe?.();
      unsubscribe = null;
    },

    check,
    download,
    install,
  };
}
