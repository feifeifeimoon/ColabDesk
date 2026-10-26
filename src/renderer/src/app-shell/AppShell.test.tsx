/**
 * The window bar, rendered as markup.
 *
 * Tabs live in their panes now, so the bar has two jobs: brand + rail toggle on
 * the left, files + window controls on the right, and an empty drag region in
 * the middle. The tab naming/close rules moved to `GroupStrip.test.tsx` with the
 * strip itself.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setRendererUiLanguage } from "../i18n/i18n";
import type { TerminalTab } from "../store/types";

const store = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("../store", () => ({
  useAppStore: (select: (state: unknown) => unknown) => select(store.current),
}));

import { MAC_INSET } from "../lib/platform";
import { TopBar } from "./AppShell";

const noop = () => {};

const shell: TerminalTab = {
  kind: "shell",
  id: "alpha:1",
  session: "alpha",
  groupId: "alpha:group:1",
  ordinal: 1,
  customTitle: null,
};

function render(extra: Record<string, unknown> = {}): string {
  store.current = {
    sidebarOpen: true,
    filesOpen: true,
    settingsOpen: false,
    creation: { open: false },
    env: null,
    tabs: [shell],
    selectedSession: "alpha",
    toggleSidebar: noop,
    toggleFiles: noop,
    openSettings: noop,
    ...extra,
  };
  return renderToStaticMarkup(createElement(TopBar));
}

/** The bar's left section, where the rail toggle and its stand-ins live. */
function leftSection(markup: string): string {
  return markup.slice(markup.indexOf('class="topbar__side"'), markup.indexOf('class="topbar__middle"'));
}

beforeEach(async () => {
  await setRendererUiLanguage("zh");
});

describe("the window bar", () => {
  it("keeps the middle empty: tabs belong to their panes", () => {
    const markup = render();

    expect(markup).toContain('data-testid="topbar-middle"');
    expect(markup).not.toContain('role="tablist"');
    expect(markup).not.toContain("终端 1");
    expect(markup).not.toContain('data-testid="new-terminal"');
    // The session name is not a title-bar label: the rail already names it.
    expect(markup).not.toContain("alpha");
  });

  it("文件面板的开关和接缝只对看得见的工作台出现", () => {
    for (const covered of [{}, { settingsOpen: true }, { creation: { open: true } }]) {
      const markup = render(covered);
      const visible = Object.keys(covered).length === 0;
      expect(markup.includes('data-testid="toggle-files"')).toBe(visible);
      expect(markup.includes('data-testid="seam-files"')).toBe(visible);
    }
  });
});

describe("the bar's left section", () => {
  it("signed in: the rail toggle, and no settings entry (the rail's foot has it)", () => {
    const side = leftSection(render());
    expect(side).toContain('data-testid="toggle-sidebar"');
    expect(side).not.toContain('data-testid="open-settings"');
  });

  it("signed out: the way into settings, because the rail's foot is not on screen", () => {
    // Settings is where the language is chosen, and the rail that used to carry
    // the gear is not drawn while nobody is signed in.
    const side = leftSection(render({ tabs: [], selectedSession: null, env: { authenticated: false } }));
    expect(side).toContain('data-testid="open-settings"');
    expect(side).toContain('aria-label="设置"');
    expect(side).not.toContain('data-testid="toggle-sidebar"');
    // No seam is drawn either: there is no rail column for it to land on.
    expect(side).toContain('data-rail="closed"');
  });

  it("两处入口从不同时出现", () => {
    for (const authenticated of [true, false]) {
      const side = leftSection(render({ env: { authenticated } }));
      const count = (side.match(/data-testid="(toggle-sidebar|open-settings)"/g) ?? []).length;
      expect(count).toBe(1);
    }
  });

  it("compensates the macOS traffic-light inset for page zoom", () => {
    expect(MAC_INSET).toBe("calc(78px / var(--ui-zoom-factor, 1))");
  });
});
