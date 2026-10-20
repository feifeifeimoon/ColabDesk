/**
 * The shortcut reference, rendered as markup.
 *
 * The table is the product here, so the assertions are about what it promises:
 * every key the app actually handles is written down, the groups say where each
 * key applies, and nothing on the page looks like a control (remapping does not
 * exist yet).
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { setRendererUiLanguage } from "../i18n/i18n";
import { ShortcutsSettings } from "./ShortcutsSettings";

const render = (): string => renderToStaticMarkup(createElement(ShortcutsSettings));
const text = (html: string): string => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

describe("the shortcuts section", () => {
  it("groups keys by where they apply", () => {
    const markup = render();
    for (const heading of ["全局与窗口", "会话与标签", "终端面板内", "文件树"]) {
      expect(markup, heading).toContain(heading);
    }
  });

  it("documents every key the app handles", () => {
    const rendered = text(render());
    for (const keys of [
      "Ctrl/Cmd+,",
      "Ctrl/Cmd+Shift+E",
      "Ctrl/Cmd+Shift+B",
      "Esc",
      "Ctrl/Cmd+Shift+N",
      "Ctrl/Cmd+Shift+T",
      "Ctrl/Cmd+Shift+W",
      "Ctrl/Cmd+Shift+1…9",
      "Ctrl+Shift+C / Cmd+C",
      "Ctrl+Shift+V / Cmd+V",
      "Ctrl/Cmd+Shift+= / -",
      "Ctrl/Cmd+Shift+F",
      "↑ / ↓",
      "→",
      "←",
      "Home / End",
      "Enter",
    ]) {
      expect(rendered, keys).toContain(keys);
    }
  });

  it("is a reference, not a form", () => {
    expect(render()).not.toContain("<button");
  });
});

describe("in English", () => {
  afterEach(async () => {
    await setRendererUiLanguage("zh");
  });

  it("快捷键设置不出现中文", async () => {
    await setRendererUiLanguage("en");
    expect(text(render())).not.toMatch(/[一-鿿]/);
  });
});
