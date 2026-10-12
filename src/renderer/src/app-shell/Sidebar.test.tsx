/**
 * Assertions on the left rail: sessions list, sync state, and refreshing overlay.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n/i18n";
import { Sidebar } from "./Sidebar";

const store = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("../store", () => ({
  useAppStore: (select: (state: unknown) => unknown) => select(store.current),
}));

const baseStore = {
  sidebarOpen: true,
  panelWidths: { sidebar: 260, files: 340 },
  setPanelWidth: vi.fn(),
  sessions: [{ name: "session-1", endpoint: "127.0.0.1" }],
  sessionsLoading: false,
  sessionsSyncing: false,
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
});
