/**
 * The find bar, as a design rule rather than a picture.
 *
 * The bar is the only control the terminal grows, and it is reached by a
 * keystroke: whatever it offers has to be reachable and nameable without seeing
 * it. The directions and the way out are icon-only, so the assertions here are
 * about what a screen reader would read — plus the guard every screen carries,
 * that an English rendering has no Chinese left in it.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { setRendererUiLanguage } from "../../i18n/i18n";
import { TerminalSearchBar } from "./TerminalSearchBar";

function render(value = ""): string {
  return renderToStaticMarkup(
    <TerminalSearchBar
      value={value}
      onChange={() => {}}
      onSubmit={() => {}}
      onNext={() => {}}
      onPrevious={() => {}}
      onClose={() => {}}
    />,
  );
}

describe("terminal search bar", () => {
  afterEach(async () => {
    await setRendererUiLanguage("zh");
  });

  it("names every control", () => {
    const markup = render("epoch");
    // The field, both directions, and the way out.
    expect(markup).toContain("在终端里查找");
    expect(markup).toContain('aria-label="上一个"');
    expect(markup).toContain('aria-label="下一个"');
    expect(markup).toContain('aria-label="关闭查找"');
  });

  it("does nothing before there is something to look for", () => {
    const empty = render("");
    // Both directions are disabled with no query; closing never is.
    expect(empty.match(/disabled=""/g)?.length).toBe(2);
    expect(render("epoch").match(/disabled=""/g)).toBeNull();
  });

  it("has nothing left to translate", async () => {
    await setRendererUiLanguage("en");
    expect(render("epoch")).not.toMatch(/[\u4e00-\u9fff]/);
  });
});
