/**
 * Assertions on the left rail: sessions list, untracked runtimes, sync state,
 * and the refreshing overlay.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setRendererUiLanguage } from "../i18n/i18n";
import { Sidebar } from "./Sidebar";

const store = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("../store", () => ({
  useAppStore: (select: (state: unknown) => unknown) => select(store.current),
}));

const UNTRACKED = {
  name: "m-s-kkb-usc1c1-1ysqo4pb8zt5n",
  untracked: true,
  endpoint: "m-s-kkb-usc1c1-1ysqo4pb8zt5n",
  accelerator: "NONE",
};

const baseStore = {
  sidebarOpen: true,
  panelWidths: { sidebar: 260, files: 340 },
  setPanelWidth: vi.fn(),
  sessions: [{ name: "session-1", endpoint: "127.0.0.1" }],
  sessionsLoading: false,
  sessionsSyncing: false,
  untrackedSessions: [] as unknown[],
  untrackedError: null as string | null,
  runtimeEndpoints: null as string[] | null,
  previousAccount: null as string | null,
  env: null as { authenticated: boolean } | null,
  selectedSession: null,
  tabs: [],
  settingsOpen: false,
  creation: { open: false },
  connections: {},
  usage: null,
  busyAction: null,
  runSessionAction: vi.fn(),
  syncSessions: vi.fn(),
  openNewSession: vi.fn(),
  openSettings: vi.fn(),
};

/** The rail's own markup for the untracked-runtime rows, up to the footer. */
function untrackedMarkup(html: string): string {
  return html.slice(html.indexOf('data-testid="untracked-row"'), html.indexOf("sidebar__footer"));
}

/** Every session row's markup: from the first row to whatever follows the last. */
function rowsMarkup(html: string): string {
  const start = html.indexOf('data-testid="session-row"');
  const untracked = html.indexOf('data-testid="untracked-row"');
  const end = untracked === -1 ? html.indexOf("sidebar__footer") : untracked;
  return html.slice(start, end);
}

/** The visible facts line only — attributes and the hidden state span excluded. */
function factsMarkup(html: string): string {
  const row = rowsMarkup(html);
  const start = row.indexOf("session-row__facts");
  if (start === -1) return "";
  return row.slice(start, row.indexOf("</button>", start));
}

