/**
 * The workspace slice's own bookkeeping, against the real store — no React.
 *
 * These cover what an end-to-end run cannot see: that a session's connection is
 * released by its *last* shell and not by the first one to close, that the
 * per-session maps go with it (a leftover would resurface as the old path when
 * the session is reopened), and that reporting an unchanged value is not a
 * write (panes report on mount, so a write there would re-render the tree that
 * just mounted them — a loop).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";
import { leafGroups } from "../../lib/tab-groups";
import type { SessionsSlice, SurfacesSlice, WorkspaceSlice } from "../types";
import { createSessionsSlice } from "./sessions";
import { createSurfacesSlice } from "./surfaces";
import { createWorkspaceSlice } from "./workspace";

vi.mock("../../lib/api", () => ({ sshDisconnect: vi.fn() }));
import { sshDisconnect } from "../../lib/api";

type TestState = WorkspaceSlice & SessionsSlice & SurfacesSlice;

function workspaceStore() {
  return createStore<TestState>()((set, get, api) => ({
    // The slices are declared against the whole app state; this store carries
    // the three they need to run. `preferences` stays out because it reads
    // localStorage at creation, and this runs without a window.
    ...createWorkspaceSlice(set as never, get as never, api as never),
    ...createSessionsSlice(set as never, get as never, api as never),
    ...createSurfacesSlice(set as never, get as never, api as never),
  }));
}

/** Only the name matters to the tab bookkeeping. */
const named = (name: string) => ({ name }) as TestState["sessions"][number];

/** Just the shells, so a test about numbering reads like one. */
const shells = (store: { getState: () => TestState }) =>
  store.getState().tabs.flatMap((tab) => (tab.kind === "shell" ? [tab] : []));

/** The active tab of the selected session's focused pane. */
const focusedTabId = (store: { getState: () => TestState }): string | null => {
  const state = store.getState();
  const groupId = state.selectedSession
    ? state.focusedGroupBySession[state.selectedSession]
    : undefined;
  return groupId ? (state.groups[groupId]?.activeTabId ?? null) : null;
};

/** The group the selected session's keyboard is in. */
const focusedGroup = (store: { getState: () => TestState }) => {
  const state = store.getState();
  const groupId = state.selectedSession
    ? state.focusedGroupBySession[state.selectedSession]
    : undefined;
  return groupId ? state.groups[groupId] : undefined;
};

beforeEach(() => vi.mocked(sshDisconnect).mockClear());

describe("opening shells", () => {
  it("gives every shell of a session its own tab, numbered apart", () => {
    const store = workspaceStore();

    store.getState().openTab("alpha");
    store.getState().openTab("alpha");
    const [first, second] = shells(store);

    expect(store.getState().tabs).toHaveLength(2);
    expect(new Set([first!.id, second!.id]).size).toBe(2);
    expect(second!.ordinal).toBeGreaterThan(first!.ordinal);
    expect(focusedTabId(store)).toBe(second!.id);

    // The number follows the highest one still open, so two live tabs of a
    // session can never share a name.
    store.getState().closeTab(first!.id);
    store.getState().openTab("alpha");
    const ordinals = shells(store).map((tab) => tab.ordinal);
    expect(new Set(ordinals).size).toBe(ordinals.length);
    expect(ordinals).toContain(second!.ordinal);
  });

  it("opening a session selects it without adding a shell it already has", () => {
    const store = workspaceStore();
    store.getState().openTab("alpha");
    store.getState().openTab("beta");

    store.getState().openSession("alpha");

    expect(store.getState().selectedSession).toBe("alpha");
    expect(store.getState().tabs).toHaveLength(2);
    expect(focusedTabId(store)).toBe(store.getState().tabs[0]!.id);
  });

  it("focuses the nth shell of the selected session", () => {
    const store = workspaceStore();
    store.getState().openTab("alpha");
    store.getState().openTab("alpha");
    store.getState().openTab("beta");

    store.getState().focusTabAt(0);

    expect(focusedTabId(store)).toBe(
      store.getState().tabs.find((tab) => tab.session === "beta")!.id,
    );
  });
});

