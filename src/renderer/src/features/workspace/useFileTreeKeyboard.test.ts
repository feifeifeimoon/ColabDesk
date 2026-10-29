import { createRef, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  useFileTreeKeyboard,
  type UseFileTreeKeyboardOptions,
  type UseFileTreeKeyboardResult,
} from "./useFileTreeKeyboard";
import { TREE_ROOT, type Row } from "./file-tree";

describe("useFileTreeKeyboard", () => {
  it("initializes with firstFocusable set to the first row path", () => {
    const rows: Row[] = [
      {
        path: TREE_ROOT,
        name: TREE_ROOT,
        depth: 0,
        entry: null,
        open: true,
      },
      {
        path: "/content/README.md",
        name: "README.md",
        depth: 1,
        entry: { name: "README.md", type: "file", size: 100, mtime: 0, mode: 0o644 },
        open: false,
      },
    ];

    function TestComponent({ onReady }: { onReady: (result: UseFileTreeKeyboardResult) => void }) {
      const result = useFileTreeKeyboard({
        rows,
        treeRef: createRef<HTMLUListElement>(),
        kindOf: (r) => (r.entry?.type === "dir" ? "dir" : "file"),
        toggle: vi.fn(),
        loadThenOpen: vi.fn(),
      });
      onReady(result);
      return createElement("div", { "data-first": result.firstFocusable });
    }

    let captured: UseFileTreeKeyboardResult | null = null;
    const html = renderToStaticMarkup(
      createElement(TestComponent, {
        onReady: (res) => {
          captured = res;
        },
      }),
    );
    expect(html).toContain(`data-first="${TREE_ROOT}"`);
    expect(captured).not.toBeNull();
    expect(captured!.firstFocusable).toBe(TREE_ROOT);
  });

  it("handles keyboard events cleanly through onKeyDown handler", () => {
    const toggle = vi.fn();
    const loadThenOpen = vi.fn();
    const openRowMenuAt = vi.fn();

    const rows: Row[] = [
      {
        path: TREE_ROOT,
        name: TREE_ROOT,
        depth: 0,
        entry: null,
        open: true,
      },
      {
        path: "/content/data",
        name: "data",
        depth: 1,
        entry: { name: "data", type: "dir", size: 0, mtime: 0, mode: 0o755 },
        open: false,
      },
    ];

    function TestComponent({
      onReady,
      ...props
    }: Partial<UseFileTreeKeyboardOptions> & { onReady: (result: UseFileTreeKeyboardResult) => void }) {
      const result = useFileTreeKeyboard({
        rows,
        treeRef: createRef<HTMLUListElement>(),
        kindOf: (r) => (r.entry?.type === "dir" || r.path === TREE_ROOT ? "dir" : "file"),
        toggle,
        loadThenOpen,
        openRowMenuAt,
        ...props,
      });
      onReady(result);
      return createElement("div");
    }

    let hookResult: UseFileTreeKeyboardResult | null = null;
    renderToStaticMarkup(
      createElement(TestComponent, {
        onReady: (res) => {
          hookResult = res;
        },
      }),
    );
    expect(hookResult).not.toBeNull();

    // A key event from outside .file-row__row is ignored
    const nonRowTarget = { closest: () => null } as unknown as HTMLElement;
    const preventDefault = vi.fn();
    hookResult!.onKeyDown({
      target: nonRowTarget,
      key: "ArrowDown",
      preventDefault,
    } as unknown as React.KeyboardEvent<HTMLUListElement>);
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
