import { useTranslation } from "react-i18next";
import { Button, IconButton } from "../../components/ui/Button";
import {
  ChevronRightIcon,
  CloseIcon,
  FileIcon,
  FolderClosedIcon,
  FolderOpenIcon,
  LinkIcon,
  SyncIcon,
} from "../../components/ui/icons";
import { Callout, EmptyState } from "../../components/ui/Notice";
import { formatSize } from "../../lib/format";
import { TREE_ROOT, type Listing, type Row } from "./file-tree";

/** How deep a row indents, and how far that goes before it stops growing. */
const INDENT_PX = 12;
const INDENT_DEPTH_CAP = 6;

export interface FileTreeListProps {
  treeRef: React.RefObject<HTMLUListElement | null>;
  rows: Row[];
  listings: Record<string, Listing>;
  focused: string | null;
  activeFilePath: string | null;
  resolving: string | null;
  dropDir: string | null;
  showFileSizes: boolean;
  firstFocusable: string | null;
  newEntry: { parent: string; kind: "file" | "folder" } | null;
  entryName: string;
  newEntryInputRef: React.RefObject<HTMLInputElement | null>;
  busy: string | null;
  kindOf: (row: Row) => "dir" | "file" | "link";
  onKeyDown: (event: React.KeyboardEvent<HTMLUListElement>) => void;
  onFocusRow: (path: string) => void;
  onActivateRow: (event: React.MouseEvent, row: Row) => void;
  onOpenRowMenu: (event: React.MouseEvent, row: Row | null) => void;
  onRowDragOver: (event: React.DragEvent, row: Row) => void;
  onRowDragLeave: (row: Row) => void;
  onRowDrop: (event: React.DragEvent, row: Row) => void;
  onEntryNameChange: (value: string) => void;
  onSubmitEntry: () => void;
  onCancelEntry: () => void;
  onRetryListing: (path: string) => void;
}

/**
 * Renders the virtual file tree list, row nodes, twisty icons, file sizes, inline forms, and errors/empty states.
 */
