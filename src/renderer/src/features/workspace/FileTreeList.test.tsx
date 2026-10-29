import { createRef, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import "../../i18n/i18n";
import { FileTreeList } from "./FileTreeList";
import { TREE_ROOT, type Row } from "./file-tree";

describe("FileTreeList", () => {
  const defaultProps = {
    treeRef: createRef<HTMLUListElement>(),
    rows: [],
    listings: {},
    focused: null,
    activeFilePath: null,
    resolving: null,
    dropDir: null,
    showFileSizes: false,
    firstFocusable: null,
    newEntry: null,
    entryName: "",
    newEntryInputRef: createRef<HTMLInputElement>(),
    busy: null,
    kindOf: (row: Row) => (row.entry?.type === "dir" ? ("dir" as const) : ("file" as const)),
    onKeyDown: vi.fn(),
    onFocusRow: vi.fn(),
    onActivateRow: vi.fn(),
    onOpenRowMenu: vi.fn(),
    onRowDragOver: vi.fn(),
    onRowDragLeave: vi.fn(),
    onRowDrop: vi.fn(),
    onEntryNameChange: vi.fn(),
    onSubmitEntry: vi.fn(),
    onCancelEntry: vi.fn(),
    onRetryListing: vi.fn(),
  };

  it("renders root row and child rows with proper semantics", () => {
    const rows: Row[] = [
      {
        path: TREE_ROOT,
        name: TREE_ROOT,
        depth: 0,
        entry: null,
        open: true,
      },
      {
        path: "/content/src",
        name: "src",
        depth: 1,
        entry: { name: "src", type: "dir", size: 0, mtime: 0, mode: 0o755 },
        open: true,
      },
      {
        path: "/content/src/main.py",
        name: "main.py",
        depth: 2,
        entry: { name: "main.py", type: "file", size: 2048, mtime: 0, mode: 0o644 },
        open: false,
      },
    ];

    const html = renderToStaticMarkup(
      createElement(FileTreeList, {
        ...defaultProps,
        rows,
        showFileSizes: true,
      }),
    );

    expect(html).toContain('role="tree"');
    expect(html).toContain("file-row--root");
    expect(html).toContain("/content");
    expect(html).toContain("src");
    expect(html).toContain("main.py");
    expect(html).toContain("2.0 KB");
  });

  it("renders inline creation form when newEntry is set", () => {
    const rows: Row[] = [
      {
        path: TREE_ROOT,
        name: TREE_ROOT,
        depth: 0,
        entry: null,
        open: true,
      },
    ];

    const html = renderToStaticMarkup(
      createElement(FileTreeList, {
        ...defaultProps,
        rows,
        newEntry: { parent: TREE_ROOT, kind: "file" },
        entryName: "test.txt",
      }),
    );

    expect(html).toContain("new-entry-form");
    expect(html).toContain('data-testid="new-entry-name"');
    expect(html).toContain('data-testid="new-entry-create"');
    expect(html).toContain("创建");
    expect(html).toContain("取消");
  });

  it("renders empty directory notice when an open directory has no entries", () => {
    const rows: Row[] = [
      {
        path: TREE_ROOT,
        name: TREE_ROOT,
        depth: 0,
        entry: null,
        open: true,
      },
    ];

    const listings = {
      [TREE_ROOT]: { entries: [], loading: false, error: null },
    };

    const html = renderToStaticMarkup(
      createElement(FileTreeList, {
        ...defaultProps,
        rows,
        listings,
      }),
    );

    expect(html).toContain("file-empty");
    expect(html).toContain("运行时还没有文件");
  });

  it("renders error message and retry button when directory read fails", () => {
    const rows: Row[] = [
      {
        path: TREE_ROOT,
        name: TREE_ROOT,
        depth: 0,
        entry: null,
        open: true,
      },
    ];

    const listings = {
      [TREE_ROOT]: { entries: [], loading: false, error: "SFTP connection timeout" },
    };

    const html = renderToStaticMarkup(
      createElement(FileTreeList, {
        ...defaultProps,
        rows,
        listings,
      }),
    );

    expect(html).toContain("file-error");
    expect(html).toContain("SFTP connection timeout");
    expect(html).toContain("重试");
  });
});
