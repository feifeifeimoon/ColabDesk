/**
 * Page zoom for the chords Electron's default menu leaves unbound.
 *
 * The app draws its own title bar and keeps the default application menu only
 * for its accelerators. That menu's Zoom In is `CommandOrControl+Plus`, which
 * Electron parses as Ctrl+Shift+= — the same chord the terminal already owns
 * for its font size (`TerminalPane.tsx`). Ctrl+= is bound nowhere, so with a
 * terminal focused there is no page-zoom-in chord at all, while Zoom Out
 * (`CommandOrControl+-`) keeps working. The numpad keys are unbound for the
 * same reason.
 *
 * This binds those missing chords and nothing else: the shifted chords stay
 * with the terminal, and Ctrl+- / Ctrl+0 stay with the default menu, so every
 * chord still has exactly one handler.
 */

import type { BrowserWindow } from "electron";

/** The default menu's own zoom items step by half a level; match them. */
const ZOOM_STEP = 0.5;

/** The subset of Electron's `Input` this decision needs. */
export interface PageZoomInput {
  type: string;
  key: string;
  code: string;
  alt: boolean;
  meta: boolean;
  control: boolean;
  shift: boolean;
}

/**
 * The page-zoom step for a key event, or `null` when the event belongs to
 * somebody else.
 *
 * Shift is the terminal's (Ctrl+Shift+= / Ctrl+Shift+- resize its font), and
 * `-` / `0` are the default menu's; neither is touched here.
 */
export function pageZoomDelta(
  input: PageZoomInput,
  platform: NodeJS.Platform = process.platform,
): number | null {
  if (input.type !== "keyDown" || input.alt) return null;
  const primary = platform === "darwin" ? input.meta : input.control;
  if (!primary || input.shift) return null;

  if (input.code === "Equal" || input.key === "=") return ZOOM_STEP;
  if (input.code === "NumpadAdd" || input.key === "Add") return ZOOM_STEP;
  if (input.code === "NumpadSubtract" || input.key === "Subtract") return -ZOOM_STEP;
  return null;
}

/** Applies the step to the window before the renderer sees the key. */
export function installPageZoomShortcuts(
  window: BrowserWindow,
  platform: NodeJS.Platform = process.platform,
): void {
  const contents = window.webContents;
  contents.on("before-input-event", (event, input) => {
    const delta = pageZoomDelta(input, platform);
    if (delta === null) return;
    event.preventDefault();
    contents.setZoomLevel(contents.getZoomLevel() + delta);
  });
}
