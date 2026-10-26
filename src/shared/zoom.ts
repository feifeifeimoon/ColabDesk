/**
 * Interface zoom, in Chromium page-zoom levels.
 *
 * A level is a step, not a factor: `1.2 ** level` is the scale (0 is 100%).
 * The page-zoom chords step by `UI_ZOOM_STEP`, and the Appearance stepper
 * offers the same half-level range Orca's UI Zoom does. Electron accepts a
 * wider range for a stored value, so the two clamps are separate: the UI's
 * range is a choice, the page's range is what can be applied.
 */

export const UI_ZOOM_STEP = 0.5;
export const UI_ZOOM_MIN = -3;
export const UI_ZOOM_MAX = 5;

/** Electron's own accepted range for `setZoomLevel`. */
export const PAGE_ZOOM_MIN = -8;
export const PAGE_ZOOM_MAX = 9;

/** The range the Appearance stepper offers. */
export function clampUiZoomLevel(level: number): number {
  if (!Number.isFinite(level)) return 0;
  return Math.min(UI_ZOOM_MAX, Math.max(UI_ZOOM_MIN, level));
}

/** A stored value from an older build or a zoom chord outside the UI range. */
export function normalizeStoredZoomLevel(level: number): number {
  if (!Number.isFinite(level)) return 0;
  return Math.min(PAGE_ZOOM_MAX, Math.max(PAGE_ZOOM_MIN, level));
}

/** What the stepper shows; Chromium scales by 1.2 per level. */
export function uiZoomPercent(level: number): number {
  return Math.round(1.2 ** level * 100);
}
