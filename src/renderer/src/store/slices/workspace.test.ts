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
    expect(store.getState().activeTabId).toBe(second!.id);

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
    expect(store.getState().activeTabId).toBe(store.getState().tabs[0]!.id);
  });

  it("focuses the nth shell of the selected session", () => {
    const store = workspaceStore();
    store.getState().openTab("alpha");
    store.getState().openTab("alpha");
    store.getState().openTab("beta");

    store.getState().focusTabAt(0);

    expect(store.getState().activeTabId).toBe(
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
    expect(store.getState().activeTabId).toBe(files[0]!.id);
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
    expect(store.getState().activeTabId).toBe(file.id);
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
    expect(store.getState().activeTabId).toBe(store.getState().tabs[0]!.id);
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
    expect(store.getState().activeTabId).toBeNull();
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
});
