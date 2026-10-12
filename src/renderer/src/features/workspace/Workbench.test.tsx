/**
 * The workbench: one slot per session, one pane per shell, one browser per
 * session — and two levels of parking.
 *
 * Both levels are load-bearing. A session that is not selected leaves the
 * layout but keeps its shells; inside the selected session, the shell that is
 * not the shown tab does the same. Neither is visible to an end-to-end run,
 * which can only see that the shells answered.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n/i18n";
import type { TerminalTab } from "../../store/types";

const store = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("../../store", () => ({
  useAppStore: (select: (state: unknown) => unknown) => select(store.current),
}));

// The panes own xterm and a live SSH session; what the workbench decides — how
// many there are, and which one it marks as being on screen — is the subject.
vi.mock("./TerminalPane", async () => {
  const { createElement: h } = await import("react");
  return {
    TerminalPane: ({ session, active }: { session: string; active: boolean }) =>
      h("div", {
        className: "terminal-area",
        "data-session": session,
        "data-active": String(active),
      }),
  };
});
vi.mock("./FilePane", async () => {
  const { createElement: h } = await import("react");
  return {
    FilePane: ({ session }: { session: string }) =>
      h("div", { className: "files-panel", "data-session": session }),
  };
});

import { Workbench } from "./Workbench";

const noop = () => {};

/** A shell as the store stores it. */
const shell = (session: string, ordinal: number): TerminalTab => ({
  id: `${session}:${ordinal}`,
  session,
  ordinal,
});

const base = {
  tabs: [] as TerminalTab[],
  selectedSession: null as string | null,
  activeTabId: null as string | null,
  filesOpen: false,
  sessions: [] as unknown[],
  sidebarOpen: true,
  setRemotePath: noop,
  setTransferCount: noop,
  openTab: noop,
  openNewSession: noop,
  toggleSidebar: noop,
};

beforeEach(() => {
  store.current = { ...base };
});

const render = (): string => renderToStaticMarkup(createElement(Workbench));

/** The session slots, in the order their first shell was opened. */
const slots = (markup: string): string[] => markup.match(/<div class="work-slot"[^>]*>/g) ?? [];

describe("empty workbench", () => {
  it("names the next step when there is nothing to open", () => {
    expect(render()).toContain("新建一个运行时开始使用。");
  });

  it("points at the rail once sessions exist", () => {
    store.current = { ...base, sessions: [{}] };
    expect(render()).toContain("在左侧选择一个会话");
  });

  it("offers another shell when the selected session has none", () => {
    store.current = { ...base, sessions: [{}], selectedSession: "alpha" };

    const markup = render();

    expect(markup).toContain("「alpha」还没有终端。");
    expect(markup).toContain("新建终端");
  });
});

describe("open shells", () => {
  it("parks the sessions that are not selected, shells and all", () => {
    store.current = {
      ...base,
      tabs: [shell("alpha", 1), shell("beta", 1)],
      selectedSession: "alpha",
      activeTabId: "alpha:1",
    };

    const [alpha, beta] = slots(render());

    expect(alpha, "alpha 是选中的会话").not.toContain("hidden");
    expect(beta, "beta 停靠：离开布局").toContain("hidden");
    expect(beta, "beta 停靠：离开焦点顺序").toContain("inert");
  });

  it("gives every shell of the selected session a pane and shows one", () => {
    store.current = {
      ...base,
      tabs: [shell("alpha", 1), shell("alpha", 2)],
      selectedSession: "alpha",
      activeTabId: "alpha:2",
    };

    const panes = render().match(/<div class="terminal-area"[^>]*>/g) ?? [];

    // In tab order, both mounted, and the second one is the shell on screen.
    expect(panes).toHaveLength(2);
    expect(panes[0]).toContain('data-active="false"');
    expect(panes[1]).toContain('data-active="true"');
  });

  it("mounts one file browser per session, and none when the panel is collapsed", () => {
    const tabs = [shell("alpha", 1), shell("beta", 1)];
    store.current = { ...base, tabs, selectedSession: "alpha", filesOpen: true };
    const withPanel = render();
    expect(withPanel.match(/class="files-panel"/g)).toHaveLength(2);
    // Both sessions keep a tab of their own in the DOM; only one is on screen.
    expect(withPanel).toContain('data-session="alpha"');
    expect(withPanel).toContain('data-session="beta"');

    store.current = { ...base, tabs, selectedSession: "alpha", filesOpen: false };
    expect(render()).not.toContain("files-panel");
  });
});
