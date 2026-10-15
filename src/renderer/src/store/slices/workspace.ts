import type { StateCreator } from "zustand";
import * as api from "../../lib/api";
import type { AppState, TerminalTab, WorkspaceSlice } from "../types";

/** The record without one key; these maps are small, so rebuilding is cheap. */
function dropKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _dropped, ...rest } = record;
  return rest;
}

export const createWorkspaceSlice: StateCreator<AppState, [], [], WorkspaceSlice> = (set, get) => {
  /** One more shell for a session, numbered after the highest it has. */
  function addTab(session: string): TerminalTab {
    const existing = get().tabs.filter((tab) => tab.session === session);
    const ordinal = existing.reduce((highest, tab) => Math.max(highest, tab.ordinal), 0) + 1;
    const tab: TerminalTab = { id: `${session}:${ordinal}`, session, ordinal };
    set({ tabs: [...get().tabs, tab], selectedSession: session, activeTabId: tab.id });
    return tab;
  }

  /**
   * Points the shown tab at a shell that still exists.
   *
   * The selection is left alone: closing the last shell of the session you are
   * working on should leave the rail where it is and let the workbench say the
   * session has no terminals — not jump to another runtime behind your back.
   * The selection is only dropped when the session itself is gone.
   */
  function reconcile(): void {
    const { tabs, selectedSession, activeTabId } = get();
    const siblings = tabs.filter((tab) => tab.session === selectedSession);
    const active = siblings.some((tab) => tab.id === activeTabId)
      ? activeTabId
      : (siblings[siblings.length - 1]?.id ?? null);
    if (active === activeTabId) return;
    set({ activeTabId: active });
  }

  /** Lets go of a connection: the session's last shell closed. */
  function release(session: string): void {
    set((current) => ({
      // The tree goes with the connection: an expanded set describes listings
      // that no longer exist, and reopening them would show a wrong tree.
      expandedDirs: dropKey(current.expandedDirs, session),
      transferCounts: dropKey(current.transferCounts, session),
    }));
    // A runtime accepts one SSH connection, so holding it is what having a
    // shell means. The status stream reports the closure itself.
    void api.sshDisconnect(session);
  }

  return {
    tabs: [],
    selectedSession: null,
    activeTabId: null,
    connections: {},
    expandedDirs: {},
    transferCounts: {},

    openSession: (session) => {
      const siblings = get().tabs.filter((tab) => tab.session === session);
      if (siblings.length === 0) addTab(session);
      else set({ selectedSession: session, activeTabId: siblings[siblings.length - 1]!.id });
      // Asking for a terminal is asking for the workbench, wherever you asked from.
      set({ settingsOpen: false });
    },

    openTab: (session) => {
      addTab(session);
      set({ settingsOpen: false });
    },

    closeTab: (tabId) => {
      const { tabs } = get();
      const closing = tabs.find((tab) => tab.id === tabId);
      if (!closing) return;
      const remaining = tabs.filter((tab) => tab.id !== tabId);
      set({ tabs: remaining });
      reconcile();
      if (!remaining.some((tab) => tab.session === closing.session)) release(closing.session);
    },

    focusTab: (tabId) => {
      const { tabs, selectedSession } = get();
      const target = tabs.find((tab) => tab.id === tabId);
      // A tab of another session would be a selection change, not a focus.
      if (!target || target.session !== selectedSession) return;
      set({ activeTabId: tabId });
    },

    closeSessionTabs: (session) => {
      const remaining = get().tabs.filter((tab) => tab.session !== session);
      if (remaining.length === get().tabs.length) return;
      set({ tabs: remaining });
      reconcile();
      release(session);
    },

    focusTabAt: (index) => {
      const target = get()
        .tabs.filter((tab) => tab.session === get().selectedSession)
        [index];
      if (target) set({ activeTabId: target.id });
    },

    setConnection: (state) =>
      set((current) => ({ connections: { ...current.connections, [state.session]: state } })),

    /**
     * The tree is ordered by the store, not by the click: a parent always sorts
     * before its children, which is what lets the pane walk the list and know
     * where it is without keeping a second copy of the hierarchy.
     */
    toggleDirectory: (session, path) =>
      set((current) => {
        const expanded = current.expandedDirs[session] ?? [];
        const next = expanded.includes(path)
          ? expanded.filter((entry) => entry !== path && !entry.startsWith(`${path}/`))
          : [...expanded, path].sort();
        return { expandedDirs: { ...current.expandedDirs, [session]: next } };
      }),

    forgetDirectory: (session, path) =>
      set((current) => {
        const expanded = current.expandedDirs[session] ?? [];
        const next = expanded.filter((entry) => entry !== path && !entry.startsWith(`${path}/`));
        if (next.length === expanded.length) return current;
        return { expandedDirs: { ...current.expandedDirs, [session]: next } };
      }),

    setTransferCount: (session, active) =>
      set((current) =>
        current.transferCounts[session] === active
          ? current
          : { transferCounts: { ...current.transferCounts, [session]: active } },
      ),

    pruneTabs: () => {
      const { tabs, sessions, selectedSession } = get();
      const existing = new Set(sessions.map((session) => session.name));
      const remaining = tabs.filter((tab) => existing.has(tab.session));
      const keepSelection = selectedSession !== null && existing.has(selectedSession);
      if (remaining.length === tabs.length && keepSelection) return;
      set({ tabs: remaining, selectedSession: keepSelection ? selectedSession : null });
      reconcile();
      // A gone session's connection has nothing left to serve, and a runtime
      // takes one SSH connection at a time: a connection nobody can reach is
      // what a later reconnect would run into.
      const gone = new Set(
        tabs.filter((tab) => !existing.has(tab.session)).map((tab) => tab.session),
      );
      for (const session of gone) release(session);
    },
  };
};
