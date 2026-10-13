import { describe, expect, it } from "vitest";
import { createUpdateMachine } from "./update-machine";

describe("the update state machine", () => {
  it("starts idle", () => {
    expect(createUpdateMachine().status()).toEqual({ state: "idle" });
  });

  it("carries whether the check was asked for", () => {
    const machine = createUpdateMachine();
    expect(machine.checking(true)).toEqual({ state: "checking", userInitiated: true });
    expect(machine.checking(false)).toEqual({ state: "checking", userInitiated: false });
  });

  it("surfaces an available version", () => {
    const machine = createUpdateMachine();
    machine.checking(false);
    expect(machine.apply({ type: "available", version: "0.3.0" })).toEqual({
      state: "available",
      version: "0.3.0",
      releaseUrl: null,
    });
  });

  it("remembers the version across a download that only reports percent", () => {
    const machine = createUpdateMachine();
    machine.apply({ type: "available", version: "0.3.0" });
    expect(machine.apply({ type: "progress", percent: 41 })).toEqual({
      state: "downloading",
      version: "0.3.0",
      percent: 41,
    });
  });

  it("rounds and clamps percent, so one download is not a hundred renders", () => {
    const machine = createUpdateMachine();
    machine.apply({ type: "available", version: "0.3.0" });
    expect(machine.apply({ type: "progress", percent: 41.4 })).toMatchObject({ percent: 41 });
    expect(machine.apply({ type: "progress", percent: 99.6 })).toMatchObject({ percent: 100 });
    expect(machine.apply({ type: "progress", percent: -5 })).toMatchObject({ percent: 0 });
    expect(machine.apply({ type: "progress", percent: Number.NaN })).toMatchObject({ percent: 0 });
  });

  it("ignores progress it has no version for", () => {
    // download-progress only ever follows update-available, so this is a
    // malformed sequence — better dropped than turned into an empty version.
    const machine = createUpdateMachine();
    expect(machine.apply({ type: "progress", percent: 10 })).toEqual({ state: "idle" });
  });

  it("reaches not-available and forgets any remembered version", () => {
    const machine = createUpdateMachine();
    machine.apply({ type: "available", version: "0.3.0" });
    machine.checking(true);
    expect(machine.apply({ type: "not-available" })).toEqual({ state: "not-available", userInitiated: true });
    // The server says nothing is newer, so a remembered version is stale.
    expect(machine.apply({ type: "progress", percent: 10 })).toEqual({
      state: "not-available",
      userInitiated: true,
    });
  });

  it("reports a downloaded version", () => {
    const machine = createUpdateMachine();
    machine.apply({ type: "available", version: "0.3.0" });
    machine.apply({ type: "progress", percent: 100 });
    expect(machine.apply({ type: "downloaded", version: "0.3.0" })).toEqual({
      state: "downloaded",
      version: "0.3.0",
    });
  });

  it("keeps the version on an error, so a failed download can be retried", () => {
    const machine = createUpdateMachine();
    machine.apply({ type: "available", version: "0.3.0" });
    machine.noteDownloadRequested();
    expect(machine.apply({ type: "error", message: "网络请求被中断。" })).toEqual({
      state: "error",
      message: "网络请求被中断。",
      userInitiated: true,
      version: "0.3.0",
    });
  });

  it("treats a download request as user-initiated", () => {
    const machine = createUpdateMachine();
    // A background check found it, then the check flag is false …
    machine.checking(false);
    machine.apply({ type: "available", version: "0.3.0" });
    // … but the user is the one who asked to download it.
    machine.noteDownloadRequested();
    expect(machine.apply({ type: "error", message: "下载失败。" })).toMatchObject({ userInitiated: true });
  });

  it("does not report a background check's failure as if the user asked", () => {
    const machine = createUpdateMachine();
    machine.checking(false);
    expect(machine.apply({ type: "error", message: "检查失败。" })).toMatchObject({ userInitiated: false });
  });

  it("lets a later background check reset a previous user-initiated flag", () => {
    const machine = createUpdateMachine();
    machine.checking(true);
    machine.checking(false);
    expect(machine.apply({ type: "not-available" })).toMatchObject({ userInitiated: false });
  });
});
