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
  selectedSession: null,
  tabs: [],
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

    expect(html).toContain('data-testid="untracked-row"');
    // 没有名字，所以用 endpoint 当标识，而且是机器的语气：mono。
    expect(html).toContain("session-row__name--endpoint");
    expect(html).toContain(UNTRACKED.endpoint);
    // 状态是点 + 文字，颜色不单独承载语义。
    expect(html).toContain("未在本地记录");
    expect(html).toContain("status--warn");
    expect(html).toContain("CPU");
  });

  it("未在本地记录的那一行不是控件：没有菜单、没有按钮、指针不是手型", () => {
    store.current = { ...baseStore, sessions: [], untrackedSessions: [UNTRACKED] };
    const html = renderToStaticMarkup(createElement(Sidebar));

    expect(untrackedMarkup(html)).not.toContain("<button");
    expect(untrackedMarkup(html)).not.toContain("menu__trigger");
    expect(html).toContain("session-row--untracked");
  });

  it("空态说的是「本地」没有，而不是「没有」", () => {
    store.current = { ...baseStore, sessions: [], untrackedSessions: [] };
    const html = renderToStaticMarkup(createElement(Sidebar));
    expect(html).toContain("本地还没有会话");
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
    expect(html).toContain("读不到云端运行时列表");
    expect(html).toContain("点上面的同步重试");
  });

  it("本地有会话时不报服务器那一半的失败——列表本身是诚实的", () => {
    store.current = {
      ...baseStore,
      untrackedError: "assignments request failed",
    };
    const html = renderToStaticMarkup(createElement(Sidebar));
    expect(html).not.toContain("读不到云端运行时列表");
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
