import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import "../../i18n/i18n";
import { FilePaneContextMenu } from "./FilePaneContextMenu";
import { TREE_ROOT, type Row } from "./file-tree";
import type { MenuItem } from "../../components/ui/Menu";

vi.mock("../../components/ui/ContextMenu", () => ({
  ContextMenu: ({ label, items }: { label: string; items: MenuItem[] }) =>
    createElement(
      "div",
      { className: "context-menu", "aria-label": label },
      items.map((item, index) =>
        createElement(
          "button",
          { key: String(item.label ?? index), type: "button", disabled: item.disabled },
          item.label,
        ),
      ),
    ),
}));

describe("FilePaneContextMenu", () => {
  const defaultProps = {
    session: "session-test",
    busy: null,
    rootLoading: false,
    kindOf: (row: Row) => (row.entry?.type === "dir" ? ("dir" as const) : ("file" as const)),
    onClose: vi.fn(),
    onOpenFile: vi.fn(),
    onOpenLink: vi.fn(),
    onBeginCreate: vi.fn(),
    onUploadTo: vi.fn(),
    onUploadFolder: vi.fn(),
    onDownload: vi.fn(),
    onDownloadDirectory: vi.fn(),
    onDeleteAsk: vi.fn(),
    onRefresh: vi.fn(),
  };

  it("renders nothing when menu is null", () => {
    const html = renderToStaticMarkup(
      createElement(FilePaneContextMenu, {
        ...defaultProps,
        menu: null,
      }),
    );
    expect(html).toBe("");
  });

  it("renders directory context menu items", () => {
    const row: Row = {
      path: "/content/subfolder",
      name: "subfolder",
      depth: 1,
      entry: { name: "subfolder", type: "dir", size: 0, mtime: 0, mode: 0o755 },
      open: false,
    };

    const html = renderToStaticMarkup(
      createElement(FilePaneContextMenu, {
        ...defaultProps,
        menu: { point: { x: 100, y: 100 }, row, returnFocus: null },
      }),
    );

    expect(html).toContain("在此新建文件");
    expect(html).toContain("在此新建文件夹");
    expect(html).toContain("上传文件到此处");
    expect(html).toContain("下载文件夹");
    expect(html).toContain("复制路径");
    expect(html).toContain("删除");
  });

  it("does not show delete or download directory for the root folder", () => {
    const rootRow: Row = {
      path: TREE_ROOT,
      name: TREE_ROOT,
      depth: 0,
      entry: null,
      open: true,
    };

    const html = renderToStaticMarkup(
      createElement(FilePaneContextMenu, {
        ...defaultProps,
        kindOf: () => "dir" as const,
        menu: { point: { x: 50, y: 50 }, row: rootRow, returnFocus: null },
      }),
    );

    expect(html).toContain("在此新建文件");
    expect(html).toContain("在此新建文件夹");
    expect(html).not.toContain("下载文件夹");
    expect(html).not.toContain("删除");
  });

  it("renders file context menu items", () => {
    const row: Row = {
      path: "/content/train.py",
      name: "train.py",
      depth: 1,
      entry: { name: "train.py", type: "file", size: 1024, mtime: 0, mode: 0o644 },
      open: false,
    };

    const html = renderToStaticMarkup(
      createElement(FilePaneContextMenu, {
        ...defaultProps,
        menu: { point: { x: 100, y: 100 }, row, returnFocus: null },
      }),
    );

    expect(html).toContain("打开");
    expect(html).toContain("下载");
    expect(html).toContain("复制路径");
    expect(html).toContain("删除");
    expect(html).not.toContain("在此新建文件");
  });

  it("renders empty area context menu with refresh action", () => {
    const html = renderToStaticMarkup(
      createElement(FilePaneContextMenu, {
        ...defaultProps,
        menu: { point: { x: 200, y: 200 }, row: null, returnFocus: null },
      }),
    );

    expect(html).toContain("刷新");
    expect(html).toContain("复制路径");
    expect(html).not.toContain("删除");
  });
});
