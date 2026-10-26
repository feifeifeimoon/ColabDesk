/**
 * The user's interface zoom, persisted as a Chromium page-zoom level.
 *
 * The level — not the percentage — is the stored value: `1.2 ** level` is the
 * factor, so levels are the unit the stepper, the zoom chords and Electron all
 * speak. The page owns applying it; this module only reads, writes and hands
 * the level to the bridge.
 */

import { normalizeStoredZoomLevel } from "@shared/zoom";
import { setZoomLevel as setPageZoomLevel, zoomLevel as pageZoomLevel } from "./api";
import { syncWindowZoom } from "./window-zoom";

const ZOOM_KEY = "colabdesk.uiZoomLevel";

/** `null` means "never chosen here"; the page may still carry a zoom level. */
export function readStoredZoomLevel(): number | null {
  try {
    const raw = localStorage.getItem(ZOOM_KEY);
    if (raw === null) return null;
    const level = Number.parseFloat(raw);
    return Number.isFinite(level) ? normalizeStoredZoomLevel(level) : null;
  } catch {
    return null;
  }
}

export function saveZoomLevel(level: number): void {
  try {
    localStorage.setItem(ZOOM_KEY, String(level));
  } catch {
    // ignore storage quota/disabled errors
  }
}

export function applyZoomLevel(level: number): void {
  setPageZoomLevel(normalizeStoredZoomLevel(level));
  // Publish the new factor now rather than waiting for the resize event, so
  // the macOS traffic-light inset and the page agree on the same frame.
  syncWindowZoom();
}

/** Before the first paint, so the window never flashes at the default scale. */
export function applyStoredZoomLevel(): void {
  const stored = readStoredZoomLevel();
  if (stored !== null) applyZoomLevel(stored);
  else syncWindowZoom();
}

/** What the page is actually wearing, which a zoom chord may have moved. */
export function currentZoomLevel(): number {
  return pageZoomLevel();
}
