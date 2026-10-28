import { useCallback, useEffect, useState } from "react";
import { parentPath } from "../../lib/format";
import { TREE_ROOT, type Row } from "./file-tree";

export interface UseFileTreeKeyboardOptions {
  rows: Row[];
  treeRef: React.RefObject<HTMLUListElement | null>;
  kindOf: (row: Row) => "dir" | "file" | "link";
  toggle: (path: string) => void;
  loadThenOpen: (path: string) => void;
  openRowMenuAt?: (row: Row) => void;
  rootPath?: string;
}

export interface UseFileTreeKeyboardResult {
  focused: string | null;
  setFocused: React.Dispatch<React.SetStateAction<string | null>>;
  firstFocusable: string | null;
  focusRow: (path: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLUListElement>) => void;
}

/**
 * Manages virtual tree keyboard navigation, focus maintenance, and scroll synchronization.
 */
export function useFileTreeKeyboard({
  rows,
  treeRef,
  kindOf,
  toggle,
  loadThenOpen,
  openRowMenuAt,
  rootPath = TREE_ROOT,
}: UseFileTreeKeyboardOptions): UseFileTreeKeyboardResult {
  const [focused, setFocused] = useState<string | null>(null);

  /**
   * Every drawn row is a keyboard stop, the root included: the root has no
   * activation action, but its context menu is where New File / New Folder at
   * the root live, so the keyboard needs a way to reach it.
   */
  const firstFocusable = rows[0]?.path ?? null;

  // A row can disappear under the caret (a delete, a collapse, a refresh). The
  // tree must keep one tab stop, or the keyboard cannot get back into it.
  useEffect(() => {
    if (focused === null) return;
    if (rows.some((row) => row.path === focused)) return;
    setFocused(firstFocusable);
  }, [focused, rows, firstFocusable]);

  const focusRow = useCallback(
    (path: string): void => {
      setFocused(path);
      const element = treeRef.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"]`);
      element?.focus();
      element?.scrollIntoView?.({ block: "nearest" });
    },
    [treeRef],
  );

  /** Arrow keys walk the drawn rows; the root is not one of them. */
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLUListElement>): void => {
      // The inline folder form and any menu inside the tree own their own keys.
      // Without this guard an arrow in the name field moves the selection.
      const target = event.target as HTMLElement;
      if (!target.closest(".file-row__row")) return;
      const row = rows.find((candidate) => candidate.path === focused);
      if (!row) return;

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const index = rows.findIndex((candidate) => candidate.path === row.path);
        const step = event.key === "ArrowDown" ? 1 : -1;
        const next = rows[Math.min(Math.max(index + step, 0), rows.length - 1)];
        if (next) focusRow(next.path);
        return;
      }
      if (event.key === "ArrowRight" && kindOf(row) === "dir") {
        event.preventDefault();
        if (row.open) {
          const at = rows.findIndex((candidate) => candidate.path === row.path);
          const child = rows[at + 1];
          if (child && child.depth > row.depth) focusRow(child.path);
        } else {
          loadThenOpen(row.path);
        }
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        // The root is always open and has no parent to go back to.
        if (row.path === rootPath) return;
        if (kindOf(row) === "dir" && row.open) {
          toggle(row.path);
          return;
        }
        const up = parentPath(row.path);
        if (up !== row.path) focusRow(up);
        return;
      }
      if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        const next = rows[event.key === "Home" ? 0 : rows.length - 1];
        if (next) focusRow(next.path);
        return;
      }
      if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
        event.preventDefault();
        openRowMenuAt?.(row);
      }
    },
    [focused, rows, kindOf, rootPath, loadThenOpen, toggle, openRowMenuAt, focusRow],
  );

  return {
    focused,
    setFocused,
    firstFocusable,
    focusRow,
    onKeyDown,
  };
}
