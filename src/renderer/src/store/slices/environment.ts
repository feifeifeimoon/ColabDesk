import type { StateCreator } from "zustand";
import * as api from "../../lib/api";
import type { AppState, EnvironmentSlice } from "../types";

export const createEnvironmentSlice: StateCreator<AppState, [], [], EnvironmentSlice> = (set, get) => ({
  env: null,
  usage: null,
  error: null,

  loadUsage: async () => {
    try {
      set({ usage: await api.usage() });
    } catch {
      // The status bar simply keeps the previous numbers.
    }
  },

  /**
   * Authorisation state and quota answer as a pair — both are the CLI talking —
   * and every flow that changes one changes the other.
   *
   * The quota read goes first, and not for its own sake: it is the CLI call
   * that refreshes an expired access token, and the account behind it is read
   * from that token. Asking for the account first would report "signed in, no
   * address" until the next refresh, every time the app started on a stale
   * token.
   */
  refreshEnvironment: async () => {
    await get().loadUsage();

    let authenticated = false;
    try {
      const status = await api.envStatus();
      authenticated = status.authenticated;
      set({ env: status, error: null });
    } catch (cause) {
      set({ error: api.messageOf(cause) });
    }
    return authenticated;
  },

  setError: (error) => set({ error }),
});
