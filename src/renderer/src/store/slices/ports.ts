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
import { needsConnection } from "../connection-consumers";
import type { AppState, PortsSlice } from "../types";

/**
 * The inverse consumer rule: once the last tab is gone and no forward still
 * needs the connection, hang up. `release` in the workspace slice asks the same
 * question through the same predicate; this covers the other direction —
 * stopping the last forward after the last tab already closed.
 */
function releaseIfIdle(get: () => AppState, session: string): void {
  if (needsConnection(get(), session)) return;
  void api.sshDisconnect(session);
}

function sessionOf(get: () => AppState, id: string): string | null {
  for (const [session, forwards] of Object.entries(get().portsBySession)) {
    if (forwards.some((forward) => forward.id === id)) return session;
  }
  return null;
}

export const createPortsSlice: StateCreator<AppState, [], [], PortsSlice> = (set, get) => ({
  portsBySession: {},

  loadPorts: async (session) => {
    try {
      get().setPorts(session, await api.listPortForwards(session));
    } catch (cause) {
      get().notify({ tone: "danger", text: api.messageOf(cause) });
    }
  },

  /**
   * The mirror, not a release point. A push can arrive for a session whose
   * terminal is still handshaking, and `loadPorts` runs whenever the popover
   * opens; treating either as "no consumer left" would hang up on the connect.
   * Only the actions that actually stop or remove a forward release.
   */
  setPorts: (session, forwards) => {
    set((state) => {
      const next = { ...state.portsBySession };
      if (forwards.length === 0) delete next[session];
      else next[session] = forwards;
      return { portsBySession: next };
    });
  },

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
      const forward = await api.stopPortForward(id);
      const forwards = get().portsBySession[forward.session];
      // Apply the answer before asking whether the connection is still needed:
      // the ports:changed push may still be in flight.
      if (!forwards) return;
      get().setPorts(
        forward.session,
        forwards.map((row) => (row.id === forward.id ? forward : row)),
      );
      releaseIfIdle(get, forward.session);
    } catch (cause) {
      get().notify({ tone: "danger", text: api.messageOf(cause) });
    }
  },

  removePort: async (id) => {
    const session = sessionOf(get, id);
    try {
      await api.removePortForward(id);
      if (!session) return;
      const forwards = get().portsBySession[session];
      if (!forwards) return;
      get().setPorts(
        session,
        forwards.filter((forward) => forward.id !== id),
      );
      releaseIfIdle(get, session);
    } catch (cause) {
      get().notify({ tone: "danger", text: api.messageOf(cause) });
    }
  },

  /**
   * Called when the user hangs up (close all tabs). The listeners stop, but the
   * definitions stay as stopped rows so reopening the session can restart them;
   * only a session stop uses `forget` and drops them. The rows are marked first
   * so the workspace's `release` sees no consumer and may disconnect.
   */
  stopAllPorts: (session) => {
    const current = get().portsBySession[session] ?? [];
    if (current.length > 0) {
      get().setPorts(
        session,
        current.map((forward) => ({
          ...forward,
          status: "stopped",
          local_port: null,
          error: null,
        })),
      );
    }
    releaseIfIdle(get, session);
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

  /**
   * A session the rail no longer has. Its rows are dropped here, and the main
   * process must drop its definitions too: `stopAllPorts` deliberately keeps
   * them, and the next `ports:changed` would otherwise put permanent stopped
   * ghost rows back under a session that cannot be opened.
   */
  forgetPorts: (session) => {
    get().clearPorts(session);
    void api.forgetPortForwards(session).catch((cause) => {
      get().notify({ tone: "danger", text: api.messageOf(cause) });
    });
  },
});
