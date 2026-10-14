/**
 * Messages about what just happened.
 *
 * They live in a slice of their own because they all land in the same place —
 * a corner of the window, over whatever is on screen — and because the reason
 * they are not a banner is that they belong to an action, not to a screen: the
 * row that raised one may be long gone by the time it is read.
 */

import type { StateCreator } from "zustand";
import type { AppState, ToastsSlice } from "../types";

/** Past this the corner is a wall of text; the oldest message leaves first. */
const MAX_TOASTS = 3;

let nextId = 1;

export const createToastsSlice: StateCreator<AppState, [], [], ToastsSlice> = (set) => ({
  toasts: [],

  notify: (toast) =>
    set((state) => {
      // The same sentence twice is the same fact twice: a repeated action
      // restarts its message instead of stacking a copy of it. The new id is
      // what restarts it — the countdown belongs to the message on screen.
      const others = state.toasts.filter((existing) => existing.text !== toast.text);
      return { toasts: [...others, { ...toast, id: nextId++ }].slice(-MAX_TOASTS) };
    }),

  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
});