describe("opening files", () => {
  it("opens each file once: asking again focuses the tab it already has", () => {
    const store = workspaceStore();
    store.getState().openFileTab("alpha", "/content/train.log", "train.log");
    store.getState().openTab("alpha");

    store.getState().openFileTab("alpha", "/content/train.log", "train.log");

    const files = store.getState().tabs.filter((tab) => tab.kind === "file");
    expect(files).toHaveLength(1);
    expect(focusedTabId(store)).toBe(files[0]!.id);
    expect(store.getState().selectedSession).toBe("alpha");
  });

  it("a file tab is a reason to stay connected, the same as a shell is", () => {
    const store = workspaceStore();
    store.getState().openTab("alpha");
    store.getState().openFileTab("alpha", "/content/train.log", "train.log");
    const [shell] = shells(store);

    store.getState().closeTab(shell!.id);
    // The file is still being read; hanging up would take it with the session.
    expect(sshDisconnect).not.toHaveBeenCalled();

    const [file] = store.getState().tabs;
    store.getState().closeTab(file!.id);
    expect(sshDisconnect).toHaveBeenCalledWith("alpha");
  });
});

describe("unsaved edits", () => {
  it("closing a dirty tab asks instead of closing it, and brings it forward", () => {
    const store = workspaceStore();
    store.getState().openTab("alpha");
    store.getState().openFileTab("alpha", "/content/train.log", "train.log");
    const file = store.getState().tabs[1]!;
    store.getState().focusTab(store.getState().tabs[0]!.id);
    store.getState().setTabDirty(file.id, true);
    store.setState({ settingsOpen: true });

    store.getState().requestCloseTab(file.id);

    expect(store.getState().tabs).toHaveLength(2);
    expect(store.getState().pendingCloseTabId).toBe(file.id);
    // The pane that owns the buffer has to be the one on screen, or the
    // question would be asked of nobody — and the workbench, not the settings
    // page, is where the pane lives.
    expect(focusedTabId(store)).toBe(file.id);
    expect(store.getState().settingsOpen).toBe(false);
  });

  it("a clean tab closes without a question, and cancelling drops one", () => {
    const store = workspaceStore();
    store.getState().openTab("alpha");
    store.getState().requestCloseTab(store.getState().tabs[0]!.id);
    expect(store.getState().tabs).toHaveLength(0);
    expect(store.getState().pendingCloseTabId).toBeNull();

    store.getState().openFileTab("alpha", "/content/x", "x");
    const file = store.getState().tabs[0]!;
    store.getState().setTabDirty(file.id, true);
    store.getState().requestCloseTab(file.id);
    store.getState().cancelPendingClose();

    expect(store.getState().pendingCloseTabId).toBeNull();
    expect(store.getState().tabs).toHaveLength(1);
  });

  it("a closed tab takes its dirt with it", () => {
    const store = workspaceStore();
    store.getState().openFileTab("alpha", "/content/x", "x");
    const file = store.getState().tabs[0]!;
    store.getState().setTabDirty(file.id, true);

    store.getState().closeTab(file.id);

    expect(store.getState().dirtyTabs[file.id]).toBeUndefined();
  });

  it("closing every tab leaves no dirt behind", () => {
    const store = workspaceStore();
    store.getState().openFileTab("alpha", "/content/x", "x");
    store.getState().openFileTab("beta", "/content/y", "y");
    const [alphaFile] = store.getState().tabs;
    store.getState().setTabDirty(alphaFile!.id, true);

    store.getState().closeSessionTabs("alpha");

    expect(store.getState().dirtyTabs[alphaFile!.id]).toBeUndefined();
  });

  it("repeating a dirty flag is not a write — a keystroke must not be one", () => {
    const store = workspaceStore();
    store.getState().openFileTab("alpha", "/content/x", "x");
    const file = store.getState().tabs[0]!;
    store.getState().setTabDirty(file.id, true);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.getState().setTabDirty(file.id, true);

    unsubscribe();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("saves", () => {
  it("notes the directory a save landed in, one revision at a time", () => {
    const store = workspaceStore();

    store.getState().noteFileWrite("alpha", "/content");
    const first = store.getState().fileWrites.alpha!;
    store.getState().noteFileWrite("alpha", "/content/data");
    const second = store.getState().fileWrites.alpha!;

    expect(second.dir).toBe("/content/data");
    // A revision, not a timestamp: two saves in the same millisecond are two.
    expect(second.revision).toBeGreaterThan(first.revision);
  });
});

describe("closing shells", () => {
  it("keeps the connection while another shell of the session is open", () => {
    const store = workspaceStore();
    store.getState().openTab("alpha");
    store.getState().openTab("alpha");
    store.setState({
      connections: { alpha: { session: "alpha", status: "ready", error: null } },
      expandedDirs: { alpha: ["/content/data"] },
      transferCounts: { alpha: 2 },
    });
    const [first] = store.getState().tabs;

    store.getState().closeTab(first!.id);

    expect(sshDisconnect).not.toHaveBeenCalled();
    expect(store.getState().tabs).toHaveLength(1);
    expect(store.getState().expandedDirs.alpha).toEqual(["/content/data"]);
    expect(focusedTabId(store)).toBe(store.getState().tabs[0]!.id);
  });

  it("releases the connection with the last shell, and drops what was reported", () => {
    const store = workspaceStore();
    store.getState().openTab("alpha");
    store.setState({
      expandedDirs: { alpha: ["/content/data"] },
      transferCounts: { alpha: 2 },
      fileWrites: { alpha: { dir: "/content", revision: 1 } },
    });
    const [only] = store.getState().tabs;

    store.getState().closeTab(only!.id);

    expect(store.getState().tabs).toHaveLength(0);
    expect(focusedTabId(store)).toBeNull();
    expect(store.getState().expandedDirs.alpha).toBeUndefined();
    expect(store.getState().transferCounts.alpha).toBeUndefined();
    // A leftover would make the next mount re-read a directory nobody opened.
    expect(store.getState().fileWrites.alpha).toBeUndefined();
    expect(sshDisconnect).toHaveBeenCalledWith("alpha");
  });

  it("closing every shell of a session hangs up in one step", () => {
    const store = workspaceStore();
    store.getState().openTab("alpha");
    store.getState().openTab("alpha");
    store.getState().openTab("beta");

    store.getState().closeSessionTabs("alpha");

    expect(store.getState().tabs.map((tab) => tab.session)).toEqual(["beta"]);
    expect(sshDisconnect).toHaveBeenCalledTimes(1);
    expect(sshDisconnect).toHaveBeenCalledWith("alpha");
  });

  it("keeps the selection on a session whose shells are all gone", () => {
    const store = workspaceStore();
    store.getState().openTab("alpha");
    const [only] = store.getState().tabs;

    store.getState().closeTab(only!.id);

    // The rail is still on that host; the workbench says it has no terminals
    // rather than jumping to another runtime.
    expect(store.getState().selectedSession).toBe("alpha");
  });
});

describe("the file tree's shape", () => {
  it("opens a directory, and closes it again", () => {
    const store = workspaceStore();

    store.getState().toggleDirectory("alpha", "/content/data");
    expect(store.getState().expandedDirs.alpha).toEqual(["/content/data"]);

    store.getState().toggleDirectory("alpha", "/content/data");
    expect(store.getState().expandedDirs.alpha).toEqual([]);
  });

  it("closing a folder closes everything under it", () => {
    const store = workspaceStore();
    store.getState().toggleDirectory("alpha", "/content");
    store.getState().toggleDirectory("alpha", "/content/data");
    store.getState().toggleDirectory("alpha", "/content/data/deep");

    store.getState().toggleDirectory("alpha", "/content");

    // A parent that is closed cannot have an open child: the child's row is not
    // on screen, and reopening the parent must not resurrect it.
    expect(store.getState().expandedDirs.alpha).toEqual([]);
  });

  it("forgetting a folder takes its subtree with it", () => {
    const store = workspaceStore();
    store.getState().toggleDirectory("alpha", "/content/data");
    store.getState().toggleDirectory("alpha", "/content/data/deep");
    store.getState().toggleDirectory("alpha", "/content/other");

    store.getState().forgetDirectory("alpha", "/content/data");

    expect(store.getState().expandedDirs.alpha).toEqual(["/content/other"]);
  });

  it("collapsing all closes every folder of one session only", () => {
    const store = workspaceStore();
    store.getState().toggleDirectory("alpha", "/content/data");
    store.getState().toggleDirectory("alpha", "/content/data/deep");
    store.getState().toggleDirectory("beta", "/content/other");

    store.getState().collapseAllDirectories("alpha");

    expect(store.getState().expandedDirs.alpha).toEqual([]);
    expect(store.getState().expandedDirs.beta).toEqual(["/content/other"]);
  });

  it("a changed count is a write", () => {
    const store = workspaceStore();
    store.getState().setTransferCount("alpha", 1);
    store.getState().setTransferCount("alpha", 0);

    expect(store.getState().transferCounts.alpha).toBe(0);
  });
});

describe("pruneTabs", () => {
  it("drops the shells of a vanished session and picks what is left", () => {
    const store = workspaceStore();
    store.getState().openTab("alpha");
    store.getState().openTab("beta");
    store.setState({ sessions: [named("beta")] });

    store.getState().pruneTabs();

    expect(store.getState().tabs.map((tab) => tab.session)).toEqual(["beta"]);
    expect(store.getState().selectedSession).toBe("beta");
  });

  it("leaves the list alone when every session still exists", () => {
    const store = workspaceStore();
    store.getState().openTab("alpha");
    store.setState({ sessions: [named("alpha")] });

    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.getState().pruneTabs();
    unsubscribe();

    expect(listener).not.toHaveBeenCalled();
  });

  it("drops the selection when the session that vanished is the selected one", () => {
    const store = workspaceStore();
    store.getState().openTab("alpha");
    store.getState().openTab("beta");
    store.getState().openSession("alpha");
    store.setState({ sessions: [named("beta")] });

    store.getState().pruneTabs();

    // beta still has a shell, but the rail does not jump to it: a session that
    // is gone leaves the workbench at the front door.
    expect(store.getState().selectedSession).toBeNull();
    expect(store.getState().tabs.map((tab) => tab.session)).toEqual(["beta"]);
  });

  it("hangs up for a retired session, once for all of its shells", () => {
    const store = workspaceStore();
    store.getState().openTab("alpha");
    store.getState().openTab("alpha");
    store.getState().openTab("beta");
    store.setState({ sessions: [named("beta")] });

    store.getState().pruneTabs();

    expect(sshDisconnect).toHaveBeenCalledTimes(1);
    expect(sshDisconnect).toHaveBeenCalledWith("alpha");
  });
});

describe("naming a tab", () => {
  it("keeps the name the user typed, without the blank space around it", () => {
    const store = workspaceStore();
    store.getState().openTab("alpha");
    const id = shells(store)[0]!.id;

    store.getState().renameTab(id, "  训练机 A  ");

    expect(shells(store)[0]!.customTitle).toBe("训练机 A");
  });

  it("treats a blank name as 'no name of mine', not as an empty label", () => {
    const store = workspaceStore();
    store.getState().openTab("alpha");
    const id = shells(store)[0]!.id;
    store.getState().renameTab(id, "训练机 A");

    store.getState().renameTab(id, "   ");

    expect(shells(store)[0]!.customTitle).toBeNull();
  });

  it("leaves a file tab alone: its name is the file's", () => {
    const store = workspaceStore();
    store.getState().openFileTab("alpha", "/content/train.log", "train.log");
    const before = store.getState().tabs[0]!;

    store.getState().renameTab(before.id, "训练机 A");

    expect(store.getState().tabs[0]).toEqual(before);
  });

  it("renames the tab it was asked about, and only that one", () => {
    const store = workspaceStore();
    store.getState().openTab("alpha");
    store.getState().openTab("beta");
    const [alpha, beta] = shells(store);

    store.getState().renameTab(alpha!.id, "训练机 A");

    expect(shells(store).map((tab) => tab.customTitle)).toEqual(["训练机 A", null]);
    expect(beta!.ordinal).toBe(1);
  });
});

describe("panes and tab groups", () => {
  /** Two shells in one pane, then the second split to a pane of its own. */
  function twoPanes() {
    const store = workspaceStore();
    store.getState().openTab("alpha");
    store.getState().openTab("alpha");
    const second = shells(store)[1]!;
    const firstGroup = focusedGroup(store)!;
    store.getState().splitTabToGroup(second.id, firstGroup.id, "right");
    const [updatedFirst, updatedSecond] = shells(store);
    return { store, first: updatedFirst!, second: updatedSecond!, firstGroup };
  }

  it("keeps shells opened into the same pane in one group", () => {
    const store = workspaceStore();
    store.getState().openTab("alpha");
    store.getState().openTab("alpha");
    const [first, second] = shells(store);

    expect(Object.keys(store.getState().groups)).toHaveLength(1);
    const group = focusedGroup(store)!;
    expect(group.tabOrder).toEqual([first!.id, second!.id]);
    expect(group.activeTabId).toBe(second!.id);
    expect(second!.groupId).toBe(group.id);
  });

  it("splits a tab into a new group and keeps the source group", () => {
    const { store, first, second } = twoPanes();
    const layout = store.getState().groupLayouts.alpha!;
    const leaves = leafGroups(layout);

    expect(leaves).toHaveLength(2);
    expect(Object.keys(store.getState().groups)).toHaveLength(2);
    expect(store.getState().groups[leaves[0]!]!.tabOrder).toEqual([first.id]);
    expect(store.getState().groups[leaves[1]!]!.tabOrder).toEqual([second.id]);
    expect(focusedTabId(store)).toBe(second.id);
    expect(store.getState().tabs.find((tab) => tab.id === second.id)!.groupId).toBe(leaves[1]);
  });

  it("splits one tab out of a multi-tab group and keeps the rest", () => {
    const store = workspaceStore();
    store.getState().openTab("alpha");
    store.getState().openTab("alpha");
    store.getState().openTab("alpha");
    const [first, second, third] = shells(store);
    const group = focusedGroup(store)!;

    store.getState().splitTabToGroup(third!.id, group.id, "right");

    const leaves = leafGroups(store.getState().groupLayouts.alpha!);
    expect(leaves).toHaveLength(2);
    expect(store.getState().groups[leaves[0]!]!.tabOrder).toEqual([first!.id, second!.id]);
    expect(store.getState().groups[leaves[1]!]!.tabOrder).toEqual([third!.id]);
    // The source pane chose the previous active tab by MRU.
    expect(store.getState().groups[leaves[0]!]!.activeTabId).toBe(second!.id);
  });

  it("moves a tab into another group and makes it that group's active tab", () => {
    const store = workspaceStore();
    store.getState().openTab("alpha");
    store.getState().openTab("alpha");
    store.getState().openTab("alpha");
    const [first, second, third] = shells(store);
    const group = focusedGroup(store)!;
    store.getState().splitTabToGroup(third!.id, group.id, "right");
    const target = focusedGroup(store)!;

    store.getState().moveTabToGroup(first!.id, target.id, null);

    expect(store.getState().groups[target.id]!.tabOrder).toEqual([third!.id, first!.id]);
    expect(store.getState().groups[target.id]!.activeTabId).toBe(first!.id);
    expect(store.getState().groups[group.id]!.tabOrder).toEqual([second!.id]);
    expect(store.getState().tabs.find((tab) => tab.id === first!.id)!.groupId).toBe(target.id);
  });

  it("closing the active tab returns to the most recent tab", () => {
    const store = workspaceStore();
    store.getState().openTab("alpha");
    store.getState().openTab("alpha");
    store.getState().openTab("alpha");
    const [first, second, third] = shells(store);
    store.getState().focusTab(first!.id);
    store.getState().focusTab(second!.id);
    store.getState().focusTab(third!.id);

    store.getState().closeTab(third!.id);

    expect(focusedTabId(store)).toBe(second!.id);
    expect(focusedGroup(store)!.tabOrder).toEqual([first!.id, second!.id]);
  });

  it("closing a pane's last tab removes the pane and focuses its sibling", () => {
    const { store, first, second, firstGroup } = twoPanes();
    const secondGroup = focusedGroup(store)!;

    store.getState().closeTab(second.id);

    expect(store.getState().groups[secondGroup.id]).toBeUndefined();
    expect(leafGroups(store.getState().groupLayouts.alpha!)).toEqual([firstGroup.id]);
    expect(focusedGroup(store)!.id).toBe(firstGroup.id);
    expect(focusedTabId(store)).toBe(first.id);
    expect(store.getState().tabs).toHaveLength(1);
  });

  it("closing the last tab of the last pane releases the session", () => {
    const store = workspaceStore();
    store.getState().openTab("alpha");
    const [only] = shells(store);

    store.getState().closeTab(only!.id);

    expect(store.getState().groups).toEqual({});
    expect(store.getState().groupLayouts.alpha).toBeUndefined();
    expect(store.getState().focusedGroupBySession.alpha).toBeUndefined();
    expect(sshDisconnect).toHaveBeenCalledWith("alpha");
  });

  it("reorders only inside the group it was asked about", () => {
    const { store, first, second } = twoPanes();
    const firstGroup = store.getState().groups[first.groupId]!;

    store.getState().reorderTab(firstGroup.id, second.id, null);

    // The second tab is in another group; asking the first group to reorder it
    // must not silently move it across.
    expect(store.getState().groups[firstGroup.id]!.tabOrder).toEqual([first.id]);
    expect(store.getState().tabs.find((tab) => tab.id === second.id)!.groupId).toBe(
      second.groupId,
    );
  });

  it("reorders tabs within a group without changing its active tab", () => {
    const store = workspaceStore();
    store.getState().openTab("alpha");
    store.getState().openTab("alpha");
    const [first, second] = shells(store);
    const group = focusedGroup(store)!;

    store.getState().reorderTab(group.id, second!.id, first!.id);

    expect(store.getState().groups[group.id]!.tabOrder).toEqual([second!.id, first!.id]);
    expect(store.getState().groups[group.id]!.activeTabId).toBe(second!.id);
  });

  it("focuses a tab in another pane and remembers that pane", () => {
    const { store, first, second } = twoPanes();
    const firstGroup = store.getState().groups[first.groupId]!;

    store.getState().focusTab(first.id);

    expect(focusedGroup(store)!.id).toBe(firstGroup.id);
    expect(focusedTabId(store)).toBe(first.id);
    expect(store.getState().groups[second.groupId]!.activeTabId).toBe(second.id);
  });

  it("restores a session's focused pane when switching back", () => {
    const { store, second } = twoPanes();
    const focused = focusedGroup(store)!.id;
    store.getState().openTab("beta");

    store.getState().openSession("alpha");

    expect(focusedGroup(store)!.id).toBe(focused);
    expect(focusedTabId(store)).toBe(second.id);
  });

  it("does not let a reused tab id revive an old pane", () => {
    const { store, first, second } = twoPanes();
    store.getState().closeTab(second.id);

    store.getState().openTab("alpha");
    const reopened = shells(store).find((tab) => tab.id === second.id)!;

    expect(reopened.groupId).toBe(first.groupId);
    expect(Object.keys(store.getState().groups)).toHaveLength(1);
    expect(store.getState().groups[first.groupId]!.tabOrder).toEqual([first.id, reopened.id]);
  });

  it("drops a vanished session's groups, layout and focus entry", () => {
    const { store, first } = twoPanes();
    store.getState().openTab("beta");
    store.setState({ sessions: [named("beta")] });

    store.getState().pruneTabs();

    expect(Object.values(store.getState().groups).every((group) => group.session === "beta")).toBe(
      true,
    );
    expect(store.getState().groupLayouts.alpha).toBeUndefined();
    expect(store.getState().focusedGroupBySession.alpha).toBeUndefined();
    expect(store.getState().tabs.some((tab) => tab.id === first.id)).toBe(false);
  });

  it("brings a dirty tab's pane forward before asking about it", () => {
    const { store, first, second } = twoPanes();
    const secondGroup = store.getState().groups[second.groupId]!;
    store.getState().focusTab(first.id);
    store.getState().setTabDirty(second.id, true);

    store.getState().requestCloseTab(second.id);

    expect(focusedGroup(store)!.id).toBe(secondGroup.id);
    expect(focusedTabId(store)).toBe(second.id);
    expect(store.getState().pendingCloseTabId).toBe(second.id);
  });

  it("does not reset a split ratio when a one-tab pane is dropped on its sibling edge", () => {
    const { store, second } = twoPanes();
    const layout = store.getState().groupLayouts.alpha!;
    if (layout.kind !== "split") throw new Error("expected a split");
    store.getState().setGroupRatio("alpha", layout.id, 0.7);

    store.getState().splitTabToGroup(second.id, leafGroups(layout)[0]!, "right");

    const after = store.getState().groupLayouts.alpha!;
    if (after.kind !== "split") throw new Error("expected the split to stay");
    expect(after.ratio).toBe(0.7);
  });
});
