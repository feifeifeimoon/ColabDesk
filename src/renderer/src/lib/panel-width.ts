/**
 * How wide each rail may be dragged, and how wide it starts.
 *
 * One place, because two sides need the same numbers: the store clamps
 * whatever it is handed, and the divider clamps while the pointer is moving.
 *
 * The maxima are deliberately well below what the window allows: the terminal
 * is the point of the window, and a rail dragged to half of it is a rail the
 * user then has to drag back. Narrower than the minimum and the session names
 * and the folder list stop being readable, which is the same as gone.
 */

export const PANEL_WIDTH = {
  sidebar: { min: 180, max: 420, initial: 260 },
  files: { min: 220, max: 560, initial: 340 },
} as const;

export type PanelSide = keyof typeof PANEL_WIDTH;

export function clampPanelWidth(side: PanelSide, width: number): number {
  const { min, max } = PANEL_WIDTH[side];
  return Math.min(max, Math.max(min, width));
}

/**
 * Where a drag has reached: the width it started from, plus how far the pointer
 * travelled. `delta` is already signed by the panel's side, so the same call
 * serves a rail whose edge moves right and one whose edge moves left.
 */
export function nextPanelWidth(side: PanelSide, startWidth: number, delta: number): number {
  return clampPanelWidth(side, startWidth + delta);
}
