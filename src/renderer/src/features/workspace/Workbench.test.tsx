/**
 * The workbench: one slot per session, one pane surface per session, one file
 * browser per session — and three levels of parking (session, group, tab).
 *
 * All three levels are load-bearing. A session that is not selected leaves the
 * layout but keeps its panes and tabs; inside a session, the tabs that are not
 * their group's active one do the same. None is visible to an end-to-end run,
 * which can only see that the shells answered.
 *
 * The pane surface itself is tested in `PaneSurface.test.tsx`; this file is
 * about the session slots around it.
 */

import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n/i18n";
import type { TerminalTab, WorkspaceTab } from "../../store/types";

const store = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("../../store", () => ({
  useAppStore: (select: (state: unknown) => unknown) => select(store.current),
}));

// The pane surface owns dnd-kit and the tab strips; what the workbench decides
// is which sessions are on screen and what parks with them.
vi.mock("./PaneSurface", async () => {
  const { createElement: h } = await import("react");
  return {
    PaneSurface: ({
      session,
      shown,
      layout,
    }: {
      session: string;
      shown: boolean;
      layout: unknown;
    }) =>
      h("div", {
        className: "pane-surface",
        "data-session": session,
        "data-shown": String(shown),
        "data-has-layout": String(Boolean(layout)),
      }),
  };
});

vi.mock("./tab-drag/TabDragProvider", async () => {
  const { createElement: h } = await import("react");
  return {
    TabDragProvider: ({ children }: { children: ReactNode }) => h("div", null, children),
  };
});

vi.mock("./FilePane", async () => {
  const { createElement: h } = await import("react");
  return {
    FilePane: ({ session, visible }: { session: string; visible: boolean }) =>
      h("div", {
        className: "files-panel",
        "data-session": session,
        // The pane is parked when hidden, so which of the two it is has to be
        // visible to the test that says so.
        hidden: !visible,
      }),
  };
});

import { Workbench } from "./Workbench";

const noop = () => {};

/** A shell as the store stores it. */
const shell = (session: string, ordinal: number): TerminalTab => ({
  kind: "shell",
  id: `${session}:${ordinal}`,
  session,
  groupId: `${session}:group:1`,
  ordinal,
  customTitle: null,
});

/** A file tab: the same strip, the other kind. */
const file = (session: string, path: string): WorkspaceTab => ({
  kind: "file",
  id: `${session}:file:${path}`,
  session,
  groupId: `${session}:group:1`,
  path,
  name: path.slice(path.lastIndexOf("/") + 1),
});

const group = (session: string, tabOrder: string[], activeTabId: string) => ({
  id: `${session}:group:1`,
  session,
  tabOrder,
  activeTabId,
  recentTabIds: tabOrder,
});

const leaf = (session: string) => ({
  kind: "leaf" as const,
  id: `leaf:${session}:group:1`,
  groupId: `${session}:group:1`,
});

const base = {
  tabs: [] as WorkspaceTab[],
  groups: {} as Record<string, ReturnType<typeof group>>,
  groupLayouts: {} as Record<string, ReturnType<typeof leaf>>,
  focusedGroupBySession: {} as Record<string, string>,
  selectedSession: null as string | null,
  filesOpen: false,
  sessions: [] as unknown[],
  sidebarOpen: true,
  setRemotePath: noop,
  setTransferCount: noop,
  openTab: noop,
  openNewSession: noop,
  toggleSidebar: noop,
  // The setup console is a middle-column state; closed unless a test opens it.
  creation: { open: false, phase: "setup", request: null, startedAt: null, lines: [], error: null },
};

beforeEach(() => {
  store.current = { ...base };
});

const render = (): string => renderToStaticMarkup(createElement(Workbench));

/** The session slots, in the order their first shell was opened. */
const slots = (markup: string): string[] => markup.match(/<div class="work-slot"[^>]*>/g) ?? [];

/** The pane surfaces, in the same order. */
const surfaces = (markup: string): string[] =>
  markup.match(/<div class="pane-surface"[^>]*>/g) ?? [];

describe("empty workbench", () => {
  it("names the next step when there is nothing to open", () => {
    expect(render()).toContain("新建一个运行时开始使用。");
  });

  it("points at the rail once sessions exist", () => {
    store.current = { ...base, sessions: [{}] };
    expect(render()).toContain("选一个会话");
  });

  it("offers another shell when the selected session has none", () => {
    store.current = { ...base, sessions: [{}], selectedSession: "alpha" };

    const markup = render();

    expect(markup).toContain("「alpha」还没有终端。");
    expect(markup).toContain("新建终端");
  });
});

