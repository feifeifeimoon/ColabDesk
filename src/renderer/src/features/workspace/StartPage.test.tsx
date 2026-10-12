/**
 * The rules of the front door, as markup.
 *
 * The empty state's rule is already asserted for the workbench as a whole; what
 * is new here is the brand and the ask — that the name is a drawing rather than
 * type, that the screen offers one affirmative action and not two, and that a
 * reader who is mid-task (a session open, just no shell yet) is not sold to.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n/i18n";

const store = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("../../store", () => ({
  useAppStore: (select: (state: unknown) => unknown) => select(store.current),
}));

import { StartPage } from "./StartPage";

const noop = () => {};

const base = {
  selectedSession: null as string | null,
  sessions: [] as unknown[],
  sidebarOpen: true,
  openTab: noop,
  openNewSession: noop,
  toggleSidebar: noop,
};

beforeEach(() => {
  store.current = { ...base };
});

const render = (): string => renderToStaticMarkup(createElement(StartPage));

/** What a reader would hear, with the markup taken away. */
const text = (markup: string): string => markup.replace(/<[^>]*>/g, "");

describe("the launch screen", () => {
  it("draws the name instead of setting it in type", () => {
    const markup = render();

    // The wordmark is the identity kit's outline drawing, and the kit's rule is
    // that it is not live type — however close the bundled Geist gets.
    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="ColabDesk"');
    expect(text(markup)).not.toContain("ColabDesk");
  });

  it("offers exactly one affirmative action", () => {
    expect(render().match(/btn--primary/g)).toHaveLength(1);
  });

  it("asks for a star without competing with the action", () => {
    const markup = render();
    const star = markup.match(/<button[^>]*data-testid="star-on-github"[^>]*>/)?.[0] ?? "";

    expect(star, "起始页上没有 star 的入口").not.toBe("");
    // Where the button goes is `lib/star-prompt`'s to say; what it may not do is
    // dress as the affirmative action, which is the new-session button's.
    expect(star, "请求支持不是这一屏的肯定动作").not.toContain("btn--primary");
    expect(text(markup)).toContain("在 GitHub 上点个 Star");
  });
});

describe("a session that has no shell yet", () => {
  beforeEach(() => {
    store.current = { ...base, selectedSession: "alpha", sessions: [{}] };
  });

  it("names the next step and holds the brand story back", () => {
    const markup = render();

    expect(text(markup)).toContain("「alpha」还没有终端。");
    expect(markup).toContain("新建终端");
    expect(markup, "中途停顿的人是来要终端的，不是来听品牌的").not.toContain('aria-label="ColabDesk"');
    expect(markup, "已经进来的人不该再被要一次 star").not.toContain("star-on-github");
  });
});
