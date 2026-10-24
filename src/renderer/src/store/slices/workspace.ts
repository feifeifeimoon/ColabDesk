import type { StateCreator } from "zustand";
import * as api from "../../lib/api";
import {
  clampRatio,
  createGroupId,
  createSplitId,
  findGroupLeaf,
  findSiblingGroupId,
  isSameOrder,
  isSplitDropNoOp,
  lastGroupId,
  leafGroups,
  leafLayout,
  moveWithin,
  normalizeLayout,
  pickNextActiveTab,
  pushRecent,
  removeGroup,
  setSplitRatio,
  splitAt,
  type GroupLayout,
  type PaneZone,
  type TabGroup,
} from "../../lib/tab-groups";
import type { AppState, FileTab, TerminalTab, WorkspaceSlice, WorkspaceTab } from "../types";

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

function makeGroup(
  session: string,
  tabId: string,
  id = createGroupId(session),
): TabGroup {
  return {
    id,
    session,
    tabOrder: [tabId],
    activeTabId: tabId,
    recentTabIds: [tabId],
  };
}

/** Makes a tab the group's active one and records it as the most recent. */
function activate(group: TabGroup, tabId: string): TabGroup {
  return {
    ...group,
    activeTabId: tabId,
    recentTabIds: pushRecent(group.recentTabIds, tabId),
  };
}

/** Adds or moves a tab inside one group, before `beforeTabId` (`null` = end). */
function attachToGroup(group: TabGroup, tabId: string, beforeTabId: string | null): TabGroup {
  return activate(
    { ...group, tabOrder: moveWithin(group.tabOrder, tabId, beforeTabId) },
    tabId,
  );
}

/**
 * Removes a tab from a group without dropping the group. `null` means the group
 * would be left empty and its pane has to go. If the tab was the active one,
 * Orca's MRU rule decides what comes back.
 */
function detachFromGroup(
  group: TabGroup,
  tabId: string,
): { group: TabGroup; remaining: string[] } | null {
  if (!group.tabOrder.includes(tabId)) return null;
  const remaining = group.tabOrder.filter((id) => id !== tabId);
  if (remaining.length === 0) return null;

  const nextActive =
    group.activeTabId !== tabId && remaining.includes(group.activeTabId)
      ? group.activeTabId
      : (pickNextActiveTab(group, tabId, remaining) ?? remaining[remaining.length - 1]!);
  const recent = group.recentTabIds.filter((id) => id !== tabId);

  return {
    remaining,
    group: {
      ...group,
      tabOrder: remaining,
      activeTabId: nextActive,
      recentTabIds: pushRecent(recent, nextActive),
    },
  };
}

/** Drops layout leaves whose group no longer exists. */
function sanitizeLayout(
  layout: GroupLayout,
  groups: Record<string, TabGroup>,
): GroupLayout | null {
  if (layout.kind === "leaf") return groups[layout.groupId] ? layout : null;
  const first = sanitizeLayout(layout.first, groups);
  const second = sanitizeLayout(layout.second, groups);
  if (!first) return second;
  if (!second) return first;
  return { ...layout, ratio: clampRatio(layout.ratio), first, second };
}

