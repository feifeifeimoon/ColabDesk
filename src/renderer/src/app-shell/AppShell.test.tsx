/**
 * The tab strip, rendered as markup.
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
import { setRendererUiLanguage } from "../i18n/i18n";
import type { FileTab, TerminalTab, WorkspaceTab } from "../store/types";

const store = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("../store", () => ({
  useAppStore: (select: (state: unknown) => unknown) => select(store.current),
}));

import { TopBar } from "./AppShell";

const noop = () => {};

/** A shell as the store stores it, with the name it was given (or none). */
const shell = (customTitle: string | null): TerminalTab => ({
  kind: "shell",
  id: "alpha:1",
  session: "alpha",
  ordinal: 1,
  customTitle,
});

const file: FileTab = {
  kind: "file",
  id: "alpha:file:/content/train.log",
  session: "alpha",
  path: "/content/train.log",
  name: "train.log",
};

function render(tabs: WorkspaceTab[]): string {
  store.current = {
    sidebarOpen: true,
    filesOpen: true,
    settingsOpen: false,
    tabs,
    selectedSession: "alpha",
    activeTabId: tabs[0]?.id ?? null,
    dirtyTabs: {},
    toggleSidebar: noop,
    toggleFiles: noop,
    openTab: noop,
    requestCloseTab: noop,
    focusTab: noop,
    renameTab: noop,
  };
  return renderToStaticMarkup(createElement(TopBar));
}

beforeEach(async () => {
  await setRendererUiLanguage("zh");
});

describe("the tab strip", () => {
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
    const named = render([shell("训练机 A"), { ...shell(null), id: "alpha:2", ordinal: 2 }]);
    expect(named).toContain("训练机 A");
    expect(named).toContain("终端 2");

    await setRendererUiLanguage("en");
    const english = render([shell("训练机 A"), { ...shell(null), id: "alpha:2", ordinal: 2 }]);

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
});
