/**
 * The file tab's rules, as markup.
 *
 * Rendered to static markup — no DOM needed for decisions that live in the
 * text and the attributes. The interesting failures are "a refusal that does
 * not say why", "a save offered for something that cannot be written", "an
 * unsaved buffer closed without asking", and "a parked tab that is still
 * reachable"; all four are visible here without a terminal or a connection.
 *
 * What cannot be seen here is anything inside the text surface (the editor's
 * document, its line numbers): those are CodeMirror's at runtime, and the e2e
 * spec is where they are asserted.
 */

import { createElement, type ComponentProps } from "react";
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

const WRITABLE = 0o100644;
const LOCKED = 0o100444;

function render(
  state: FileViewState,
  over: Partial<ComponentProps<typeof FileViewPanel>> = {},
): string {
  return renderToStaticMarkup(
    createElement(FileViewPanel, {
      path: "/content/train.log",
      name: "train.log",
      active: true,
      state,
      dirty: false,
      saving: false,
      pending: null,
      closing: false,
      saveError: null,
      savedAt: null,
      size: null,
      onReady: () => {},
      onChange: () => {},
      onSave: () => {},
      onOverwrite: () => {},
      onReload: () => {},
      onDiscardAndReload: () => {},
      onKeepEditing: () => {},
      onSaveAndClose: () => {},
      onDiscardAndClose: () => {},
      onCancelClose: () => {},
      onDownload: () => {},
      ...over,
    }),
  );
}

const LOADING: FileViewState = { status: "loading" };
const FAILED: FileViewState = { status: "failed", message: "读取 /content/train.log 失败：连接已断开。" };
const TEXT: FileViewState = {
  status: "ready",
  read: { kind: "text", text: "a\nb\n", eol: "crlf", size: 4, mtime: 0, mode: WRITABLE },
};
const LOCKED_TEXT: FileViewState = {
  status: "ready",
  read: { kind: "text", text: "seed=1\n", eol: "lf", size: 7, mtime: 0, mode: LOCKED },
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
    mode: WRITABLE,
  },
};
const INVALID: FileViewState = {
  status: "ready",
  read: { kind: "invalidUtf8", text: "\uFFFD(", size: 2, mtime: 0, mode: WRITABLE },
};
const BINARY: FileViewState = { status: "ready", read: { kind: "binary", size: 4096 } };

/** The save control itself, so "there is no save here" cannot be fooled by the
    word 保存 turning up inside 未保存 in the status line. */
function saveButton(markup: string): string {
  return markup.match(/<button[^>]*data-testid="save-file"[^>]*>/)?.[0] ?? "";
}

describe("file tab", () => {
  it("every refusal says what it is refusing and how much there is", () => {
    expect(render(TRUNCATED)).toContain("文件较大（3.0 MB）");
    expect(render(INVALID)).toContain("不是有效的 UTF-8 文本");
    expect(render(BINARY)).toContain("二进制文件无法预览");
  });

  it("marks the states that are text but not all of it — and only those", () => {
    expect(render(TRUNCATED)).toContain("只读");
    expect(render(INVALID)).toContain("只读");
    expect(render(LOCKED_TEXT)).toContain("只读");
    expect(render(LOCKED_TEXT)).toContain("这个文件不可写");
    // A binary file never offers reading to begin with, so it gets no label.
    expect(render(BINARY)).not.toContain("只读");
  });

  it("offers no save for anything that cannot be written back", () => {
    for (const state of [TRUNCATED, INVALID, BINARY, LOCKED_TEXT]) {
      const markup = render(state);
      expect(saveButton(markup)).toBe("");
      expect(markup).toContain("下载到本地");
    }
  });

  it("offers a save for a file it can write, and holds it until there is something to save", () => {
    expect(saveButton(render(TEXT))).toContain("disabled");
    expect(saveButton(render(TEXT, { dirty: true }))).not.toContain("disabled");
    expect(render(TEXT, { dirty: true })).toContain("未保存");
    expect(render(TEXT, { dirty: true, saving: true })).toContain("保存中…");
    expect(render(TEXT, { dirty: false, savedAt: 1 })).toContain("已保存");
  });

  it("reports the endings and the size as facts about the file, and the size after a save", () => {
    expect(render(TEXT)).toContain("行尾 CRLF");
    expect(render(TEXT)).toContain("4 B");
    // A write changed the size; the header shows what the runtime has now.
    expect(render(TEXT, { dirty: true, size: 4096 })).toContain("4.0 KB");
    expect(render(TRUNCATED)).toContain("3.0 MB");
  });

  it("asks before closing a buffer with unsaved edits, and offers every way out", () => {
    const markup = render(TEXT, { dirty: true, closing: true });
    expect(markup).toContain("有未保存的修改");
    expect(markup).toContain("保存并关闭");
    expect(markup).toContain("不保存");
    expect(markup).toContain("取消");
    expect(saveButton(markup)).toBe("");
  });

  it("asks before reloading over unsaved edits", () => {
    const markup = render(TEXT, { dirty: true, pending: { kind: "confirmReload" } });
    expect(markup).toContain("重新加载会丢弃它们");
    expect(markup).toContain("重新加载并丢弃修改");
    expect(saveButton(markup)).toBe("");
  });

  it("a file that moved on is a question with the buffer still on screen", () => {
    const changed = render(TEXT, { dirty: true, pending: { kind: "conflict", reason: "changed" } });
    expect(changed).toContain("文件在服务器上已改变");
    expect(changed).toContain("覆盖");
    expect(changed).toContain("放弃我的修改并重新加载");
    expect(changed).toContain("未保存");
    expect(saveButton(changed)).toBe("");

    const gone = render(TEXT, { dirty: true, pending: { kind: "conflict", reason: "missing" } });
    expect(gone).toContain("已不存在");
  });

  it("a failed save says why, and does not claim the edits are safe", () => {
    const markup = render(TEXT, { dirty: true, saveError: "权限不足。" });
    expect(markup).toContain("保存失败");
    expect(markup).toContain("权限不足");
    // Still dirty, still offering the save again.
    expect(markup).toContain("未保存");
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
    const parked = render(TEXT, { active: false });
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
    const cases: Array<[FileViewState, Partial<ComponentProps<typeof FileViewPanel>>]> = [
      [LOADING, {}],
      [
        { status: "failed", message: "Reading /content/train.log failed: the connection is gone." },
        {},
      ],
      [TEXT, {}],
      [TEXT, { dirty: true, closing: true }],
      [TEXT, { dirty: true, pending: { kind: "conflict", reason: "changed" } }],
      [TEXT, { dirty: true, pending: { kind: "confirmReload" } }],
      [TEXT, { dirty: true, saveError: "Permission denied." }],
      [LOCKED_TEXT, {}],
      [TRUNCATED, {}],
      [INVALID, {}],
      [BINARY, {}],
    ];
    for (const [state, over] of cases) {
      expect(render(state, over)).not.toMatch(/[一-鿿]/);
    }
  });
});