export const createWorkspaceSlice: StateCreator<AppState, [], [], WorkspaceSlice> = (set, get) => {
  /** Bumped by every save, so a tree can tell two writes to one directory apart. */
  let writeRevision = 0;

  /**
   * Repairs the one thing every pane action needs: a session's tabs are all in
   * groups, and those groups are the leaves of its layout. Normal actions keep
   * this true; this is the safety net after a failed or interrupted write.
   */
  function ensureGrouped(
    state: AppState,
    session: string,
  ): {
    tabs: WorkspaceTab[];
    groups: Record<string, TabGroup>;
    groupLayouts: Record<string, GroupLayout>;
    focusedGroupBySession: Record<string, string>;
  } | null {
    const sessionTabs = state.tabs.filter((tab) => tab.session === session);
    if (sessionTabs.length === 0) return null;

    const layout = state.groupLayouts[session];
    const leaves = layout ? leafGroups(layout) : [];
    if (leaves.length > 0 && leaves.every((groupId) => state.groups[groupId])) return null;

    const groupId = createGroupId(session);
    const active = sessionTabs[sessionTabs.length - 1]!;
    const group: TabGroup = {
      id: groupId,
      session,
      tabOrder: sessionTabs.map((tab) => tab.id),
      activeTabId: active.id,
      recentTabIds: sessionTabs.map((tab) => tab.id),
    };

    const groups: Record<string, TabGroup> = { ...state.groups, [groupId]: group };
    for (const [id, candidate] of Object.entries(groups)) {
      if (candidate.session === session && id !== groupId) delete groups[id];
    }

    return {
      tabs: state.tabs.map((tab) => (tab.session === session ? { ...tab, groupId } : tab)),
      groups,
      groupLayouts: { ...state.groupLayouts, [session]: leafLayout(groupId) },
      focusedGroupBySession: { ...state.focusedGroupBySession, [session]: groupId },
    };
  }

  /** Adds a tab to the focused (or the requested) pane, creating a pane if needed. */
  function attachTab(session: string, tab: WorkspaceTab, groupId?: string): WorkspaceTab {
    const state = get();
    const repaired = ensureGrouped(state, session);
    const tabs = repaired?.tabs ?? state.tabs;
    const groups = { ...(repaired?.groups ?? state.groups) };
    const groupLayouts = { ...(repaired?.groupLayouts ?? state.groupLayouts) };
    const focused = { ...(repaired?.focusedGroupBySession ?? state.focusedGroupBySession) };

    const layout = groupLayouts[session];
    const leaves = layout ? leafGroups(layout) : [];
    const wanted = groupId ?? focused[session];
    let target =
      wanted && leaves.includes(wanted) ? wanted : layout ? lastGroupId(layout) : undefined;

    if (target && groups[target]) {
      groups[target] = attachToGroup(groups[target]!, tab.id, null);
    } else {
      const group = makeGroup(session, tab.id);
      target = group.id;
      groups[group.id] = group;
      groupLayouts[session] = leafLayout(group.id);
    }

    tab.groupId = target;
    focused[session] = target;

    set({
      tabs: [...tabs, tab],
      groups,
      groupLayouts,
      focusedGroupBySession: focused,
      selectedSession: session,
      settingsOpen: false,
      creation: { ...state.creation, open: false },
    });
    return tab;
  }

  /** One more shell for a session, numbered after the highest it has. */
  function addTab(session: string, groupId?: string): TerminalTab {
    const existing = get().tabs.filter(
      (tab): tab is TerminalTab => tab.session === session && tab.kind === "shell",
    );
    const ordinal = existing.reduce((highest, tab) => Math.max(highest, tab.ordinal), 0) + 1;
    const tab: TerminalTab = {
      kind: "shell",
      id: `${session}:${ordinal}`,
      session,
      groupId: "",
      ordinal,
      customTitle: null,
    };
    return attachTab(session, tab, groupId) as TerminalTab;
  }

  /**
   * Repairs focus after a tab or group disappeared. It does not invent tabs:
   * it only removes dead groups/leaves and makes sure the remembered pane, and
   * every group's active tab, still point at something.
   */
  function reconcile(): void {
    const state = get();
    const liveTabs = new Set(state.tabs.map((tab) => tab.id));
    const groups: Record<string, TabGroup> = { ...state.groups };
    const groupLayouts: Record<string, GroupLayout> = { ...state.groupLayouts };
    const focused = { ...state.focusedGroupBySession };

    for (const [id, group] of Object.entries(groups)) {
      const order = group.tabOrder.filter((tabId) => liveTabs.has(tabId));
      if (order.length === 0) {
        delete groups[id];
        continue;
      }
      if (order.length === group.tabOrder.length && order.includes(group.activeTabId)) continue;

      const recent = group.recentTabIds.filter((tabId) => order.includes(tabId));
      const active = order.includes(group.activeTabId)
        ? group.activeTabId
        : (pickNextActiveTab(group, group.activeTabId, order) ?? order[order.length - 1]!);
      groups[id] = {
        ...group,
        tabOrder: order,
        activeTabId: active,
        recentTabIds: pushRecent(recent, active),
      };
    }

    for (const [session, layout] of Object.entries(groupLayouts)) {
      const next = sanitizeLayout(layout, groups);
      if (!next) {
        delete groupLayouts[session];
        delete focused[session];
        continue;
      }
      groupLayouts[session] = next;
      const leaves = leafGroups(next);
      if (!leaves.includes(focused[session] ?? "")) {
        focused[session] = lastGroupId(next);
      }
    }

    for (const group of Object.values(groups)) {
      if (!groupLayouts[group.session]) {
        groupLayouts[group.session] = leafLayout(group.id);
        focused[group.session] = group.id;
      }
    }
    for (const session of Object.keys(focused)) {
      if (!groupLayouts[session]) delete focused[session];
    }

    set({ groups, groupLayouts, focusedGroupBySession: focused });
  }

  /** Lets go of a connection: the session's last tab closed. A file tab needs
      the connection too, so it counts. */
  function release(session: string): void {
    set((current) => {
      const groups: Record<string, TabGroup> = {};
      for (const [id, group] of Object.entries(current.groups)) {
        if (group.session !== session) groups[id] = group;
      }
      return {
        groups,
        // The panes describe tabs that no longer exist; a later reconnect must
        // start from one group, not from a stale split tree.
        groupLayouts: dropKey(current.groupLayouts, session),
        focusedGroupBySession: dropKey(current.focusedGroupBySession, session),
        // The tree goes with the connection: an expanded set describes listings
        // that no longer exist, and reopening them would show a wrong tree.
        expandedDirs: dropKey(current.expandedDirs, session),
        transferCounts: dropKey(current.transferCounts, session),
        // So does the record of where a save landed: a leftover would make the
        // next mount re-read a directory nobody opened.
        fileWrites: dropKey(current.fileWrites, session),
      };
    });
    // A runtime accepts one SSH connection, so holding it is what having a
    // shell means. The status stream reports the closure itself.
    void api.sshDisconnect(session);
  }

  return {
    tabs: [],
    groups: {},
    groupLayouts: {},
    focusedGroupBySession: {},
    selectedSession: null,
    connections: {},
    expandedDirs: {},
    transferCounts: {},
    dirtyTabs: {},
    pendingCloseTabId: null,
    fileWrites: {},

    openSession: (session) => {
      const state = get();
      const sessionTabs = state.tabs.filter((tab) => tab.session === session);
      if (sessionTabs.length === 0) {
        addTab(session);
        return;
      }

      const repaired = ensureGrouped(state, session);
      const groups = repaired?.groups ?? state.groups;
      const groupLayouts = repaired?.groupLayouts ?? state.groupLayouts;
      const focused = { ...(repaired?.focusedGroupBySession ?? state.focusedGroupBySession) };
      const layout = groupLayouts[session];
      const leaves = layout ? leafGroups(layout) : [];
      const remembered = focused[session];
      const target =
        remembered && leaves.includes(remembered)
          ? remembered
          : layout
            ? lastGroupId(layout)
            : undefined;
      if (target) focused[session] = target;

      set({
        ...(repaired
          ? {
              tabs: repaired.tabs,
              groups,
              groupLayouts,
              focusedGroupBySession: focused,
            }
          : { focusedGroupBySession: focused }),
        selectedSession: session,
        settingsOpen: false,
        creation: { ...state.creation, open: false },
      });
    },

    openTab: (session, groupId) => {
      addTab(session, groupId);
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
      const state = get();
      const id = `${session}:file:${path}`;
      const existing = state.tabs.find((tab) => tab.id === id);
      if (existing) {
        const group = state.groups[existing.groupId];
        const layout = state.groupLayouts[session];
        if (group && layout && findGroupLeaf(layout, group.id)) {
          set({
            groups: { ...state.groups, [group.id]: activate(group, id) },
            focusedGroupBySession: {
              ...state.focusedGroupBySession,
              [session]: group.id,
            },
            selectedSession: session,
            settingsOpen: false,
            creation: { ...state.creation, open: false },
          });
          return;
        }
        // A tab whose pane is gone is not a tab anybody can see: recreate it.
        set({ tabs: state.tabs.filter((tab) => tab.id !== id) });
      }

      const tab: FileTab = {
        kind: "file",
        id,
        session,
        groupId: "",
        path,
        name,
      };
      attachTab(session, tab);
      set({ settingsOpen: false });
    },

    closeTab: (tabId) => {
      const state = get();
      const closing = state.tabs.find((tab) => tab.id === tabId);
      if (!closing) return;

      const session = closing.session;
      const tabs = state.tabs.filter((tab) => tab.id !== tabId);
      const groups = { ...state.groups };
      const groupLayouts = { ...state.groupLayouts };
      const focused = { ...state.focusedGroupBySession };
      const group = groups[closing.groupId];
      let layout: GroupLayout | undefined = groupLayouts[session];
      // The sibling is the other child of the removed leaf's parent split. It
      // has to be read before removeGroup collapses that parent; the last leaf
      // in visual order can be a distant pane in a nested layout.
      const sibling = layout ? findSiblingGroupId(layout, closing.groupId) : null;

      if (group) {
        const detached = detachFromGroup(group, tabId);
        if (detached) {
          groups[group.id] = detached.group;
        } else {
          delete groups[group.id];
          if (layout) {
            const next = normalizeLayout(removeGroup(layout, group.id));
            if (next) {
              layout = next;
              groupLayouts[session] = next;
            } else {
              delete groupLayouts[session];
              layout = undefined;
            }
          }
          if (focused[session] === group.id) {
            const next =
              sibling && groups[sibling] ? sibling : layout ? lastGroupId(layout) : undefined;
            if (next) focused[session] = next;
            else delete focused[session];
          }
        }
      }

      set({
        tabs,
        groups,
        groupLayouts,
        focusedGroupBySession: focused,
        dirtyTabs: dropKey(state.dirtyTabs, tabId),
        ...(state.pendingCloseTabId === tabId ? { pendingCloseTabId: null } : {}),
      });

      if (!tabs.some((tab) => tab.session === session)) release(session);
      else reconcile();
    },

    requestCloseTab: (tabId) => {
      const state = get();
      const target = state.tabs.find((tab) => tab.id === tabId);
      if (!target) return;
      if (!state.dirtyTabs[tabId]) {
        get().closeTab(tabId);
        return;
      }
      // The question belongs to the pane that owns the buffer, so bring that
      // pane and its tab forward first — a parked tab would be asked nothing
      // anybody could see. Leaving settings is part of the same move.
      set({
        selectedSession: target.session,
        settingsOpen: false,
        creation: { ...state.creation, open: false },
      });
      get().focusTab(tabId);
      set({ pendingCloseTabId: tabId });
    },

    cancelPendingClose: () => set({ pendingCloseTabId: null }),

    focusGroup: (session, groupId) => {
      const state = get();
      const group = state.groups[groupId];
      const layout = state.groupLayouts[session];
      if (!group || group.session !== session || !layout || !findGroupLeaf(layout, groupId)) return;
      if (state.selectedSession === session && state.focusedGroupBySession[session] === groupId) {
        return;
      }
      set({
        selectedSession: session,
        focusedGroupBySession: { ...state.focusedGroupBySession, [session]: groupId },
        creation: { ...state.creation, open: false },
      });
    },

    focusTab: (tabId) => {
      const state = get();
      const target = state.tabs.find((tab) => tab.id === tabId);
      // A tab of another session would be a selection change, not a focus.
      if (!target || target.session !== state.selectedSession) return;
      const group = state.groups[target.groupId];
      const layout = state.groupLayouts[target.session];
      if (!group || group.session !== target.session || !layout) return;
      if (!findGroupLeaf(layout, group.id)) return;

      const alreadyActive = group.activeTabId === tabId;
      const alreadyFocused = state.focusedGroupBySession[target.session] === group.id;
      if (alreadyActive && alreadyFocused) return;

      set({
        groups: { ...state.groups, [group.id]: activate(group, tabId) },
        focusedGroupBySession: {
          ...state.focusedGroupBySession,
          [target.session]: group.id,
        },
        creation: { ...state.creation, open: false },
      });
    },

    closeSessionTabs: (session) => {
      const state = get();
      const removed = state.tabs.filter((tab) => tab.session === session);
      if (removed.length === 0) return;
      const remaining = state.tabs.filter((tab) => tab.session !== session);
      const pending = remaining.some((tab) => tab.id === state.pendingCloseTabId)
        ? state.pendingCloseTabId
        : null;
      set({
        tabs: remaining,
        dirtyTabs: liveDirty(state.dirtyTabs, remaining),
        pendingCloseTabId: pending,
      });
      release(session);
      reconcile();
    },

    focusTabAt: (index) => {
      const state = get();
      const session = state.selectedSession;
      if (!session) return;
      const layout = state.groupLayouts[session];
      const groupId =
        state.focusedGroupBySession[session] ??
        (layout ? lastGroupId(layout) : undefined);
      const group = groupId ? state.groups[groupId] : undefined;
      const target = group?.tabOrder[index];
      if (target) get().focusTab(target);
    },

    reorderTab: (groupId, tabId, beforeTabId) => {
      const state = get();
      const group = state.groups[groupId];
      if (!group || !group.tabOrder.includes(tabId)) return;
      const tabOrder = moveWithin(group.tabOrder, tabId, beforeTabId);
      if (isSameOrder(tabOrder, group.tabOrder)) return;
      set({ groups: { ...state.groups, [groupId]: { ...group, tabOrder } } });
    },

    moveTabToGroup: (tabId, targetGroupId, beforeTabId) => {
      const state = get();
      const moved = state.tabs.find((tab) => tab.id === tabId);
      if (!moved) return;
      const repaired = ensureGrouped(state, moved.session);
      const tabs = repaired?.tabs ?? state.tabs;
      const groups = { ...(repaired?.groups ?? state.groups) };
      const groupLayouts = { ...(repaired?.groupLayouts ?? state.groupLayouts) };
      const focused = { ...(repaired?.focusedGroupBySession ?? state.focusedGroupBySession) };
      const tab = tabs.find((candidate) => candidate.id === tabId);
      if (!tab) return;

      const target = groups[targetGroupId];
      if (!target || target.session !== tab.session) return;
      const source = groups[tab.groupId];
      if (!source) return;
      if (source.id === target.id) {
        get().reorderTab(source.id, tabId, beforeTabId);
        return;
      }

      const detached = detachFromGroup(source, tabId);
      if (detached) groups[source.id] = detached.group;
      else {
        delete groups[source.id];
        const layout = groupLayouts[tab.session];
        if (layout) {
          const next = normalizeLayout(removeGroup(layout, source.id));
          if (next) groupLayouts[tab.session] = next;
          else delete groupLayouts[tab.session];
        }
      }

      const remainingTarget = groups[targetGroupId];
      if (!remainingTarget) return;
      groups[targetGroupId] = attachToGroup(remainingTarget, tabId, beforeTabId);
      focused[tab.session] = targetGroupId;
      if (!groupLayouts[tab.session]) groupLayouts[tab.session] = leafLayout(targetGroupId);

      set({
        tabs: tabs.map((candidate) =>
          candidate.id === tabId ? { ...candidate, groupId: targetGroupId } : candidate,
        ),
        groups,
        groupLayouts,
        focusedGroupBySession: focused,
        selectedSession: tab.session,
        creation: { ...state.creation, open: false },
      });
    },

    splitTabToGroup: (tabId, targetGroupId, zone: PaneZone) => {
      const state = get();
      const moved = state.tabs.find((tab) => tab.id === tabId);
      if (!moved) return;
      const repaired = ensureGrouped(state, moved.session);
      const tabs = repaired?.tabs ?? state.tabs;
      const groups = { ...(repaired?.groups ?? state.groups) };
      const groupLayouts = { ...(repaired?.groupLayouts ?? state.groupLayouts) };
      const focused = { ...(repaired?.focusedGroupBySession ?? state.focusedGroupBySession) };
      const tab = tabs.find((candidate) => candidate.id === tabId);
      if (!tab) return;

      const target = groups[targetGroupId];
      if (!target || target.session !== tab.session) return;
      const source = groups[tab.groupId];
      if (!source) return;
      const layout = groupLayouts[tab.session];
      if (!layout) return;

      if (
        isSplitDropNoOp({
          layout,
          sourceGroupId: source.id,
          targetGroupId,
          zone,
          sourceTabCount: source.tabOrder.length,
        })
      ) {
        return;
      }

      const newGroupId = createGroupId(tab.session);
      if (source.id === targetGroupId) {
        const detached = detachFromGroup(source, tabId);
        if (!detached) return;
        groups[source.id] = detached.group;
      } else {
        const detached = detachFromGroup(source, tabId);
        if (detached) groups[source.id] = detached.group;
        else {
          delete groups[source.id];
          const next = normalizeLayout(removeGroup(layout, source.id));
          if (!next) return;
          groupLayouts[tab.session] = next;
        }
      }

      const beforeSplit = groupLayouts[tab.session];
      if (!beforeSplit) return;
      const nextLayout = normalizeLayout(
        splitAt(beforeSplit, targetGroupId, zone, newGroupId, createSplitId(tab.session)),
      );
      if (!nextLayout) return;

      const newGroup = makeGroup(tab.session, tabId, newGroupId);
      groups[newGroupId] = newGroup;
      groupLayouts[tab.session] = nextLayout;
      focused[tab.session] = newGroupId;

      set({
        tabs: tabs.map((candidate) =>
          candidate.id === tabId ? { ...candidate, groupId: newGroupId } : candidate,
        ),
        groups,
        groupLayouts,
        focusedGroupBySession: focused,
        selectedSession: tab.session,
        creation: { ...state.creation, open: false },
      });
    },

    setGroupRatio: (session, splitId, ratio) => {
      const state = get();
      const layout = state.groupLayouts[session];
      if (!layout) return;
      const next = setSplitRatio(layout, splitId, ratio);
      if (next === layout) return;
      set({ groupLayouts: { ...state.groupLayouts, [session]: next } });
    },

    noteFileWrite: (session, dir) =>
      set((current) => ({
        fileWrites: { ...current.fileWrites, [session]: { dir, revision: ++writeRevision } },
      })),

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

    setTabDirty: (tabId, dirty) =>
      set((current) =>
        // A keystroke must not be a store write: the pane reports on the way in
        // and on the way out of being dirty, not on every character.
        (current.dirtyTabs[tabId] ?? false) === dirty
          ? current
          : { dirtyTabs: { ...current.dirtyTabs, [tabId]: dirty } },
      ),

    pruneTabs: () => {
      const { tabs, sessions, selectedSession, dirtyTabs, pendingCloseTabId } = get();
      const existing = new Set(sessions.map((session) => session.name));
      const remaining = tabs.filter((tab) => existing.has(tab.session));
      const keepSelection = selectedSession !== null && existing.has(selectedSession);
      if (remaining.length === tabs.length && keepSelection) return;

      const gone = new Set(tabs.filter((tab) => !existing.has(tab.session)).map((tab) => tab.session));
      const pending = remaining.some((tab) => tab.id === pendingCloseTabId) ? pendingCloseTabId : null;
      set({
        tabs: remaining,
        dirtyTabs: liveDirty(dirtyTabs, remaining),
        pendingCloseTabId: pending,
        selectedSession: keepSelection ? selectedSession : null,
      });
      // A gone session's panes have nothing left to serve, and a runtime takes
      // one SSH connection at a time: a connection nobody can reach is what a
      // later reconnect would run into.
      for (const session of gone) release(session);
      reconcile();
    },
  };
};
