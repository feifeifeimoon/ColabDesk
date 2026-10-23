import type { StateCreator } from "zustand";
import * as api from "../../lib/api";
import type { AppState, TerminalTab, WorkspaceSlice } from "../types";

/** The record without one key; these maps are small, so rebuilding is cheap. */
function dropKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _dropped, ...rest } = record;
  return rest;
}

/** The dirty flags that still belong to a tab that exists. */
function liveDirty(dirty: Record<string, boolean>, tabs: { id: string }[]): Record<string, boolean> {
  const live = new Set(tabs.map((tab) => tab.id));
  const kept: Record<string, boolean> = {};
  for (const [id, value] of Object.entries(dirty)) if (live.has(id)) kept[id] = value;
  return kept;
}

export const createWorkspaceSlice: StateCreator<AppState, [], [], WorkspaceSlice> = (set, get) => {
  /** Bumped by every save, so a tree can tell two writes to one directory apart. */
  let writeRevision = 0;

  /** One more shell for a session, numbered after the highest it has. */
  function addTab(session: string): TerminalTab {
    const existing = get().tabs.filter(
      (tab): tab is TerminalTab => tab.session === session && tab.kind === "shell",
    );
    const ordinal = existing.reduce((highest, tab) => Math.max(highest, tab.ordinal), 0) + 1;
    const tab: TerminalTab = {
      kind: "shell",
      id: `${session}:${ordinal}`,
      session,
      ordinal,
      customTitle: null,
    };
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

  /** Lets go of a connection: the session's last tab closed. A file tab needs
      the connection too, so it counts. */
  function release(session: string): void {
    set((current) => ({
      // The tree goes with the connection: an expanded set describes listings
      // that no longer exist, and reopening them would show a wrong tree.
      expandedDirs: dropKey(current.expandedDirs, session),
      transferCounts: dropKey(current.transferCounts, session),
      // So does the record of where a save landed: a leftover would make the
      // next mount re-read a directory nobody opened.
      fileWrites: dropKey(current.fileWrites, session),
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
    dirtyTabs: {},
    pendingCloseTabId: null,
    fileWrites: {},

    openSession: (session) => {
      const siblings = get().tabs.filter((tab) => tab.session === session);
      if (siblings.length === 0) addTab(session);
      else set({ selectedSession: session, activeTabId: siblings[siblings.length - 1]!.id });
      // Asking for a terminal is asking for the workbench, wherever you asked from.
      set({ settingsOpen: false, creation: { ...get().creation, open: false } });
    },

    openTab: (session) => {
      addTab(session);
      set({ settingsOpen: false, creation: { ...get().creation, open: false } });
    },

    /** Blank means "no name of mine", not "a tab with no name". */
    renameTab: (tabId, title) => {
      const customTitle = title?.trim() ? title.trim() : null;
      set({
        tabs: get().tabs.map((tab) =>
          tab.id === tabId && tab.kind === "shell" ? { ...tab, customTitle } : tab,
        ),
      });
    },

    openFileTab: (session, path, name) => {
      const id = `${session}:file:${path}`;
      const existing = get().tabs.some((tab) => tab.id === id);
      if (existing) {
        set({ selectedSession: session, activeTabId: id });
      } else {
        set({
          tabs: [
            ...get().tabs,
            { kind: "file", id, session, path, name },
          ],
          selectedSession: session,
          activeTabId: id,
        });
      }
      // Asking for a file is asking for the workbench, wherever you asked from.
      set({ settingsOpen: false });
    },

    closeTab: (tabId) => {
      const { tabs, dirtyTabs, pendingCloseTabId } = get();
      const closing = tabs.find((tab) => tab.id === tabId);
      if (!closing) return;
      const remaining = tabs.filter((tab) => tab.id !== tabId);
      set({
        tabs: remaining,
        // The buffer goes with the tab: a flag for a tab that is gone would
        // outlive the thing it described.
        dirtyTabs: dropKey(dirtyTabs, tabId),
        ...(pendingCloseTabId === tabId ? { pendingCloseTabId: null } : {}),
      });
      reconcile();
      if (!remaining.some((tab) => tab.session === closing.session)) release(closing.session);
    },

    focusTab: (tabId) => {
      const { tabs, selectedSession } = get();
      const target = tabs.find((tab) => tab.id === tabId);
      // A tab of another session would be a selection change, not a focus.
      if (!target || target.session !== selectedSession) return;
      set({ activeTabId: tabId, creation: { ...get().creation, open: false } });
    },

    closeSessionTabs: (session) => {
      const { tabs, dirtyTabs, pendingCloseTabId } = get();
      const remaining = tabs.filter((tab) => tab.session !== session);
      if (remaining.length === tabs.length) return;
      const pending = remaining.some((tab) => tab.id === pendingCloseTabId) ? pendingCloseTabId : null;
      set({ tabs: remaining, dirtyTabs: liveDirty(dirtyTabs, remaining), pendingCloseTabId: pending });
      reconcile();
      release(session);
    },

    setTabDirty: (tabId, dirty) =>
      set((current) =>
        // A keystroke must not be a store write: the pane reports on the way in
        // and on the way out of being dirty, not on every character.
        (current.dirtyTabs[tabId] ?? false) === dirty
          ? current
          : { dirtyTabs: { ...current.dirtyTabs, [tabId]: dirty } },
      ),

    requestCloseTab: (tabId) => {
      const { tabs, dirtyTabs } = get();
      const target = tabs.find((tab) => tab.id === tabId);
      if (!target) return;
      if (!dirtyTabs[tabId]) {
        get().closeTab(tabId);
        return;
      }
      // The question belongs to the pane that owns the buffer, so bring that
      // pane to the front first — a parked tab would be asked nothing anybody
      // could see. Leaving settings is part of the same move: the question is
      // raised in the workbench, and the workbench is what has to be on screen.
      set({
        selectedSession: target.session,
        activeTabId: tabId,
        pendingCloseTabId: tabId,
        settingsOpen: false,
      });
    },

    cancelPendingClose: () => set({ pendingCloseTabId: null }),

    noteFileWrite: (session, dir) =>
      set((current) => ({
        fileWrites: { ...current.fileWrites, [session]: { dir, revision: ++writeRevision } },
      })),

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

    collapseAllDirectories: (session) =>
      set((current) => {
        if ((current.expandedDirs[session] ?? []).length === 0) return current;
        return { expandedDirs: { ...current.expandedDirs, [session]: [] } };
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
      const { tabs, sessions, selectedSession, dirtyTabs, pendingCloseTabId } = get();
      const existing = new Set(sessions.map((session) => session.name));
      const remaining = tabs.filter((tab) => existing.has(tab.session));
      const keepSelection = selectedSession !== null && existing.has(selectedSession);
      if (remaining.length === tabs.length && keepSelection) return;
      const pending = remaining.some((tab) => tab.id === pendingCloseTabId) ? pendingCloseTabId : null;
      set({
        tabs: remaining,
        dirtyTabs: liveDirty(dirtyTabs, remaining),
        pendingCloseTabId: pending,
        selectedSession: keepSelection ? selectedSession : null,
      });
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
