import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDraggable } from "@dnd-kit/core";
import { CloseIcon } from "../../components/ui/icons";
import { useAppStore } from "../../store";
import type { TabGroup } from "../../lib/tab-groups";
import type { WorkspaceTab } from "../../store/types";
import { useTabDrag } from "./tab-drag/tab-drag";
import { useTabPointerActivation } from "./tab-drag/use-tab-pointer-activation";

/**
 * One tab in a pane's own strip. It is the drag source and the rename editor;
 * clicking it waits for pointer-up, because a press that becomes a drag must
 * not bring a hidden tab forward before it is dragged out of its pane.
 */
export function GroupTab({
  tab,
  group,
  label,
  active,
  isLast,
}: {
  tab: WorkspaceTab;
  group: TabGroup;
  label: string;
  active: boolean;
  isLast: boolean;
}) {
  const { t } = useTranslation();
  const renameTab = useAppStore((state) => state.renameTab);
  const requestCloseTab = useAppStore((state) => state.requestCloseTab);
  const dirty = useAppStore((state) => state.dirtyTabs[tab.id] ?? false);
  const [renaming, setRenaming] = useState<{ draft: string; initial: string } | null>(null);
  const renameCancelled = useRef(false);

  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: tab.id,
    data: {
      kind: "tab",
      tabId: tab.id,
      groupId: group.id,
      session: group.session,
      label,
    },
    disabled: renaming !== null,
  });

  const drag = useTabDrag();
  const dropBefore =
    drag.target?.kind === "strip" &&
    drag.target.groupId === group.id &&
    drag.target.beforeTabId === tab.id;
  const dropAfter =
    drag.target?.kind === "strip" &&
    drag.target.groupId === group.id &&
    drag.target.beforeTabId === null &&
    isLast;

  const activate = useTabPointerActivation(
    () => useAppStore.getState().focusTab(tab.id),
    renaming !== null,
  );
  const dragOnPointerDown = listeners?.onPointerDown as
    | ((event: React.PointerEvent<Element>) => void)
    | undefined;

  function commitRename(): void {
    if (renameCancelled.current || !renaming) return;
    setRenaming(null);
    const next = renaming.draft.trim();
    // Unchanged means "no name of mine": the default is a translated string, and
    // storing it would freeze the label into the language of the moment.
    if (next === renaming.initial.trim()) return;
    renameTab(tab.id, next === "" ? null : next);
  }

  function cancelRename(): void {
    renameCancelled.current = true;
    setRenaming(null);
  }

  return (
    <div
      ref={setNodeRef}
      role="tab"
      aria-selected={active}
      className={`session-tab ${active ? "session-tab--active" : ""}`}
      data-tab-id={tab.id}
      data-group-id={group.id}
      data-drop-before={dropBefore ? "true" : undefined}
      data-drop-after={dropAfter ? "true" : undefined}
      data-dragging={isDragging || drag.draggingTabId === tab.id ? "true" : undefined}
      onPointerDown={(event) => activate(event, dragOnPointerDown)}
      onMouseDown={(event) => {
        // A tab press must not take focus from the terminal: a drag that splits
        // the already-focused tab keeps the same `focused` prop, so nothing else
        // would ask xterm for the keyboard back. This is on the tab, not on the
        // strip, because the empty part of a top-row strip is the window's drag
        // region and cancelling its default would stop the window moving.
        if (event.button === 0) event.preventDefault();
        // Middle click closes, like every terminal emulator does — and like the
        // × does: a file tab with unsaved edits is a question.
        if (event.button === 1) {
          event.preventDefault();
          requestCloseTab(tab.id);
        }
      }}
    >
      {renaming ? (
        <input
          className="session-tab__rename"
          value={renaming.draft}
          autoFocus
          spellCheck={false}
          aria-label={t("topbar.terminalRename", "重命名终端")}
          data-testid="tab-rename"
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setRenaming({ ...renaming, draft: event.target.value })}
          // The keyboard and the pointer belong to the field while it is open:
          // the tab treats middle click as "close" and drag as "move".
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => {
            event.stopPropagation();
            if (event.button === 1) event.preventDefault();
          }}
          onDoubleClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            // An Enter that is picking an IME candidate is not a commit.
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (event.key === "Enter") commitRename();
            else if (event.key === "Escape") cancelRename();
          }}
          onBlur={commitRename}
        />
      ) : (
        /* The path is the tooltip for a file: the strip truncates the name, and
           where the file lives is the thing a name cannot say. A dot says "not
           on the runtime yet" — the pane puts it in words. A renamed shell shows
           its own name here, since truncation has to be recoverable. */
        <span
          className="truncate"
          title={tab.kind === "file" ? tab.path : (tab.customTitle ?? undefined)}
          onDoubleClick={
            tab.kind === "shell"
              ? (event) => {
                  event.stopPropagation();
                  renameCancelled.current = false;
                  setRenaming({ draft: label, initial: label });
                }
              : undefined
          }
        >
          {dirty ? <span className="session-tab__dot" aria-hidden="true" /> : null}
          {label}
        </span>
      )}
      <button
        type="button"
        className="session-tab__close"
        aria-label={
          // A tab with a name of its own is closed by that name — the number is
          // not what the reader just called it.
          tab.kind === "file"
            ? t("topbar.tabCloseNamed", "关闭 {{name}}", { name: tab.name })
            : tab.customTitle
              ? t("topbar.tabCloseNamed", "关闭 {{name}}", { name: tab.customTitle })
              : t("topbar.terminalClose", "关闭终端 {{index}}", { index: tab.ordinal })
        }
        title={
          tab.kind === "file"
            ? t("topbar.fileTabCloseTitle", "关闭文件")
            : t("topbar.terminalCloseTitle", "关闭终端")
        }
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => {
          // The strip's mousedown guard stops the tab from taking focus; this
          // button stops the event before that guard sees it, so it has to do
          // the same or closing a tab would blur the terminal beside it.
          if (event.button === 0) event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.stopPropagation();
          requestCloseTab(tab.id);
        }}
      >
        <CloseIcon />
      </button>
    </div>
  );
}
