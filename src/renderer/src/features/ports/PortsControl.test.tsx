import type { PortForward } from "@shared/types";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setRendererUiLanguage } from "../../i18n/i18n";

// The connected control pulls the store, whose module reads window.matchMedia.
// These tests render the presentational view; the store has no part to play.
vi.mock("../../store", () => ({ useAppStore: () => undefined }));

import { PortsView } from "./PortsControl";

const noop = () => {};

function forward(overrides: Partial<PortForward> = {}): PortForward {
  return {
    id: "p1",
    session: "alpha",
    remote_host: "127.0.0.1",
    remote_port: 8000,
    local_host: "127.0.0.1",
    local_port: 52431,
    requested_local_port: null,
    scheme: "http",
    status: "active",
    error: null,
    ...overrides,
  };
}

function render({
  open = true,
  selectedSession = "alpha",
  connectionReady = true,
  forwardsBySession = { alpha: [forward()] },
}: {
  open?: boolean;
  selectedSession?: string | null;
  connectionReady?: boolean;
  forwardsBySession?: Record<string, PortForward[]>;
} = {}): string {
  return renderToStaticMarkup(
    createElement(PortsView, {
      open,
      onToggle: noop,
      selectedSession,
      connectionReady,
      forwardsBySession,
      onCreate: async () => null,
      onStart: noop,
      onStop: noop,
      onRemove: noop,
      onOpen: noop,
      onCopy: noop,
    }),
  );
}

const text = (html: string): string => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

beforeEach(async () => {
  await setRendererUiLanguage("zh");
});

describe("the Ports button and popover", () => {
  it("keeps the button visible with a zero count, and no popover", () => {
    const html = render({ open: false, forwardsBySession: {} });
    expect(html).toContain('data-testid="ports-button"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("端口转发：0 个");
    expect(html).not.toContain('data-testid="ports-popover"');
  });

  it("shows the add form and an empty state in the popover", () => {
    const html = render({ forwardsBySession: {} });
    const body = text(html);
    expect(body).toContain("端口转发");
    expect(body).toContain("添加到 alpha");
    expect(body).toContain("0 个运行中");
    expect(html).toContain('data-testid="ports-remote"');
    expect(html).toContain('data-testid="ports-local"');
    expect(html).toContain('placeholder="端口"');
    expect(html).toContain('placeholder="自动"');
    expect(html).toContain('aria-label="添加"');
    expect(html).toContain("<datalist");
    expect(html).toContain('value="7860"');
    expect(html).toContain("Gradio");
    expect(body).toContain("在本机打开运行时的端口");
  });

  it("renders an active mapping with its local address and actions", () => {
    const html = render();
    const body = text(html);
    expect(body).toContain("127.0.0.1:8000");
    expect(body).toContain("127.0.0.1:52431");
    expect(body).toContain("1 个运行中");
    expect(body).not.toContain("已映射");
    expect(html).toContain('data-status="active"');
    expect(html).toContain('aria-label="运行中"');
    expect(html).toContain('aria-label="打开"');
    expect(html).toContain('aria-label="复制"');
    expect(html).toContain('aria-label="停止"');
    expect(html).toContain('data-testid="port-row-p1"');
    expect(html).toContain('data-local-port="52431"');
    expect(html).toContain("端口转发：1 个");
  });

  it("shows a failed mapping with a retry, a reason, and the warning dot", () => {
    const html = render({
      forwardsBySession: {
        alpha: [forward({ status: "error", local_port: null, error: "本地端口 8080 已被占用" })],
      },
    });
    const body = text(html);
    expect(body).not.toContain("失败");
    expect(body).toContain("本地端口 8080 已被占用");
    expect(html).toContain('data-status="error"');
    expect(html).toContain('aria-label="失败"');
    expect(html).toContain('aria-label="重试"');
    expect(html).toContain('aria-label="删除"');
    expect(html).toContain("ports-button__dot");
  });

  it("disables the add button and says why when no session is selected", () => {
    const html = render({ selectedSession: null, forwardsBySession: {} });
    const body = text(html);
    expect(body).toContain("未选择会话");
    expect(body).not.toContain("先选择一个会话");
    expect(html).toContain('aria-label="先选择会话"');
    expect(html).toContain('data-testid="ports-add"');
    expect(html).toContain("disabled");
  });

  it("puts the selected session's group first", () => {
    const html = render({
      selectedSession: "beta",
      forwardsBySession: {
        alpha: [forward({ id: "a", session: "alpha" })],
        beta: [forward({ id: "b", session: "beta", remote_port: 7860, local_port: 52432 })],
      },
    });
    const groups = html.split('<section class="ports-group">').slice(1);
    expect(groups[0]).toContain("beta");
    expect(groups[1]).toContain("alpha");
  });

  it("says a starting forward is being assigned and offers no row actions", () => {
    const html = render({
      forwardsBySession: {
        alpha: [forward({ status: "starting", local_port: null })],
      },
    });
    expect(html).toContain('data-status="starting"');
    expect(html).toContain('aria-label="分配中…"');
    expect(html).not.toContain('aria-label="停止"');
    expect(html).toContain("端口转发：1 个");
  });

  it("mentions that starting a mapping connects to the runtime first", () => {
    const html = render({ connectionReady: false, forwardsBySession: {} });
    expect(text(html)).toContain("添加端口会先连接运行时");
  });

  it("renders its labels in English", async () => {
    await setRendererUiLanguage("en");
    const html = render();
    const body = text(html);
    expect(body).toContain("Port forwards");
    expect(html).toContain('aria-label="Active"');
    expect(html).toContain('aria-label="Stop"');
    expect(body).not.toContain("端口");
  });
});
