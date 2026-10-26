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
    // German and friends put `+` on an unshifted key, so the code is not Equal.
    expect(pageZoomDelta(input({ control: true, key: "+", code: "BracketRight" }), "win32")).toBe(0.5);
  });

  it("zooms in from the numpad", () => {
    expect(pageZoomDelta(input({ control: true, key: "+", code: "NumpadAdd" }), "win32")).toBe(0.5);
    // The physical code is what carries it when the character is not reported.
    expect(pageZoomDelta(input({ control: true, code: "NumpadAdd" }), "win32")).toBe(0.5);
  });

  it("leaves the shifted chords to the terminal font size", () => {
    expect(pageZoomDelta(input({ control: true, key: "=", code: "Equal", shift: true }), "win32")).toBeNull();
    expect(pageZoomDelta(input({ control: true, code: "NumpadAdd", shift: true }), "win32")).toBeNull();
    expect(pageZoomDelta(input({ control: true, code: "NumpadSubtract", shift: true }), "win32")).toBeNull();
  });

  it("zooms out from the numpad but leaves Ctrl+- to the default menu", () => {
    expect(pageZoomDelta(input({ control: true, key: "-", code: "NumpadSubtract" }), "win32")).toBe(-0.5);
    expect(pageZoomDelta(input({ control: true, code: "NumpadSubtract" }), "win32")).toBe(-0.5);
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

type Listener = (event: { preventDefault(): void }, input: PageZoomInput) => void;

/** A window whose zoom level the test can move between presses. */
function harness(initialLevel: number) {
  let level = initialLevel;
  let listener: Listener | null = null;
  const setZoomLevel = vi.fn();
  const contents = {
    on: vi.fn((name: string, handler: Listener) => {
      if (name === "before-input-event") listener = handler;
    }),
    getZoomLevel: () => level,
    setZoomLevel,
  };
  installPageZoomShortcuts({ webContents: contents } as unknown as BrowserWindow, "win32");

  return {
    setZoomLevel,
    setLevel: (next: number) => {
      level = next;
    },
    press: (patch: Partial<PageZoomInput>) => {
      const preventDefault = vi.fn();
      listener!({ preventDefault }, input(patch));
      return preventDefault;
    },
  };
}

describe("installPageZoomShortcuts", () => {
  it("applies the step to the window and swallows the key", () => {
    const h = harness(1);

    const preventDefault = h.press({ control: true, key: "=", code: "Equal" });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(h.setZoomLevel).toHaveBeenCalledWith(1.5);

    // A chord that belongs to the terminal must reach it untouched.
    const untouched = h.press({ control: true, code: "Equal", shift: true });
    expect(untouched).not.toHaveBeenCalled();
    expect(h.setZoomLevel).toHaveBeenCalledTimes(1);
  });

  it("steps toward the range from outside it, and ignores the chord past the end", () => {
    const h = harness(7);

    // Zoom-in at 7 must not clamp to 5 (which would shrink the page).
    h.press({ control: true, key: "=", code: "Equal" });
    expect(h.setZoomLevel).not.toHaveBeenCalled();

    h.press({ control: true, code: "NumpadSubtract" });
    expect(h.setZoomLevel).toHaveBeenLastCalledWith(6.5);
    h.setZoomLevel.mockClear();

    h.setLevel(5);
    h.press({ control: true, key: "=", code: "Equal" });
    expect(h.setZoomLevel).not.toHaveBeenCalled();
    h.press({ control: true, code: "NumpadSubtract" });
    expect(h.setZoomLevel).toHaveBeenLastCalledWith(4.5);
    h.setZoomLevel.mockClear();

    h.setLevel(-8);
    h.press({ control: true, code: "NumpadSubtract" });
    expect(h.setZoomLevel).not.toHaveBeenCalled();
    h.press({ control: true, key: "=", code: "Equal" });
    expect(h.setZoomLevel).toHaveBeenLastCalledWith(-7.5);
  });
});
