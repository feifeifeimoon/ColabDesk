import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setRendererUiLanguage } from "../i18n/i18n";
import { ConfirmationDialog } from "./ConfirmationDialog";

/**
 * The component's only dependency on the store is the pending question; a
 * small stand-in keeps the test off the full store (whose theme module needs a
 * window) while rendering the real dialog.
 */
const store = vi.hoisted(() => ({
  confirmation: null as null | {
    title: string;
    body: string;
    confirmLabel: string;
    destructive?: boolean;
    resolve: (confirmed: boolean) => void;
  },
  resolveConfirmation: (_confirmed: boolean): void => {},
}));

vi.mock("../store", () => ({
  useAppStore: (selector: (state: typeof store) => unknown) => selector(store),
}));

afterEach(() => {
  store.confirmation = null;
});

describe("the confirmation dialog", () => {
  it("shows the question, the sentence and both answers", async () => {
    await setRendererUiLanguage("zh");
    store.confirmation = {
      title: "停止「alpha」？",
      body: "未保存的运行时数据会丢失。",
      confirmLabel: "停止会话",
      destructive: true,
      resolve: vi.fn(),
    };

    const markup = renderToStaticMarkup(createElement(ConfirmationDialog));

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain("停止「alpha」？");
    expect(markup).toContain("未保存的运行时数据会丢失。");
    expect(markup).toContain("取消");
    expect(markup).toContain("停止会话");
    expect(markup).toContain("btn--destructive");
    // The affirmative action is last and focused.
    expect(markup.indexOf("取消")).toBeLessThan(markup.indexOf("停止会话"));
    expect(markup).toContain("autofocus");
  });

  it("renders nothing when no question is pending", () => {
    expect(renderToStaticMarkup(createElement(ConfirmationDialog))).toBe("");
  });
});
