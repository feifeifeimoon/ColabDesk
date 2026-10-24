/**
 * The pane surface, rendered as markup: every tab stays a direct child of one
 * surface, only a group's active tab is in the layout, and the split tree is
 * visible as strips and dividers. Moving a tab between groups must never change
 * its parent — that is what keeps its xterm and SSH channel alive.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n/i18n";
import type { GroupLayout, TabGroup } from "../../lib/tab-groups";
import type { TerminalTab, WorkspaceTab } from "../../store/types";

const store = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("../../store", () => ({
  useAppStore: (select: (state: unknown) => unknown) => select(store.current),
}));

vi.mock("./GroupStrip", async () => {
  const { createElement: h } = await import("react");
  return {
    GroupStrip: ({
      group,
      tabs,
      focused,
      index,
      titlebar,
      leading,
      trailing,
    }: {
      group: TabGroup;
      tabs: WorkspaceTab[];
      focused: boolean;
      index: number;
      titlebar?: boolean;
      leading?: boolean;
      trailing?: string;
    }) =>
      h("div", {
        className: "group-strip",
        "data-group-id": group.id,
        "data-focused": String(focused),
        "data-tabs": tabs.map((tab) => tab.id).join(","),
        "data-index": String(index),
        "data-titlebar": titlebar ? "true" : undefined,
        "data-leading": leading ? "true" : undefined,
        "data-trailing": trailing,
      }),
  };
});

vi.mock("./TerminalPane", async () => {
  const { createElement: h } = await import("react");
  return {
    TerminalPane: ({
      session,
      visible,
      focused,
    }: {
      session: string;
      visible: boolean;
      focused: boolean;
    }) =>
      h("div", {
        className: "terminal-area",
        "data-session": session,
        "data-visible": String(visible),
        "data-focused": String(focused),
      }),
  };
});

vi.mock("./FileView", async () => {
  const { createElement: h } = await import("react");
  return {
    FileView: ({ visible }: { visible: boolean }) =>
      h("div", { className: "file-area", "data-visible": String(visible) }),
  };
});

import { PaneSurface } from "./PaneSurface";

const noop = () => {};

const shell = (session: string, ordinal: number, groupId: string): TerminalTab => ({
  kind: "shell",
  id: `${session}:${ordinal}`,
  session,
  groupId,
  ordinal,
  customTitle: null,
});

const file = (session: string, groupId: string, path: string): WorkspaceTab => ({
  kind: "file",
  id: `${session}:file:${path}`,
  session,
  groupId,
  path,
  name: path.slice(path.lastIndexOf("/") + 1),
});

const group = (id: string, tabOrder: string[], activeTabId: string): TabGroup => ({
  id,
  session: "alpha",
  tabOrder,
  activeTabId,
  recentTabIds: tabOrder,
});

const leaf = (id: string): GroupLayout => ({ kind: "leaf", id: `leaf:${id}`, groupId: id });

const split = (first: GroupLayout, second: GroupLayout): GroupLayout => ({
  kind: "split",
  id: "split:1",
  direction: "row",
  ratio: 0.5,
  first,
  second,
});

const base = {
  focusGroup: noop,
  setGroupRatio: noop,
  settingsOpen: false,
  creation: { open: false },
  sidebarOpen: true,
  filesOpen: true,
  selectedSession: "alpha" as string | null,
  tabs: [] as WorkspaceTab[],
};

beforeEach(() => {
  store.current = { ...base };
});

function render({
  tabs,
  groups,
  layout,
  focusedGroupId,
  shown = true,
  sidebarOpen = true,
  filesOpen = true,
}: {
  tabs: WorkspaceTab[];
  groups: Record<string, TabGroup>;
  layout: GroupLayout;
  focusedGroupId?: string;
  shown?: boolean;
  sidebarOpen?: boolean;
  filesOpen?: boolean;
}): string {
  store.current = {
    ...base,
    tabs,
    selectedSession: "alpha",
    sidebarOpen,
    filesOpen,
  };
  return renderToStaticMarkup(
    createElement(PaneSurface, {
      session: "alpha",
      tabs,
      groups,
      layout,
      focusedGroupId,
      shown,
    }),
  );
}

const slots = (markup: string): string[] =>
  markup.match(/<div class="pane-slot"[^>]*>/g) ?? [];

describe("two panes", () => {
  const a1 = shell("alpha", 1, "a");
  const a2 = shell("alpha", 2, "a");
  const b1 = shell("alpha", 3, "b");
  const tabs = [a1, a2, b1];
  const groups = {
    a: group("a", [a1.id, a2.id], a2.id),
    b: group("b", [b1.id], b1.id),
  };
  const layout = split(leaf("a"), leaf("b"));

  it("keeps every tab mounted in one surface", () => {
    expect(slots(render({ tabs, groups, layout, focusedGroupId: "b" }))).toHaveLength(3);
  });

  it("shows only each group's active tab", () => {
    const markup = render({ tabs, groups, layout, focusedGroupId: "b" });
    const rendered = slots(markup);
    const byTab = (id: string) => rendered.find((slot) => slot.includes(`data-tab-id="${id}"`))!;
    const panes = markup.match(/<div class="terminal-area"[^>]*>/g) ?? [];

    expect(byTab(a1.id)).toContain("hidden");
    expect(byTab(a1.id)).toContain("inert");
    expect(byTab(a2.id)).not.toContain("hidden");
    expect(byTab(b1.id)).not.toContain("hidden");

    // In tab order: alpha:1, alpha:2, alpha:3.
    expect(panes[0]).toContain('data-visible="false"');
    expect(panes[0]).toContain('data-focused="false"');
    expect(panes[1]).toContain('data-visible="true"');
    expect(panes[1]).toContain('data-focused="false"');
    expect(panes[2]).toContain('data-visible="true"');
    expect(panes[2]).toContain('data-focused="true"');
  });

  it("renders one strip per group, in visual order, with the focus marker", () => {
    const strips = render({ tabs, groups, layout, focusedGroupId: "b" }).match(
      /<div class="group-strip"[^>]*>/g,
    );

    expect(strips).toHaveLength(2);
    expect(strips![0]).toContain('data-group-id="a"');
    expect(strips![0]).toContain('data-index="1"');
    expect(strips![1]).toContain('data-group-id="b"');
    expect(strips![1]).toContain('data-focused="true"');
  });

  it("gives the top row the titlebar and puts the collapsed rail in the first strip", () => {
    const strips = render({
      tabs,
      groups,
      layout,
      focusedGroupId: "b",
      sidebarOpen: false,
      filesOpen: false,
    }).match(/<div class="group-strip"[^>]*>/g);

    expect(strips![0]).toContain('data-titlebar="true"');
    expect(strips![0]).toContain('data-leading="true"');
    expect(strips![1]).toContain('data-titlebar="true"');
    expect(strips![1]).not.toContain('data-leading="true"');
    // The rightmost top strip reserves room for the files toggle and controls.
    expect(strips![1]).toContain("data-trailing=");
  });

  it("renders one divider for the split", () => {
    const markup = render({ tabs, groups, layout, focusedGroupId: "b" });
    expect(markup.match(/class="pane-divider"/g)).toHaveLength(1);
    expect(markup).toContain('data-split-id="split:1"');
  });

  it("positions the active slots and their strips by the split ratio", () => {
    const rendered = slots(render({ tabs, groups, layout, focusedGroupId: "b" }));
    const a2Slot = rendered.find((slot) => slot.includes(`data-tab-id="${a2.id}"`))!;
    const b1Slot = rendered.find((slot) => slot.includes(`data-tab-id="${b1.id}"`))!;

    expect(a2Slot).toContain("width:50%");
    expect(b1Slot).toContain("left:50%");
    expect(b1Slot).toContain("width:50%");
  });

  it("marks a file pane with the app tone and a shell pane with the terminal tone", () => {
    const log = file("alpha", "b", "/content/train.log");
    const renderTabs = [a1, a2, log];
    const renderGroups = { ...groups, b: group("b", [log.id], log.id) };
    const markup = render({ tabs: renderTabs, groups: renderGroups, layout, focusedGroupId: "b" });

    expect(markup).toMatch(/data-tab-id="alpha:1"[^>]*data-tone="terminal"/);
    expect(markup).toContain('data-tone="app"');
    expect(markup).toContain('class="file-area"');
  });
});

describe("a single pane", () => {
  const only = shell("alpha", 1, "a");
  const tabs = [only];
  const groups = { a: group("a", [only.id], only.id) };
  const layout = leaf("a");

  it("renders no divider", () => {
    const markup = render({ tabs, groups, layout, focusedGroupId: "a" });
    expect(markup.match(/class="pane-divider"/g) ?? []).toHaveLength(0);
  });

  it("parks every slot when the session is not on screen, and renders no strips", () => {
    const markup = render({ tabs, groups, layout, focusedGroupId: "a", shown: false });
    const [slot] = slots(markup);

    expect(slot).toContain("hidden");
    expect(slot).toContain("inert");
    expect(markup).not.toContain('class="group-strip"');
    expect(markup).not.toContain('class="pane-divider"');
  });
});
