import { describe, expect, it } from "vitest";
import { CHECK_INTERVAL_MS, RETRY_BASE_MS, RETRY_MAX_MS, canUseUpdater, retryDelayMs } from "./update-policy";

describe("canUseUpdater", () => {
  const off = { isPackaged: true, platform: "win32" as NodeJS.Platform, e2eFeed: null };

  it("runs in a packaged build on the platforms that can self-update", () => {
    expect(canUseUpdater(off)).toBe(true);
    expect(canUseUpdater({ ...off, platform: "linux" })).toBe(true);
  });

  it("never runs unpackaged", () => {
    // A dev checkout has no app-update.yml and no installed version to replace.
    expect(canUseUpdater({ ...off, isPackaged: false })).toBe(false);
  });

  it("stays off on macOS, where Squirrel.Mac throws on an unsigned app", () => {
    expect(canUseUpdater({ ...off, platform: "darwin" })).toBe(false);
  });

  it("runs unpackaged when the E2E harness supplies a feed", () => {
    // The only way to exercise the flow without publishing a release.
    expect(canUseUpdater({ ...off, isPackaged: false, e2eFeed: "http://127.0.0.1:1234" })).toBe(true);
  });

  it("does not let the E2E feed override the platform gate", () => {
    // Otherwise the suite would pass on a Mac while exercising a path that is
    // deliberately off there.
    expect(canUseUpdater({ ...off, platform: "darwin", e2eFeed: "http://127.0.0.1:1234" })).toBe(false);
  });
});

describe("retryDelayMs", () => {
  it("starts at an hour and doubles per consecutive failure", () => {
    expect(retryDelayMs(1)).toBe(RETRY_BASE_MS);
    expect(retryDelayMs(2)).toBe(RETRY_BASE_MS * 2);
    expect(retryDelayMs(3)).toBe(RETRY_BASE_MS * 4);
  });

  it("stops at six hours", () => {
    expect(retryDelayMs(4)).toBe(RETRY_MAX_MS);
    expect(retryDelayMs(50)).toBe(RETRY_MAX_MS);
  });

  it("treats a zero or negative count as the first retry", () => {
    expect(retryDelayMs(0)).toBe(RETRY_BASE_MS);
    expect(retryDelayMs(-3)).toBe(RETRY_BASE_MS);
  });

  it("stays sane for counts that would otherwise overflow the exponent", () => {
    expect(retryDelayMs(Number.MAX_SAFE_INTEGER)).toBe(RETRY_MAX_MS);
    expect(Number.isFinite(retryDelayMs(9_999))).toBe(true);
  });
});

describe("the schedule constants", () => {
  it("checks at most once a day", () => {
    expect(CHECK_INTERVAL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("retries sooner than it checks, and caps below the check interval", () => {
    expect(RETRY_BASE_MS).toBeLessThan(CHECK_INTERVAL_MS);
    expect(RETRY_MAX_MS).toBeLessThan(CHECK_INTERVAL_MS);
  });
});
