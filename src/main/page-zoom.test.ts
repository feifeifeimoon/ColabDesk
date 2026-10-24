import type { BrowserWindow } from "electron";
import { describe, expect, it, vi } from "vitest";
import { installPageZoomShortcuts, pageZoomDelta, type PageZoomInput } from "./page-zoom";

function input(patch: Partial<PageZoomInput>): PageZoomInput {
  return {
    type: "keyDown",
    key: "",
    code: "",
    alt: false,
    meta: false,
    control: false,
    shift: false,
    ...patch,
  };
}

describe("pageZoomDelta", () => {
  it("zooms in on the unshifted Ctrl+= the default menu leaves unbound", () => {
    expect(pageZoomDelta(input({ control: true, key: "=", code: "Equal" }), "win32")).toBe(0.5);
    // Layouts that report the character without the physical code still work.
    expect(pageZoomDelta(input({ control: true, key: "=" }), "win32")).toBe(0.5);
  });

  it("zooms in from the numpad, in every shape the platform reports", () => {
    expect(pageZoomDelta(input({ control: true, code: "NumpadAdd" }), "win32")).toBe(0.5);
    expect(pageZoomDelta(input({ control: true, key: "Add" }), "win32")).toBe(0.5);
  });

  it("leaves the shifted chords to the terminal font size", () => {
    expect(pageZoomDelta(input({ control: true, key: "=", code: "Equal", shift: true }), "win32")).toBeNull();
    expect(pageZoomDelta(input({ control: true, code: "NumpadAdd", shift: true }), "win32")).toBeNull();
    expect(pageZoomDelta(input({ control: true, code: "NumpadSubtract", shift: true }), "win32")).toBeNull();
  });

  it("zooms out from the numpad but leaves Ctrl+- to the default menu", () => {
    expect(pageZoomDelta(input({ control: true, code: "NumpadSubtract" }), "win32")).toBe(-0.5);
    expect(pageZoomDelta(input({ control: true, key: "Subtract" }), "win32")).toBe(-0.5);
    // Ctrl+- is already bound by the default menu; handling it twice would
    // apply two steps on any Electron build that dispatches the accelerator.
    expect(pageZoomDelta(input({ control: true, key: "-", code: "Minus" }), "win32")).toBeNull();
  });

  it("uses Cmd on macOS and Ctrl on the other platforms", () => {
    expect(pageZoomDelta(input({ meta: true, key: "=", code: "Equal" }), "darwin")).toBe(0.5);
    expect(pageZoomDelta(input({ control: true, key: "=", code: "Equal" }), "darwin")).toBeNull();
    expect(pageZoomDelta(input({ meta: true, key: "=", code: "Equal" }), "win32")).toBeNull();
  });

  it("ignores key-up, Alt, and unmodified keys", () => {
    expect(pageZoomDelta(input({ type: "keyUp", control: true, key: "=", code: "Equal" }), "win32")).toBeNull();
    expect(
      pageZoomDelta(input({ control: true, alt: true, key: "=", code: "Equal" }), "win32"),
    ).toBeNull();
    expect(pageZoomDelta(input({ key: "=", code: "Equal" }), "win32")).toBeNull();
  });
});

describe("installPageZoomShortcuts", () => {
  it("applies the step to the window and swallows the key", () => {
    type Listener = (event: { preventDefault(): void }, input: PageZoomInput) => void;
    let listener: Listener | null = null;
    const setZoomLevel = vi.fn();
    const contents = {
      on: vi.fn((name: string, handler: Listener) => {
        if (name === "before-input-event") listener = handler;
      }),
      getZoomLevel: () => 1,
      setZoomLevel,
    };
    installPageZoomShortcuts({ webContents: contents } as unknown as BrowserWindow);

    const preventDefault = vi.fn();
    listener!({ preventDefault }, input({ control: true, key: "=", code: "Equal" }));
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(setZoomLevel).toHaveBeenCalledWith(1.5);

    // A chord that belongs to the terminal must reach it untouched.
    const untouched = vi.fn();
    listener!({ preventDefault: untouched }, input({ control: true, code: "Equal", shift: true }));
    expect(untouched).not.toHaveBeenCalled();
    expect(setZoomLevel).toHaveBeenCalledTimes(1);
  });
});
