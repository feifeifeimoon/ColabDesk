import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UpdateStatus } from "@shared/types";
import type { UpdateBackend } from "./update-backend";
import type { UpdateEvent } from "./update-machine";
import { CHECK_INTERVAL_MS, INSTALL_EXIT_WATCHDOG_MS, RETRY_BASE_MS, RETRY_MAX_MS } from "./update-policy";
import { createUpdater } from "./updater";

/** A backend the test drives by hand. */
function fakeBackend() {
  let listener: ((event: UpdateEvent) => void) | null = null;
  const calls: string[] = [];
  const backend: UpdateBackend = {
    subscribe(next) {
      listener = next;
      return () => {
        listener = null;
      };
    },
    check: () => void calls.push("check"),
    download: () => void calls.push("download"),
    install: () => void calls.push("install"),
  };
  return {
    backend,
    calls,
    emit: (event: UpdateEvent) => listener?.(event),
    unsubscribed: () => listener === null,
  };
}

/** Settable timers, so a 24 hour wait costs nothing. */
function fakeClock() {
  const pending: { at: number; run: () => void; cancelled: boolean }[] = [];
  let now = 0;
  return {
    after(delayMs: number, run: () => void) {
      const entry = { at: now + delayMs, run, cancelled: false };
      pending.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
    /** Runs everything due within `ms`, in order. */
    advance(ms: number, step = 25) {
      const until = now + ms;
      while (now < until) {
        now = Math.min(until, now + step);
        for (const entry of [...pending].sort((a, b) => a.at - b.at)) {
          if (!entry.cancelled && entry.at <= now) {
            entry.cancelled = true;
            entry.run();
          }
        }
      }
    },
    /** How long the soonest pending timer still has to wait. -1 if none. */
    nextDelay(): number {
      const live = pending.filter((entry) => !entry.cancelled);
      return live.length === 0 ? -1 : Math.min(...live.map((entry) => entry.at)) - now;
    },
  };
}

function build(overrides: Partial<Parameters<typeof createUpdater>[0]> = {}) {
  const backend = fakeBackend();
  const clock = fakeClock();
  const published: UpdateStatus[] = [];
  const beforeInstall = vi.fn();
  const forceExit = vi.fn();
  const updater = createUpdater({
    backend: backend.backend,
    publish: (status) => void published.push(status),
    after: clock.after,
    beforeInstall,
    forceExit,
    ...overrides,
  });
  return { updater, backend, clock, published, beforeInstall, forceExit };
}

beforeEach(() => vi.useRealTimers());

describe("an updater that has not started", () => {
  it("is idle and has asked for nothing", () => {
    const { updater, backend } = build();
    expect(updater.status()).toEqual({ state: "idle" });
    expect(backend.calls).toEqual([]);
  });
});

describe("starting", () => {
  it("checks once immediately and does not wait a day to say so", () => {
    const { updater, backend } = build();
    updater.start();
    expect(backend.calls).toEqual(["check"]);
  });

  it("arms the next check a day out", () => {
    const { updater, clock } = build();
    updater.start();
    expect(clock.nextDelay()).toBeLessThanOrEqual(CHECK_INTERVAL_MS);
  });

  it("schedules the next check from the check that just finished, not from start", () => {
    const { updater, backend, clock } = build();
    updater.start();
    backend.emit({ type: "checking" });
    backend.emit({ type: "not-available" });
    clock.advance(CHECK_INTERVAL_MS);
    expect(backend.calls).toEqual(["check", "check"]);
  });
});

describe("failing", () => {
  it("retries on a backoff instead of waiting the full day", () => {
    const { updater, backend, clock } = build();
    updater.start();
    backend.emit({ type: "checking" });
    backend.emit({ type: "error", message: "网络请求被中断。" });
    const delay = clock.nextDelay();
    expect(delay).toBeGreaterThan(0);
    expect(delay).toBeLessThanOrEqual(RETRY_BASE_MS + 1);
    clock.advance(RETRY_BASE_MS + 1);
    expect(backend.calls).toEqual(["check", "check"]);
  });

  it("backs off further on each consecutive failure, then holds at the cap", () => {
    const { updater, backend, clock } = build();
    updater.start();
    const delays: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      backend.emit({ type: "checking" });
      backend.emit({ type: "error", message: "失败。" });
      delays.push(Math.round(clock.nextDelay()));
      clock.advance(clock.nextDelay() + 1);
    }
    expect(delays[1]).toBeGreaterThan(delays[0]);
    expect(delays[delays.length - 1]).toBeLessThanOrEqual(RETRY_MAX_MS + 1);
    expect(Math.max(...delays)).toBeLessThanOrEqual(RETRY_MAX_MS + 1);
  });

  it("goes back to the daily cadence after a check that succeeds", () => {
    const { updater, backend, clock } = build();
    updater.start();
    backend.emit({ type: "checking" });
    backend.emit({ type: "error", message: "失败。" });
    clock.advance(RETRY_BASE_MS + 1);
    backend.emit({ type: "checking" });
    backend.emit({ type: "not-available" });
    expect(clock.nextDelay()).toBeCloseTo(CHECK_INTERVAL_MS, -4);
  });
});

