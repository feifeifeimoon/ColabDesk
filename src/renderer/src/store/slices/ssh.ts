/**
 * The SSH dialog's open/closed state.
 *
 * It is a surface, not a saved preference: the snippet itself is fetched by the
 * dialog and belongs to the session it was opened from. Keeping only the
 * session here means closing and reopening always reads the launcher and the
 * current key instead of showing a result from an earlier render.
 */

import type { StateCreator } from "zustand";
import type { AppState, SshSlice } from "../types";

export const createSshSlice: StateCreator<AppState, [], [], SshSlice> = (set) => ({
  sshDialogSession: null,
  openSshDialog: (session) => set({ sshDialogSession: session }),
  closeSshDialog: () => set({ sshDialogSession: null }),
});
