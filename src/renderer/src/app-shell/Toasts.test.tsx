/**
 * The message corner, rendered as markup.
 *
 * What a toast is for is a decision, not an implementation detail, and the two
 * halves of it are visible in the markup: it is a status region (it reports,
 * it does not interrupt) and it can be dismissed (because it will also leave on
 * its own, and a message you cannot get rid of before then is a hostage).
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n/i18n";

const store = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("../store", () => ({
  useAppStore: (select: (state: unknown) => unknown) => select(store.current),
}));

import { Toasts } from "./Toasts";

beforeEach(() => {
  store.current = { toasts: [], dismissToast: () => {} };
});

const render = (): string => renderToStaticMarkup(createElement(Toasts));

describe("the message corner", () => {
  it("renders nothing at all when there is nothing to say", () => {
    expect(render()).toBe("");
  });

  it("reports rather than interrupts", () => {
    store.current = {
      ...store.current,
      toasts: [{ id: 1, tone: "info", text: "会话「alpha」已停止。" }],
    };
    const html = render();
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain('role="alert"');
  });

  it("carries the message and a way out of it", () => {
    store.current = {
      ...store.current,
      toasts: [{ id: 7, tone: "danger", text: "停止命令超时，请稍后同步查看。" }],
    };
    const html = render();
    expect(html).toContain("停止命令超时，请稍后同步查看。");
    expect(html).toContain('data-testid="toast-dismiss"');
    // The glyph cannot name itself; the label has to.
    expect(html).toContain('aria-label="关闭提示"');
  });

  it("shows what is queued, in order", () => {
    store.current = {
      ...store.current,
      toasts: [
        { id: 1, tone: "info", text: "第一条" },
        { id: 2, tone: "warn", text: "第二条" },
      ],
    };
    const html = render();
    expect(html.indexOf("第一条")).toBeLessThan(html.indexOf("第二条"));
  });
});