describe("checks in flight", () => {
  it("reports the check as started before the backend answers", () => {
    // The flag matters when the answer arrives, which can be a round trip
    // later, so it cannot wait for the backend's own "checking" event.
    const { updater } = build();
    updater.check(true);
    expect(updater.status()).toEqual({ state: "checking", userInitiated: true });
  });

  it("does not stack a second check while one is running", () => {
    const { updater, backend } = build();
    updater.start();
    updater.check(true);
    updater.check(true);
    expect(backend.calls).toEqual(["check"]);
  });

  it("does not start a check while a download is in progress", () => {
    const { updater, backend } = build();
    updater.start();
    backend.emit({ type: "available", version: "0.3.0" });
    updater.download();
    updater.check(true);
    expect(backend.calls.filter((call) => call === "check")).toHaveLength(1);
  });
});

describe("publishing", () => {
  it("pushes every transition to the renderer", () => {
    const { updater, backend, published } = build();
    updater.start();
    backend.emit({ type: "checking" });
    backend.emit({ type: "available", version: "0.3.0" });
    expect(published.at(-1)).toEqual({ state: "available", version: "0.3.0", releaseUrl: null });
  });

});

describe("installing", () => {
  /** The handoff awaits cleanup, so the assertions land a microtask later. */
  const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  function readyToInstall() {
    const built = build();
    built.updater.start();
    built.backend.emit({ type: "available", version: "0.3.0" });
    built.backend.emit({ type: "downloaded", version: "0.3.0" });
    return built;
  }

  it("does nothing unless a build has actually been downloaded", () => {
    const { updater, backend } = build();
    updater.start();
    updater.install();
    expect(backend.calls).not.toContain("install");
  });

  it("runs cleanup, waits a beat, then hands off to the installer", async () => {
    const { updater, backend, clock, beforeInstall } = readyToInstall();
    updater.install();
    // Nothing happens on the click's own tick: the renderer gets to flush first.
    expect(beforeInstall).not.toHaveBeenCalled();
    clock.advance(200);
    await flush();
    expect(beforeInstall).toHaveBeenCalled();
    expect(backend.calls).toContain("install");
  });

  it("arms a watchdog, because the installer cannot replace files a live process holds", async () => {
    const { updater, clock, forceExit } = readyToInstall();
    updater.install();
    clock.advance(200);
    await flush();
    expect(forceExit).not.toHaveBeenCalled();
    clock.advance(INSTALL_EXIT_WATCHDOG_MS + 100);
    expect(forceExit).toHaveBeenCalledTimes(1);
  });

  it("ignores a second install request while one is already under way", async () => {
    const { updater, backend, clock } = readyToInstall();
    updater.install();
    updater.install();
    clock.advance(500);
    await flush();
    expect(backend.calls.filter((call) => call === "install")).toHaveLength(1);
  });
});

describe("stopping", () => {
  it("cancels the pending check and the subscription", () => {
    const { updater, backend, clock } = build();
    updater.start();
    updater.stop();
    clock.advance(CHECK_INTERVAL_MS * 2);
    expect(backend.calls).toEqual(["check"]);
    expect(backend.unsubscribed()).toBe(true);
  });
});