export function FileTreeList({
  treeRef,
  rows,
  listings,
  focused,
  activeFilePath,
  resolving,
  dropDir,
  showFileSizes,
  firstFocusable,
  newEntry,
  entryName,
  newEntryInputRef,
  busy,
  kindOf,
  onKeyDown,
  onFocusRow,
  onActivateRow,
  onOpenRowMenu,
  onRowDragOver,
  onRowDragLeave,
  onRowDrop,
  onEntryNameChange,
  onSubmitEntry,
  onCancelEntry,
  onRetryListing,
}: FileTreeListProps) {
  const { t } = useTranslation();

  const entryPlaceholder =
    newEntry?.kind === "file"
      ? t("files.fileNamePlaceholder", "新文件名称")
      : t("files.folderNamePlaceholder", "新文件夹名称");

  return (
    <ul
      className="file-list"
      role="tree"
      aria-label={t("files.treeLabel", "运行时文件")}
      ref={treeRef}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest(".file-row, .new-entry-form, .file-empty, .file-error")) return;
        onOpenRowMenu(event, null);
      }}
    >
      {rows.map((row) => {
        const listing = listings[row.path];
        const isRoot = row.path === TREE_ROOT;
        const kind = kindOf(row);
        const isDir = kind === "dir";
        const isFile = kind === "file";
        const isActive = activeFilePath === row.path;
        const isResolving = resolving === row.path;
        // A directory being read, or a link being resolved, says so in the
        // icon column; the row keeps its name and its place.
        const isLoading = Boolean(listing?.loading) || isResolving;
        const title = isRoot
          ? t("files.rootLabel", "运行时根目录")
          : isDir
            ? row.open
              ? t("files.closeDir", "收起目录")
              : t("files.openDir", "进入目录")
            : kind === "link"
              ? t("files.openLink", "双击打开链接")
              : t("files.openFile", "双击打开");

        const icon = isLoading ? (
          <SyncIcon size={14} className="spin-sync" />
        ) : row.entry?.type === "link" ? (
          <LinkIcon size={14} />
        ) : isDir ? (
          row.open ? <FolderOpenIcon size={14} /> : <FolderClosedIcon size={14} />
        ) : (
          <FileIcon size={14} />
        );

        const inner = (
          <>
            <span className="file-row__twisty" aria-hidden="true">
              {isDir && !isRoot ? (
                <ChevronRightIcon size={12} className={row.open ? "file-row__chevron--open" : undefined} />
              ) : null}
            </span>
            <span className="file-row__icon" aria-hidden="true">
              {icon}
            </span>
            {/* The root shows its own path: with no breadcrumb above it,
                this row is how the tree says what it is rooted at. */}
            <span className={`file-row__name truncate${isRoot ? " file-row__name--mono" : ""}`}>
              {isRoot ? TREE_ROOT : row.name}
            </span>
          </>
        );

        return (
          <li key={row.path} role="none">
            <div
              className={`file-row ${dropDir === row.path ? "file-row--drop" : ""} ${
                focused === row.path ? "file-row--focused" : ""
              } ${isActive ? "file-row--active" : ""} ${isRoot ? "file-row--root" : ""}`}
              style={{ paddingLeft: `${Math.min(row.depth, INDENT_DEPTH_CAP) * INDENT_PX}px` }}
              onDragOver={(event) => onRowDragOver(event, row)}
              onDragLeave={() => onRowDragLeave(row)}
              onDrop={(event) => onRowDrop(event, row)}
              onContextMenu={(event) => onOpenRowMenu(event, row)}
            >
              {isRoot ? (
                <div
                  className="file-row__row file-row__row--static"
                  role="treeitem"
                  aria-level={1}
                  aria-expanded={true}
                  aria-selected={focused === TREE_ROOT}
                  aria-busy={isLoading ? true : undefined}
                  data-path={TREE_ROOT}
                  tabIndex={
                    focused === TREE_ROOT || (focused === null && firstFocusable === TREE_ROOT)
                      ? 0
                      : -1
                  }
                  title={title}
                  onFocus={() => onFocusRow(TREE_ROOT)}
                >
                  {inner}
                </div>
              ) : (
                <button
                  type="button"
                  className="file-row__row"
                  role="treeitem"
                  aria-level={row.depth + 1}
                  aria-expanded={isDir ? row.open : undefined}
                  aria-selected={focused === row.path}
                  aria-current={isActive ? "true" : undefined}
                  aria-busy={isLoading ? true : undefined}
                  data-path={row.path}
                  tabIndex={
                    focused === row.path || (focused === null && row.path === firstFocusable)
                      ? 0
                      : -1
                  }
                  title={title}
                  onFocus={() => onFocusRow(row.path)}
                  onClick={(event) => onActivateRow(event, row)}
                >
                  {inner}
                </button>
              )}

              {showFileSizes && isFile && row.entry?.type === "file" && (
                <span className="file-size">{formatSize(row.entry.size)}</span>
              )}
            </div>

            {newEntry?.parent === row.path && (
              <form
                className="new-entry-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  onSubmitEntry();
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  event.preventDefault();
                  event.stopPropagation();
                  onCancelEntry();
                }}
              >
                <input
                  ref={newEntryInputRef}
                  className="input"
                  data-testid="new-entry-name"
                  aria-label={entryPlaceholder}
                  value={entryName}
                  onChange={(event) => onEntryNameChange(event.target.value)}
                  placeholder={entryPlaceholder}
                  autoFocus
                />
                <Button
                  variant="primary"
                  size="sm"
                  type="submit"
                  data-testid="new-entry-create"
                  disabled={!entryName.trim() || busy !== null}
                >
                  {t("files.create", "创建")}
                </Button>
                <IconButton
                  variant="ghost"
                  size="sm"
                  label={t("files.cancel", "取消")}
                  onClick={onCancelEntry}
                >
                  <CloseIcon />
                </IconButton>
              </form>
            )}

            {row.open && listing && !listing.loading && listing.error && (
              <div
                className="file-error"
                style={{ paddingLeft: `${Math.min(row.depth + 1, INDENT_DEPTH_CAP) * INDENT_PX}px` }}
              >
                <Callout tone="danger">
                  <span>{listing.error}</span>
                  <Button variant="link" size="sm" onClick={() => onRetryListing(row.path)}>
                    {t("files.retry", "重试")}
                  </Button>
                </Callout>
              </div>
            )}
            {row.open && listing && !listing.loading && !listing.error && listing.entries.length === 0 && (
              isRoot ? (
                <div className="file-empty" onContextMenu={(event) => onOpenRowMenu(event, row)}>
                  <EmptyState title={t("files.emptyRoot", "运行时还没有文件")}>
                    {t("files.emptyRootHint", "拖入文件，或在终端中创建。")}
                  </EmptyState>
                </div>
              ) : (
                <div
                  className="file-empty file-empty--nested"
                  style={{ paddingLeft: `${Math.min(row.depth + 1, INDENT_DEPTH_CAP) * INDENT_PX}px` }}
                  onContextMenu={(event) => onOpenRowMenu(event, row)}
                >
                  <EmptyState title={t("files.empty", "当前目录为空")}>
                    {t("files.emptyDirHint", "右键可上传文件，或新建文件、文件夹。")}
                  </EmptyState>
                </div>
              )
            )}
          </li>
        );
      })}
    </ul>
  );
}
