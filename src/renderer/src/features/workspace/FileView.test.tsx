/**
 * The file tab's rules, as markup.
 *
 * Rendered to static markup — no DOM needed for decisions that live in the
 * text and the attributes. The interesting failures are "a refusal that does
 * not say why", "an editor offered for something that cannot be saved", and "a
 * parked tab that is still reachable"; all three are visible here without a
 * terminal or a connection.
 *
 * What cannot be seen here is anything inside the text surface (the editor's
 * document, its line numbers): those are CodeMirror's at runtime, and the e2e
 * spec is where they are asserted.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setRendererUiLanguage } from "../../i18n/i18n";

// The pane reports a failed download through the store, and the store module
// reaches `lib/theme.ts`, whose module-level `matchMedia` needs a window this
// suite does not have. The panel under test reads no state.
const store = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("../../store", () => ({
  useAppStore: (select: (state: unknown) => unknown) => select(store.current),
}));

import { FileViewPanel, type FileViewState } from "./FileView";

function render(state: FileViewState, active = true): string {
  return renderToStaticMarkup(
    createElement(FileViewPanel, {
      path: "/content/train.log",
      name: "train.log",
      active,
      state,
      onReload: () => {},
      onDownload: () => {},
    }),
  );
}

const LOADING: FileViewState = { status: "loading" };
const FAILED: FileViewState = { status: "failed", message: "读取 /content/train.log 失败：连接已断开。" };
const TEXT: FileViewState = {
  status: "ready",
  read: { kind: "text", text: "a\nb\n", eol: "crlf", size: 4, mtime: 0, mode: 0o100644 },
};
const TRUNCATED: FileViewState = {
  status: "ready",
  read: {
    kind: "truncated",
    head: "head",
    tail: "tail",
    omitted: 3_145_728 - 512,
    size: 3_145_728,
    mtime: 0,
    mode: 0o100644,
  },
};
const INVALID: FileViewState = {
  status: "ready",
  read: { kind: "invalidUtf8", text: "\uFFFD(", size: 2, mtime: 0, mode: 0o100644 },
};
const BINARY: FileViewState = { status: "ready", read: { kind: "binary", size: 4096 } };

describe("file tab", () => {
  it("every refusal says what it is refusing and how much there is", () => {
    expect(render(TRUNCATED)).toContain("文件较大（3.0 MB）");
    expect(render(INVALID)).toContain("不是有效的 UTF-8 文本");
    expect(render(BINARY)).toContain("二进制文件无法预览");
  });

  it("marks the states that are text but not all of it — and only those", () => {
    expect(render(TRUNCATED)).toContain("只读");
    expect(render(INVALID)).toContain("只读");
    // A binary file never offers reading to begin with, so it gets no label.
    expect(render(BINARY)).not.toContain("只读");
  });

  it("offers no save for anything that cannot be written back, and a way out instead", () => {
    for (const state of [TRUNCATED, INVALID, BINARY]) {
      const markup = render(state);
      expect(markup).not.toContain("保存");
      expect(markup).toContain("下载到本地");
    }
  });

  it("reports the endings and the size as facts about the file", () => {
    expect(render(TEXT)).toContain("行尾 CRLF");
    expect(render(TEXT)).toContain("4 B");
    expect(render(TRUNCATED)).toContain("3.0 MB");
  });

  it("a failed read offers the retry that is the point of the state", () => {
    const markup = render(FAILED);
    expect(markup).toContain("读取失败");
    expect(markup).toContain("连接已断开");
    expect(markup).toContain("重试");
  });

  it("says it is reading while it is", () => {
    expect(render(LOADING)).toContain("读取中…");
  });

  it("a parked tab is hidden and inert, never merely invisible", () => {
    const parked = render(TEXT, false);
    expect(parked).toContain('hidden=""');
    expect(parked).toContain('inert=""');
    const shown = render(TEXT);
    expect(shown).not.toContain('hidden=""');
  });

  it("is named by the file it shows", () => {
    expect(render(TEXT)).toContain('aria-label="train.log"');
  });
});

describe("in English", () => {
  afterEach(async () => {
    await setRendererUiLanguage("zh");
  });

  it("文件标签页不出现中文", async () => {
    await setRendererUiLanguage("en");
    const states: FileViewState[] = [
      LOADING,
      { status: "failed", message: "Reading /content/train.log failed: the connection is gone." },
      TEXT,
      TRUNCATED,
      INVALID,
      BINARY,
    ];
    for (const state of states) {
      expect(render(state)).not.toMatch(/[一-鿿]/);
    }
  });
});
