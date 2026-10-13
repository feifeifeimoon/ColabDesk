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

  function publish(): UpdateStatus {
    const status = machine.status();
    options.publish(status);
    return status;
  }

  function schedule(delayMs: number): void {
    cancelScheduled?.();
    cancelScheduled = after(delayMs, () => {
      cancelScheduled = null;
      if (stopped) return;
      check(false);
    });
  }

  function check(userInitiated: boolean): void {
    if (stopped || checking || downloading || installing) return;
    checking = true;
    // Recorded here rather than waiting for the backend's own "checking" event:
    // that event can be a round trip away, and the answer has to say whether
    // anyone was waiting for it when it lands.
    machine.checking(userInitiated);
    publish();
    options.backend.check();
  }

  function download(): void {
    if (stopped) return;
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
    cancelScheduled?.();
    cancelScheduled = null;
    // Deferred so the renderer gets a chance to flush before the process goes
    // away: this runs on the same tick the click arrived on.
    after(QUIT_AND_INSTALL_DELAY_MS, () => {
      void Promise.resolve(options.beforeInstall?.()).finally(() => {
        options.backend.install();
        // A clean handoff kills this process. Reaching past this point means it
        // did not, and a wedged teardown would leave the user on a splash with
        // no app behind it, so the watchdog is the floor rather than a nicety.
        after(INSTALL_EXIT_WATCHDOG_MS, () => options.forceExit?.());
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
        options.publish(next);

        if (event.type === "checking" || event.type === "progress") return;

        if (event.type === "error") {
          failures += 1;
          downloading = false;
        } else {
          failures = 0;
          if (event.type === "downloaded") downloading = false;
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
      cancelScheduled?.();
      cancelScheduled = null;
      unsubscribe?.();
      unsubscribe = null;
    },

    check,
    download,
    install,
  };
}
