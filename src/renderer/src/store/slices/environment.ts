import type { StateCreator } from "zustand";
import * as api from "../../lib/api";
import { readRememberedAccount, rememberAccount } from "../../lib/account-memory";
import type { AppState, EnvironmentSlice } from "../types";

export const createEnvironmentSlice: StateCreator<AppState, [], [], EnvironmentSlice> = (set, get) => ({
  env: null,
  usage: null,
  // A reading is on its way from the moment the app starts, so the bar knows to
  // draw a skeleton rather than a zero.
  usagePending: true,
  /** The address that signed in before the current one, until the list is cleaned. */
  previousAccount: null,
  loginRunning: false,
  error: null,

  loadUsage: async () => {
    if (get().usage === null) set({ usagePending: true });
    try {
      set({ usage: await api.usage() });
    } catch {
      // The status bar simply keeps the previous numbers. A first read that
      // fails leaves it saying "no reading" — never zero.
    } finally {
      set({ usagePending: false });
    }
  },

  /**
   * Re-reads only the on-disk identity.
   *
   * The setup surface asks this when it opens: a key generated in an external
   * terminal must be seen without a full environment refresh, whose tokeninfo
   * and quota calls would both delay the answer and belong to another question.
   */
  refreshSshIdentity: async () => {
    if (get().env === null) return;
    try {
      const ssh_identity = await api.sshIdentity();
      const current = get().env;
      if (current) set({ env: { ...current, ssh_identity } });
    } catch {
      // Keep the last answer; the next full refresh can correct it.
    }
  },

  /**
   * Authorisation state and the quota answer, in that order.
   *
   * The quota read goes first because it is what mints a fresh access token when
   * the stored one has expired, and the account behind it is read from that
   * token. One account read, not two: the second one used to exist because the
   * CLI's quota call could replace the token mid-refresh, which the direct read
   * no longer does silently.
   *
   * This is also the only place an account *switch* can be seen: the local
   * session records carry no owner, so the previous address is remembered and
   * compared here.
   */
  refreshEnvironment: async () => {
    await get().loadUsage();

    try {
      const status = await api.envStatus();
      const account = status.account;
      if (!account?.email) {
        set({ env: status, error: null });
        return status.authenticated;
      }

      const previous = readRememberedAccount();
      const switched =
        previous !== null &&
        (previous.subject && account.subject
          ? previous.subject !== account.subject
          : previous.email !== account.email);
      const previousEmail = switched ? previous.email : (previous?.previousEmail ?? null);
      rememberAccount({ email: account.email, subject: account.subject, previousEmail });
      set({ env: status, error: null, previousAccount: previousEmail });
      return status.authenticated;
    } catch (cause) {
      // Keep the previous env state: a background refresh that fails says
      // nothing about the last answer it had.
      set({ error: api.messageOf(cause) });
      return false;
    }
  },

  setLoginRunning: (running) => set({ loginRunning: running }),

  clearPreviousAccount: () => {
    const remembered = readRememberedAccount();
    if (remembered) rememberAccount({ ...remembered, previousEmail: null });
    set({ previousAccount: null });
  },

  setError: (error) => set({ error }),
});