/** How many status dots a piece of markup draws. */
function dots(html: string): number {
  return (html.match(/class="status\b/g) ?? []).length;
}

describe("Sidebar", () => {
  beforeEach(() => {
    store.current = { ...baseStore };
  });

  it("当会话正在同步时，同步按钮禁用且列表显示刷新遮罩与加载器", () => {
    store.current = {
      ...baseStore,
      sessionsSyncing: true,
    };
    const html = renderToStaticMarkup(createElement(Sidebar));
    expect(html).toContain('data-testid="sidebar-overlay"');
    expect(html).toContain('class="spinner"');
    expect(html).toContain("正在同步会话…");
    expect(html).toContain("spin-sync");
    expect(html).toContain("disabled");
    expect(html).toContain('aria-label="同步中…"');
  });

  it("当未在同步时，同步按钮正常可用且不渲染遮罩", () => {
    store.current = {
      ...baseStore,
      sessionsSyncing: false,
    };
    const html = renderToStaticMarkup(createElement(Sidebar));
    expect(html).not.toContain('data-testid="sidebar-overlay"');
    expect(html).not.toContain("spin-sync");
    expect(html).toContain('aria-label="同步"');
  });

  it("服务器上有、本地没有的运行时，以只读的一行列出", () => {
    store.current = { ...baseStore, sessions: [], untrackedSessions: [UNTRACKED] };
    const html = renderToStaticMarkup(createElement(Sidebar));
    const visible = untrackedMarkup(html)
      .replace(/title="[^"]*"/g, "")
      .replace(/<span class="visually-hidden">.*?<\/span>/g, "");

    expect(html).toContain('data-testid="untracked-row"');
    // 没有名字，所以用 endpoint 当标识，而且是机器的语气：mono。
    expect(html).toContain("session-row__name--endpoint");
    expect(html).toContain(UNTRACKED.endpoint);
    // 行内只留警告点和机型 tag；状态词在 tooltip 和屏幕阅读器文字里。
    expect(visible).toContain("status--warn");
    expect(visible).toContain('class="badge');
    expect(visible).toContain("CPU");
    expect(visible).not.toContain("未在本地记录");
    expect(untrackedMarkup(html)).toContain('class="visually-hidden"');
    expect(untrackedMarkup(html)).toContain("未在本地记录");
  });

  it("名字和机型 tag 在第一行，动作条独立", () => {
    const row = rowsMarkup(renderToStaticMarkup(createElement(Sidebar)));
    const buttonEnd = row.indexOf("</button>");
    const name = row.indexOf("session-row__name");
    const badge = row.indexOf("session-row__badge");

    expect(buttonEnd).toBeGreaterThan(-1);
    expect(name).toBeGreaterThan(-1);
    expect(badge).toBeGreaterThan(name);
    expect(badge).toBeLessThan(buttonEnd);
    expect(row.indexOf("session-row__actions")).toBeGreaterThan(buttonEnd);
  });

  it("一台机器只有一个状态：行里不再出现两个点", () => {
    store.current = { ...baseStore, connections: { "session-1": { status: "ready" } } };
    const html = renderToStaticMarkup(createElement(Sidebar));

    expect(dots(rowsMarkup(html))).toBe(1);
    // The resting state is a dot, not a word; the state stays readable to a
    // screen reader and in the tooltip, so colour is not the only carrier.
    expect(factsMarkup(html)).not.toContain("已连接");
    expect(html).toContain("已连接");
  });

  it("机型 tag 在名字后面，不在事实行", () => {
    const row = rowsMarkup(renderToStaticMarkup(createElement(Sidebar)));
    const badge = row.slice(row.indexOf("session-row__badge"), row.indexOf("session-row__facts"));

    expect(badge).toContain('class="badge');
    expect(badge).toContain("CPU");
  });

  it("健康行没有第二行", () => {
    const html = renderToStaticMarkup(createElement(Sidebar));
    expect(rowsMarkup(html)).not.toContain("session-row__facts");
  });

  it("只有连接异常时，事实行不以分隔符开头", () => {
    store.current = { ...baseStore, connections: { "session-1": { status: "connecting" } } };
    const facts = factsMarkup(renderToStaticMarkup(createElement(Sidebar)));

    expect(facts).toContain("连接中");
    expect(facts).not.toContain("session-row__sep");
  });

  it("只有终端数时，事实行不以分隔符开头", () => {
    store.current = {
      ...baseStore,
      tabs: [
        { session: "session-1", kind: "shell" },
        { session: "session-1", kind: "shell" },
      ],
    };
    const facts = factsMarkup(renderToStaticMarkup(createElement(Sidebar)));

    expect(facts).toContain("2 个终端");
    expect(facts).not.toContain("session-row__sep");
  });

  it("连接异常和终端数同时存在时，只在两者之间放一个分隔符", () => {
    store.current = {
      ...baseStore,
      connections: { "session-1": { status: "connecting" } },
      tabs: [
        { session: "session-1", kind: "shell" },
        { session: "session-1", kind: "shell" },
      ],
    };
    const facts = factsMarkup(renderToStaticMarkup(createElement(Sidebar)));

    expect(facts).toContain("连接中");
    expect(facts).toContain("2 个终端");
    expect((facts.match(/session-row__sep/g) ?? []).length).toBe(1);
    expect(facts.indexOf("连接中")).toBeLessThan(facts.indexOf("session-row__sep"));
  });

  it("休息状态只给屏幕阅读器一份，不再重复可见的那一份", () => {
    store.current = { ...baseStore, connections: { "session-1": { status: "ready" } } };
    const html = renderToStaticMarkup(createElement(Sidebar));
    const hidden = rowsMarkup(html).match(/<span class="visually-hidden">(.*?)<\/span>/)?.[1];

    expect(hidden).toBe("已连接");
  });

  it("可见的连接异常不会在隐藏文字里重复，但云端已无仍会读出来", () => {
    store.current = {
      ...baseStore,
      runtimeEndpoints: [],
      connections: { "session-1": { status: "connecting" } },
    };
    const html = renderToStaticMarkup(createElement(Sidebar));
    const hidden = rowsMarkup(html).match(/<span class="visually-hidden">(.*?)<\/span>/)?.[1];

    expect(hidden).toContain("云端已无");
    expect(hidden).not.toContain("连接中");
  });

  it("云端还在的运行时，行里不写状态，tooltip 里才有", () => {
    store.current = { ...baseStore, runtimeEndpoints: ["127.0.0.1"] };
    const html = renderToStaticMarkup(createElement(Sidebar));

    expect(factsMarkup(html)).not.toContain("云端运行中");
    expect(html).toContain("云端运行中");
    expect(rowsMarkup(html)).not.toContain("session-row--released");
  });

  it("云端已经没有的运行时，行变灰，后果写在 tooltip 里", () => {
    store.current = { ...baseStore, runtimeEndpoints: [] };
    const html = renderToStaticMarkup(createElement(Sidebar));

    expect(factsMarkup(html)).not.toContain("云端已无");
    expect(html).toContain("云端已无此运行时");
    expect(html).toContain("同步将移除该本地记录");
    expect(rowsMarkup(html)).toContain("session-row--released");
  });

  it("连接着的时候，服务端的旧列表不能把这一行画成已释放", () => {
    store.current = {
      ...baseStore,
      runtimeEndpoints: [],
      connections: { "session-1": { status: "ready" } },
    };
    const html = renderToStaticMarkup(createElement(Sidebar));

    expect(rowsMarkup(html)).not.toContain("session-row--released");
  });

  it("服务器那一半没读到时不说话：网络抖动不是一台没了的机器", () => {
    store.current = { ...baseStore, runtimeEndpoints: null, untrackedError: "assignments request failed" };
    const html = renderToStaticMarkup(createElement(Sidebar));

    expect(html).not.toContain("云端运行中");
    expect(html).not.toContain("云端已无");
  });

  it("未在本地记录的那一行不是控件：没有菜单、没有按钮、指针不是手型", () => {
    store.current = { ...baseStore, sessions: [], untrackedSessions: [UNTRACKED] };
    const html = renderToStaticMarkup(createElement(Sidebar));

    expect(untrackedMarkup(html)).not.toContain("<button");
    expect(untrackedMarkup(html)).not.toContain("menu__trigger");
    expect(html).toContain("session-row--untracked");
  });

  it("切换账号后，说清这些记录属于上一个账号，并给出同步", () => {
    store.current = { ...baseStore, previousAccount: "old@example.com" };
    const html = renderToStaticMarkup(createElement(Sidebar));

    expect(html).toContain('data-testid="previous-account"');
    expect(html).toContain("old@example.com");
    expect(html).toContain("同步并清理");
  });

  it("没有切换账号时不出现那条提示", () => {
    const html = renderToStaticMarkup(createElement(Sidebar));
    expect(html).not.toContain('data-testid="previous-account"');
  });

  it("没登录时整条会话栏都不画：里面没有一件事能做", () => {
    store.current = { ...baseStore, env: { authenticated: false } };
    expect(renderToStaticMarkup(createElement(Sidebar))).toBe("");
  });

  it("空态说的是「本地」没有，而不是「没有」", () => {
    store.current = { ...baseStore, sessions: [], untrackedSessions: [] };
    const html = renderToStaticMarkup(createElement(Sidebar));
    expect(html).toContain("本地暂无会话");
  });

  it("服务器那一半没读到时空态必须说出来，并给出下一步", () => {
    store.current = {
      ...baseStore,
      sessions: [],
      untrackedSessions: [],
      // The reason is main-process text; only *that* it failed reaches the DOM.
      untrackedError: "assignments request failed",
    };
    const html = renderToStaticMarkup(createElement(Sidebar));
    expect(html).toContain("无法读取云端运行时列表");
    expect(html).toContain("请使用上方「同步」重试");
  });

  it("本地有会话时不报服务器那一半的失败——列表本身是诚实的", () => {
    store.current = {
      ...baseStore,
      untrackedError: "assignments request failed",
    };
    const html = renderToStaticMarkup(createElement(Sidebar));
    expect(html).not.toContain("无法读取云端运行时列表");
  });
});

describe("workspace chrome", () => {
  it("puts the brand and the rail toggle in the rail's own header", () => {
    store.current = {
      ...baseStore,
      selectedSession: "session-1",
      tabs: [{ session: "session-1" }],
      settingsOpen: false,
      creation: { open: false },
      toggleSidebar: vi.fn(),
    };
    const html = renderToStaticMarkup(createElement(Sidebar));

    expect(html).toContain('class="sidebar__head"');
    expect(html).toContain('data-testid="toggle-sidebar"');
    expect(html).toContain('aria-label="收起会话栏"');
  });

  it("does not add the header when the global bar is carrying it", () => {
    store.current = {
      ...baseStore,
      selectedSession: "session-1",
      tabs: [{ session: "session-1" }],
      settingsOpen: true,
    };
    const html = renderToStaticMarkup(createElement(Sidebar));

    expect(html).not.toContain('class="sidebar__head"');
  });
});

describe("in English", () => {
  afterEach(async () => {
    await setRendererUiLanguage("zh");
  });

  /** Every state at once: local rows, an untracked row, and the sentence the
      rail writes when the server's half of the list could not be read. */
  it("会话栏不出现中文——含未追踪行与那句读不到列表的话", async () => {
    store.current = {
      ...baseStore,
      untrackedSessions: [UNTRACKED],
      untrackedError: "assignments request failed",
    };
    await setRendererUiLanguage("en");
    expect(renderToStaticMarkup(createElement(Sidebar))).not.toMatch(/[一-鿿]/);
  });
});
