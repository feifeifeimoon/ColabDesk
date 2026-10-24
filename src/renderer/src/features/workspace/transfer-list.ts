import type { TransferProgress } from "@shared/types";

/** How many transfer rows one pane keeps; the oldest is dropped. */
export const MAX_TRANSFER_ROWS = 6;

/**
 * New transfers go to the top, but an existing row is updated where it is.
 *
 * Two transfers can run at once (a download while a drag upload starts), and
 * their progress events interleave. Re-prepending the row that just spoke
 * would swap the rows — and their Cancel buttons — under the pointer on every
 * tick.
 */
export function mergeTransferProgress(
  current: TransferProgress[],
  progress: TransferProgress,
): TransferProgress[] {
  const at = current.findIndex((item) => item.id === progress.id);
  if (at === -1) return [progress, ...current].slice(0, MAX_TRANSFER_ROWS);
  const next = current.slice();
  next[at] = progress;
  return next;
}
