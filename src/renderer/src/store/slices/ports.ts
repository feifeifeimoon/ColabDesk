/**
 * The renderer's mirror of the main process's port forwards.
 *
 * The main process owns every listener; this slice only holds the lists it
 * pushes and the actions the status-bar popover calls. A forward outliving the
 * last tab is intentional: the connection is kept alive by the forward, not by
 * a view, so this state must not be tied to a tab closing.
 */

import type { StateCreator } from "zustand";
import * as api from "../../lib/api";
import type { AppState, PortsSlice } from "../types";

export const createPortsSlice: StateCreator<AppState, [], [], PortsSlice> = (set, get) => ({
  portsBySession: {},

  loadPorts: async (session) => {
    try {
      get().setPorts(session, await api.listPortForwards(session));
    } catch (cause) {
      get().notify({ tone: "danger", text: api.messageOf(cause) });
    }
  },

  setPorts: (session, forwards) =>
    set((state) => {
      const next = { ...state.portsBySession };
      if (forwards.length === 0) delete next[session];
      else next[session] = forwards;
      return { portsBySession: next };
    }),

  createPort: async (request) => {
    try {
      return await api.createPortForward(request);
    } catch (cause) {
      get().notify({ tone: "danger", text: api.messageOf(cause) });
      return null;
    }
  },

  startPort: async (id) => {
    try {
      await api.startPortForward(id);
    } catch (cause) {
      get().notify({ tone: "danger", text: api.messageOf(cause) });
    }
  },

  stopPort: async (id) => {
    try {
      await api.stopPortForward(id);
    } catch (cause) {
      get().notify({ tone: "danger", text: api.messageOf(cause) });
    }
  },

  removePort: async (id) => {
    try {
      await api.removePortForward(id);
    } catch (cause) {
      get().notify({ tone: "danger", text: api.messageOf(cause) });
    }
  },

  /**
   * Called when the user hangs up (close all tabs) or the session stops.
   *
   * The list is cleared first so the workspace's `release` sees no active
   * forward and is allowed to disconnect; the main process then closes the
   * listeners, and the connection's own close is the backstop.
   */
  stopAllPorts: (session) => {
    get().setPorts(session, []);
    void api.stopAllPortForwards(session).catch((cause) => {
      get().notify({ tone: "danger", text: api.messageOf(cause) });
    });
  },

  clearPorts: (session) => {
    set((state) => {
      if (!(session in state.portsBySession)) return state;
      const next = { ...state.portsBySession };
      delete next[session];
      return { portsBySession: next };
    });
  },
});
