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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setRendererUiLanguage } from "../../i18n/i18n";

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
  env: null as { authenticated: boolean } | null,
  openTab: noop,
  openNewSession: noop,
  toggleSidebar: noop,
  refreshEnvironment: async () => true,
  loginRunning: false,
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

describe("nobody is signed in yet", () => {
  beforeEach(() => {
    store.current = { ...base, env: { authenticated: false } };
  });

  it("the front door's one action is signing in", () => {
    const markup = render();

    // The panel's own button, in the slot the new-session button would occupy —
    // and still exactly one affirmative action on the screen.
    expect(markup).toContain("授权登录 Google 账号");
    expect(markup).not.toContain("新建会话");
    expect(markup.match(/btn--primary/g)).toHaveLength(1);
    // A column of its own, so the button is centred with the page and not at
    // the left edge of a form that inherited the column's width.
    expect(markup).toContain("startpage__signin");
  });

  it("没登录时不提供「展开会话栏」——那条栏根本不在", () => {
    store.current = { ...base, env: { authenticated: false }, sidebarOpen: false, sessions: [{}] };
    expect(render()).not.toContain("展开会话栏");
  });

  it("says why, instead of offering a create that can only fail", () => {
    expect(text(render())).toContain("先登录 Google 账号，才能创建运行时。");
  });

  it("未知登录状态不冒充未登录", () => {
    // `null` is "not read yet"; guessing either way would flash the wrong action.
    store.current = { ...base, env: null };
    expect(render()).toContain("新建会话");
    expect(text(render())).not.toContain("先登录 Google 账号");
  });
});

describe("in English", () => {
  afterEach(async () => {
    await setRendererUiLanguage("zh");
  });

  /** Every string here is passed with a Chinese default: a key missing from
      en.json degrades to Chinese silently, and this is what notices. */
  const noChinese = (markup: string): void => {
    expect(text(markup)).not.toMatch(/[一-鿿]/);
  };

  it("正门不出现中文", async () => {
    await setRendererUiLanguage("en");
    noChinese(render());
  });

  it("中途停顿的那一屏也不出现中文", async () => {
    store.current = { ...base, selectedSession: "alpha", sessions: [{}] };
    await setRendererUiLanguage("en");
    noChinese(render());
  });

  it("还没登录的那一屏也不出现中文", async () => {
    store.current = { ...base, env: { authenticated: false } };
    await setRendererUiLanguage("en");
    noChinese(render());
  });
});

describe("while the sign-in flow is running", () => {
  beforeEach(() => {
    store.current = { ...base, env: { authenticated: false }, loginRunning: true };
  });

  it("keeps the brand and the step, and nothing that is selling", () => {
    const markup = render();
    const body = text(markup);

    // The lockup is the anchor of the screen, not an argument on it.
    expect(markup).toContain('aria-label="ColabDesk"');
    expect(markup).toContain("startpage__signin");
    // The claim, the capability lines and the ask belong to somebody deciding
    // whether to use the app, not to somebody in the middle of signing in.
    expect(body).not.toContain("Google Colab 运行时的桌面 SSH 控制台");
    expect(body).not.toContain("申请 GPU 运行时");
    expect(body).not.toContain("在 GitHub 上点个 Star");
  });

  it("流程结束后那一屏恢复", () => {
    store.current = { ...base, env: { authenticated: false }, loginRunning: false };
    expect(text(render())).toContain("申请 GPU 运行时");
    expect(text(render())).toContain("在 GitHub 上点个 Star");
  });
});
