/**
 * A pane's own tab strip, rendered as markup.
 *
 * A tab has two names in the accessibility tree: what it says and what its
 * close button says. A renamed tab that still announces "关闭终端 1" is a tab
 * with two names, and that is exactly the kind of thing a review walks past —
 * so it is held here instead. The other rule is why a rename is stored as an
 * override rather than as text: the derived name is translated, so a name the
 * user typed has to survive a language switch while the default one follows it.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setRendererUiLanguage } from "../../i18n/i18n";
import type { TabGroup } from "../../lib/tab-groups";
import type { FileTab, TerminalTab, WorkspaceTab } from "../../store/types";

const store = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("../../store", () => ({
  useAppStore: (select: (state: unknown) => unknown) => select(store.current),
}));

vi.mock("@dnd-kit/core", () => ({
  useDraggable: () => ({ setNodeRef: () => {}, listeners: undefined, isDragging: false }),
}));

import { GroupStrip } from "./GroupStrip";

const noop = () => {};

const shell = (customTitle: string | null, id = "alpha:1", ordinal = 1): TerminalTab => ({
  kind: "shell",
  id,
  session: "alpha",
  groupId: "alpha:group:1",
  ordinal,
  customTitle,
});

const file: FileTab = {
  kind: "file",
  id: "alpha:file:/content/train.log",
  session: "alpha",
  groupId: "alpha:group:1",
  path: "/content/train.log",
  name: "train.log",
};

const group = (tabs: WorkspaceTab[], activeTabId = tabs[0]?.id ?? ""): TabGroup => ({
  id: "alpha:group:1",
  session: "alpha",
  tabOrder: tabs.map((tab) => tab.id),
  activeTabId,
  recentTabIds: tabs.map((tab) => tab.id),
});

function render(tabs: WorkspaceTab[], extra: Record<string, unknown> = {}): string {
  store.current = {
    dirtyTabs: {},
    renameTab: noop,
    requestCloseTab: noop,
    openTab: noop,
    focusGroup: noop,
    ...extra,
  };
  return renderToStaticMarkup(
    createElement(GroupStrip, {
      group: group(tabs, (extra.activeTabId as string | undefined) ?? tabs[0]?.id),
      tabs,
      index: 1,
      focused: true,
      style: {},
      visible: true,
    }),
  );
}

beforeEach(async () => {
  await setRendererUiLanguage("zh");
});

describe("a pane's tab strip", () => {
  it("names a shell that was never renamed after its number", () => {
    const markup = render([shell(null)]);

    expect(markup).toContain("终端 1");
    expect(markup).toContain('aria-label="关闭终端 1"');
  });

  it("shows the name a shell was given, and closes it by that name", () => {
    const markup = render([shell("训练机 A")]);

    expect(markup).toContain("训练机 A");
    expect(markup).toContain('aria-label="关闭 训练机 A"');
    expect(markup).not.toContain("关闭终端 1");
  });

  it("keeps the given name through a language switch, while the default follows", async () => {
    const named = render([
      shell("训练机 A"),
      shell(null, "alpha:2", 2),
    ]);
    expect(named).toContain("训练机 A");
    expect(named).toContain("终端 2");

    await setRendererUiLanguage("en");
    const english = render([shell("训练机 A"), shell(null, "alpha:2", 2)]);

    // The name the user typed is not a sentence in either language.
    expect(english).toContain("训练机 A");
    expect(english).toContain("Terminal 2");
  });

  it("still names a file tab after the file, with the path in the tooltip", () => {
    const markup = render([file]);

    expect(markup).toContain("train.log");
    expect(markup).toContain('title="/content/train.log"');
    expect(markup).toContain('aria-label="关闭 train.log"');
  });

  it("renders its English surface without Chinese fallbacks", async () => {
    await setRendererUiLanguage("en");
    const markup = render([shell(null), file]);

    expect(markup).toContain("Terminal 1");
    expect(markup).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it("marks the active tab and keeps the group's focus marker", () => {
    const markup = render([shell(null), shell(null, "alpha:2", 2)], {
      activeTabId: "alpha:2",
    });

    expect(markup).toContain('aria-selected="false"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('data-focused="true"');
  });

  it("names the strip for assistive technology and puts + in this pane", () => {
    const markup = render([shell(null)]);

    expect(markup).toContain('aria-label="面板 1 标签"');
    expect(markup).toContain('data-testid="new-terminal"');
    expect(markup).toContain('aria-label="在此面板新建终端"');
  });

  it("renders nothing for a parked session", () => {
    store.current = {
      dirtyTabs: {},
      renameTab: noop,
      requestCloseTab: noop,
      openTab: noop,
      focusGroup: noop,
    };
    const markup = renderToStaticMarkup(
      createElement(GroupStrip, {
        group: group([shell(null)]),
        tabs: [shell(null)],
        index: 1,
        focused: false,
        style: {},
        visible: false,
      }),
    );

    expect(markup).toBe("");
  });
});