describe("session slots", () => {
  it("parks the sessions that are not selected, panes and all", () => {
    const alphaTab = shell("alpha", 1);
    const betaTab = shell("beta", 1);
    store.current = {
      ...base,
      tabs: [alphaTab, betaTab],
      groups: {
        "alpha:group:1": group("alpha", [alphaTab.id], alphaTab.id),
        "beta:group:1": group("beta", [betaTab.id], betaTab.id),
      },
      groupLayouts: { alpha: leaf("alpha"), beta: leaf("beta") },
      focusedGroupBySession: { alpha: "alpha:group:1", beta: "beta:group:1" },
      selectedSession: "alpha",
    };

    const [alpha, beta] = slots(render());

    expect(alpha, "alpha 是选中的会话").not.toContain("hidden");
    expect(beta, "beta 停靠：离开布局").toContain("hidden");
    expect(beta, "beta 停靠：离开焦点顺序").toContain("inert");
  });

  it("gives every session with tabs its own pane surface and layout", () => {
    const alphaTab = shell("alpha", 1);
    const betaTab = shell("beta", 1);
    store.current = {
      ...base,
      tabs: [alphaTab, betaTab],
      groups: {
        "alpha:group:1": group("alpha", [alphaTab.id], alphaTab.id),
        "beta:group:1": group("beta", [betaTab.id], betaTab.id),
      },
      groupLayouts: { alpha: leaf("alpha"), beta: leaf("beta") },
      focusedGroupBySession: { alpha: "alpha:group:1", beta: "beta:group:1" },
      selectedSession: "alpha",
    };

    const panes = surfaces(render());

    expect(panes).toHaveLength(2);
    expect(panes[0]).toContain('data-session="alpha"');
    expect(panes[0]).toContain('data-shown="true"');
    expect(panes[0]).toContain('data-has-layout="true"');
    expect(panes[1]).toContain('data-session="beta"');
    expect(panes[1]).toContain('data-shown="false"');
  });

  it("keeps one file browser per session, parked rather than unmounted when hidden", () => {
    const tabs = [shell("alpha", 1), shell("beta", 1)];
    store.current = {
      ...base,
      tabs,
      groups: {
        "alpha:group:1": group("alpha", [tabs[0]!.id], tabs[0]!.id),
        "beta:group:1": group("beta", [tabs[1]!.id], tabs[1]!.id),
      },
      groupLayouts: { alpha: leaf("alpha"), beta: leaf("beta") },
      focusedGroupBySession: { alpha: "alpha:group:1", beta: "beta:group:1" },
      selectedSession: "alpha",
      filesOpen: true,
    };
    const withPanel = render();
    expect(withPanel.match(/class="files-panel"/g)).toHaveLength(2);
    // Both sessions keep a tab of their own in the DOM; only one is on screen.
    expect(withPanel).toContain('data-session="alpha"');
    expect(withPanel).toContain('data-session="beta"');

    // Collapsing the panel hides the tree instead of folding it: the shape it
    // was left in, and the listings behind it, have to survive — so the pane is
    // still in the document, hidden and inert rather than gone.
    store.current = { ...store.current, filesOpen: false };
    const hidden = render();
    expect(hidden.match(/class="files-panel"/g)).toHaveLength(2);
    expect(hidden.match(/<div class="files-panel"[^>]*>/g)?.[0]).toContain("hidden");
  });

  it("keeps a file tab a tab: it does not get a pane of its own", () => {
    const trainLog = file("alpha", "/content/train.log");
    const alphaShell = shell("alpha", 1);
    store.current = {
      ...base,
      tabs: [alphaShell, trainLog],
      groups: { "alpha:group:1": group("alpha", [alphaShell.id, trainLog.id], trainLog.id) },
      groupLayouts: { alpha: leaf("alpha") },
      focusedGroupBySession: { alpha: "alpha:group:1" },
      selectedSession: "alpha",
    };

    const markup = render();
    expect(surfaces(markup)).toHaveLength(1);
    // It is the group's active tab, so the surface — not the workbench — shows
    // it; the workbench only sees one session slot.
    expect(markup.match(/class="files-panel"/g)).toHaveLength(1);
  });
});
