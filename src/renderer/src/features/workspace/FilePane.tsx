import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../lib/api";
import { messageOf } from "../../lib/api";
import { formatPercent, formatSize, localName, parentPath } from "../../lib/format";
import type { ConflictPolicy, RemoteEntry, TransferProgress } from "@shared/types";
import { Button } from "../../components/ui/Button";
import { Menu } from "../../components/ui/Menu";
import {
  ChevronRightIcon,
  FileIcon,
  FolderClosedIcon,
  FolderOpenIcon,
  LinkIcon,
  SyncIcon,
} from "../../components/ui/icons";
import { Callout } from "../../components/ui/Notice";
import { Dialog } from "../../app-shell/AppShell";
import { PanelDivider } from "../../components/ui/PanelDivider";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { PANEL_WIDTH } from "../../lib/panel-width";
import { childPath, isDirectoryRow, projectRows, type Listing, type Row } from "./file-tree";
import { makeRequestTokens } from "./request-tokens";
import { useAppStore } from "../../store";

/**
 * The runtime's filesystem over SFTP, as a tree.
 *
 * A tree rather than a list behind a breadcrumb, because the question this panel
 * answers is "where is that file in relation to this one" — and a listing that
 * replaces itself throws that away on every step. Folders open in place, their
 * siblings stay on screen, and one runtime's whole /content can be seen at once.
 *
 * What is open lives in the store (per session) so hiding the panel does not
 * fold the tree; what a directory contains lives here, loaded the first time it
 * is opened and kept when it closes — reopening a folder should not cost a round
 * trip for a listing nobody changed.
 *
 * An upload that would replace a file already on the runtime asks first: the
 * question is the only thing standing between a re-upload and a silently
 * destroyed copy, and it is asked once for the whole batch rather than per file.
 */

/** Where the tree starts. The shell lands here too (`cd /content`). */
const TREE_ROOT = "/content";

/** How deep a row indents, and how far that goes before it stops growing. */
const INDENT_PX = 14;
const INDENT_DEPTH_CAP = 6;

/** Opens a folder after the pointer rests on it, the way a file manager does. */
const HOVER_EXPAND_MS = 600;

/** An upload waiting on the answer to "these names are taken". */
interface ConflictAsk {
  localPaths: string[];
  remoteDir: string;
  names: string[];
}

export function FilePane({
  session,
  visible,
  onTransferCount,
}: {
  session: string;
  /** The session the user is looking at; a parked pane keeps its tree parked. */
  visible: boolean;
  onTransferCount?: (active: number) => void;
}) {
  const { t } = useTranslation();
  const [listings, setListings] = useState<Record<string, Listing>>({});
  const [transfers, setTransfers] = useState<TransferProgress[]>([]);
  const [dragOver, setDragOver] = useState(false);
  /** The directory row the pointer is over, which is where a drop would land. */
  const [dropDir, setDropDir] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictAsk | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [creatingIn, setCreatingIn] = useState<string | null>(null);
  const [folderName, setFolderName] = useState("");
  const expanded = useAppStore((state) => state.expandedDirs[session]);
  const toggleDirectory = useAppStore((state) => state.toggleDirectory);
  const forgetDirectory = useAppStore((state) => state.forgetDirectory);
  const openFileTab = useAppStore((state) => state.openFileTab);
  const width = useAppStore((state) => state.panelWidths.files);
  const setPanelWidth = useAppStore((state) => state.setPanelWidth);
  const panelRef = useRef<HTMLElement | null>(null);
  const treeRef = useRef<HTMLUListElement | null>(null);
  const hoverTimer = useRef<number | null>(null);

  const open = useMemo(() => new Set(expanded ?? []), [expanded]);

  /**
   * Publishes this panel's rendered width for the seam the top bar draws above
   * it — the same line this panel's own left border draws in the body.
   *
   * Measured for the same reason the rail measures: the rendered width is
   * whatever the layout gave it. A parked pane is out of the layout and reports
   * zero, which is not a width to publish, so it is ignored and the visible
   * panel's value stands.
   */
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const publish = (): void => {
      const { width: rendered } = panel.getBoundingClientRect();
      if (rendered === 0) return;
      document.documentElement.style.setProperty("--files-width", `${rendered}px`);
    };
    const observer = new ResizeObserver(publish);
    observer.observe(panel);
    publish();
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--files-width");
    };
  }, []);

  /** Read at call time rather than captured; the parent rebuilds these closures. */
  const latest = useRef({ onTransferCount });
  useEffect(() => {
    latest.current = { onTransferCount };
  });

  const pending = transfers.filter((transfer) => !transfer.done).length;
  useEffect(() => {
    latest.current.onTransferCount?.(pending);
  }, [pending]);

  // A browser that goes away is transferring nothing as far as the status bar
  // is concerned; without this the count outlives the panel that reported it.
  useEffect(
    () => () => {
      latest.current.onTransferCount?.(0);
    },
    [],
  );

  /** Reads one directory, keeping whatever was there until the answer lands. */
  const tokens = useRef(makeRequestTokens());
  const load = useCallback(
    async (path: string): Promise<void> => {
      const current = tokens.current.begin(path);
      setListings((previous) => ({
        ...previous,
        [path]: { entries: previous[path]?.entries ?? [], loading: true, error: null },
      }));
      try {
        const entries = await api.listDirectory(session, path);
        // Two reads of one folder can be in flight at once — each opens its own
        // channel — and the slower one is not necessarily the older one. See
        // `request-tokens`: a superseded answer must not land.
        if (!current()) return;
        setListings((previous) => ({ ...previous, [path]: { entries, loading: false, error: null } }));
      } catch (cause) {
        if (!current()) return;
        setListings((previous) => ({
          ...previous,
          [path]: { entries: previous[path]?.entries ?? [], loading: false, error: messageOf(cause) },
        }));
      }
    },
    [session],
  );

  // The root, and any directory the store says is open but has no listing yet —
  // including after a hiding-and-showing, which is why this is not in `toggle`.
  useEffect(() => {
    if (!visible) return;
    const wanted = [TREE_ROOT, ...open];
    const missing = wanted.filter((path) => listings[path] === undefined);
    if (missing.length === 0) return;
    for (const path of missing) void load(path);
  }, [visible, open, listings, load]);

  /**
   * A save in a file tab writes to the runtime behind this tree's back, and the
   * one thing the tree shows about a file is its size. The store carries the
   * directory the write landed in; re-reading that one listing is enough.
   */
  const fileWrite = useAppStore((state) => state.fileWrites[session]);
  const lastWrite = useRef(0);
  useEffect(() => {
    if (!fileWrite || fileWrite.revision === lastWrite.current) return;
    lastWrite.current = fileWrite.revision;
    void load(fileWrite.dir);
  }, [fileWrite, load]);

  useEffect(() => {
    return api.onTransferProgress((progress) => {
      setTransfers((current) => {
        const next = current.filter((item) => item.id !== progress.id);
        next.push(progress);
        return next.slice(-6);
      });
    });
  }, []);

  /** The rows to draw: the projection of the open directories, in order. */
  const rows = useMemo(() => projectRows(listings, open, TREE_ROOT), [listings, open]);

  /** The rows a click or an arrow key may land on, in the order they are drawn. */
  const focusable = rows;

  /**
   * Opens what is closed and refreshes what is open — the root and every open
   * directory. Deeper folders are left alone: an unchanged subtree showing a
   * file the shell just wrote is worth a round trip, a tree nobody touched is
   * not.
   */
  async function refresh(): Promise<void> {
    for (const path of [TREE_ROOT, ...open]) {
      if (listings[path] === undefined) continue;
      void load(path);
    }
  }

  function toggle(path: string): void {
    toggleDirectory(session, path);
    if (!open.has(path) && listings[path] === undefined) void load(path);
  }

  function focusRow(path: string): void {
    setFocused(path);
    const element = treeRef.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"]`);
    element?.focus();
  }

  /**
   * One click selects, two open.
   *
   * Clicking a file no longer downloads it: the second click of a
   * double-click arrives with `detail === 2` and is the one that opens the
   * file as a tab, while the first (`detail === 1`) has to stay quiet —
   * otherwise a native save dialog would open under the tab the user meant.
   * Keyboard activation arrives as `detail === 0` and counts as the whole
   * gesture, which is what makes `Enter` on a row work.
   *
   * A folder is the other way round: its first click already toggled, so the
   * second click of a file-manager double-click is swallowed rather than
   * toggling it back shut.
   */
  function activateRow(event: React.MouseEvent, row: Row, isDir: boolean): void {
    if (isDir) {
      if (event.detail === 2) return;
      if (row.open && row.path !== TREE_ROOT) toggle(row.path);
      else loadThenOpen(row.path);
      return;
    }
    if (event.detail === 1 || !row.entry) return;
    openFileTab(session, row.path, row.entry.name);
  }

  /** Arrow keys over the drawn rows, which is the whole of the tree's keyboard. */
  function onKeyDown(event: React.KeyboardEvent<HTMLUListElement>): void {
    const current = rows.findIndex((row) => row.path === focused);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      const next = focusable[Math.min(Math.max(current + step, 0), focusable.length - 1)];
      if (next) focusRow(next.path);
      return;
    }
    if (current < 0) return;
    const row = rows[current]!;
    if (event.key === "ArrowRight" && row.entry?.type !== "file") {
      event.preventDefault();
      if (open.has(row.path) || row.path === TREE_ROOT) {
        const child = rows[current + 1];
        if (child) focusRow(child.path);
      } else {
        toggle(row.path);
      }
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (open.has(row.path) && row.path !== TREE_ROOT) {
        toggle(row.path);
        return;
      }
      const up = parentPath(row.path);
      if (up !== row.path) focusRow(up === "" ? TREE_ROOT : up);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const first = focusable[event.key === "Home" ? 0 : focusable.length - 1];
      if (first) focusRow(first.path);
    }
  }

  /**
   * Asks whether any of these would replace something, and uploads straight away
   * when none would. Only the names, not the whole paths, are shown: the
   * directory is the row the drop landed on.
   */
  async function beginUpload(localPaths: string[], remoteDir: string): Promise<void> {
    if (localPaths.length === 0) return;
    setBusy("upload");
    try {
      const taken = await api.statPaths(
        session,
        localPaths.map((local) => childPath(remoteDir, localName(local))),
      );
      if (taken.length > 0) {
        setConflict({ localPaths, remoteDir, names: taken.map((entry) => localName(entry.path)) });
        return;
      }
      await runUpload(localPaths, remoteDir, "replace");
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(null);
    }
  }

  const [error, setError] = useState<string | null>(null);

  async function runUpload(
    localPaths: string[],
    remoteDir: string,
    policy: ConflictPolicy,
  ): Promise<void> {
    setBusy("upload");
    setConflict(null);
    try {
      await api.upload({ session, localPaths, remoteDir, conflict: policy });
      setError(null);
    } catch (cause) {
      // A transfer that started reports itself on its row; reaching here means
      // the runtime never took the request at all.
      setError(messageOf(cause));
    } finally {
      setBusy(null);
      await refresh();
    }
  }

  async function pickAndUpload() {
    try {
      await beginUpload(
        await api.pickUploadTargets(t("files.uploadDialogTitle", "选择要上传的文件")),
        TREE_ROOT,
      );
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  async function pickAndUploadFolder() {
    try {
      await beginUpload(
        await api.pickUploadFolder(t("files.uploadFolderTitle", "选择要上传的文件夹")),
        TREE_ROOT,
      );
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  async function download(entry: RemoteEntry, path: string) {
    setBusy(`download:${path}`);
    try {
      await api.download(session, path, entry.name, t("files.saveDialogTitle", "保存到本地"));
      setError(null);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(null);
    }
  }

  async function downloadDirectory(entry: RemoteEntry, path: string) {
    setBusy(`download:${path}`);
    try {
      await api.downloadFolder(session, path, entry.name, t("files.folderDialogTitle", "选择保存位置"));
      setError(null);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(null);
    }
  }

  async function remove(entry: RemoteEntry, path: string) {
    const extra = entry.type === "dir" ? t("files.deleteConfirmDir", "（整个目录）") : "";
    if (!window.confirm(t("files.deleteConfirm", "删除 {{name}}{{extra}}？此操作不可撤销。", { name: entry.name, extra }))) {
      return;
    }
    setBusy(`delete:${path}`);
    try {
      await api.deletePath(session, path);
      // A folder that is gone cannot be open: its subtree would be a row of
      // nothing, and reopening it would show a listing that does not exist.
      forgetDirectory(session, path);
      setListings((current) => {
        const next = { ...current };
        delete next[path];
        for (const key of Object.keys(next)) {
          if (key.startsWith(`${path}/`)) delete next[key];
        }
        return next;
      });
      await load(parentPath(path) || TREE_ROOT);
      setError(null);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(null);
    }
  }

  async function createFolder(parent: string) {
    const name = folderName.trim();
    if (!name) return;
    setBusy("mkdir");
    try {
      await api.makeDirectory(session, childPath(parent, name));
      setFolderName("");
      setCreatingIn(null);
      await load(parent);
      setError(null);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(null);
    }
  }

  /** Dropped files land in the row under the pointer, or at the root. */
  async function onDropInto(event: React.DragEvent, remoteDir: string): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
    setDropDir(null);
    if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
    const paths = Array.from(event.dataTransfer.files)
      .map((file) => api.pathForFile(file))
      .filter(Boolean);
    await beginUpload(paths, remoteDir);
  }

  /**
   * Over a closed folder: open it after a moment, so a drag can land inside
   * without a detour. Over an open one, nothing to do.
   */
  function armHoverExpand(path: string): void {
    if (open.has(path) || hoverTimer.current !== null) return;
    hoverTimer.current = window.setTimeout(() => {
      hoverTimer.current = null;
      if (!open.has(path)) void loadThenOpen(path);
    }, HOVER_EXPAND_MS);
  }

  function loadThenOpen(path: string): void {
    toggleDirectory(session, path);
    if (listings[path] === undefined) void load(path);
  }

  function cancelHoverExpand(): void {
    if (hoverTimer.current !== null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }

  return (
    <aside
      className={`files-panel ${dragOver && dropDir === null ? "drag-over" : ""}`}
      ref={panelRef}
      style={{ width, minWidth: PANEL_WIDTH.files.min }}
      hidden={!visible}
      inert={!visible}
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => {
        setDragOver(false);
        cancelHoverExpand();
      }}
      onDrop={(event) => void onDropInto(event, TREE_ROOT)}
    >
      <PanelDivider
        side="files"
        edge="left"
        label={t("files.widthLabel", "文件面板宽度")}
        width={width}
        onCommit={(next) => setPanelWidth("files", next)}
      />
      <div className="pane__head">
        <span className="pane__title">{t("files.title", "文件")}</span>
        <span className="pane__actions">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refresh()}
            disabled={listings[TREE_ROOT]?.loading ?? false}
          >
            {t("files.refresh", "刷新")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            data-testid="new-folder"
            onClick={() => {
              setCreatingIn(creatingIn === TREE_ROOT ? null : TREE_ROOT);
              setFolderName("");
            }}
            disabled={busy !== null}
          >
            {t("files.newFolder", "新建")}
          </Button>
          <Button variant="primary" size="sm" onClick={pickAndUpload} disabled={busy !== null}>
            {busy === "upload" ? t("files.uploading", "上传中…") : t("files.upload", "上传")}
          </Button>
        </span>
      </div>

      {error && <p className="error pane-error">{error}</p>}

      {/*
        One list, with depth on the row rather than nesting in the DOM: the tree
        is a projection, so a row's place in it is a number.
      */}
      <ul
        className="file-list"
        role="tree"
        aria-label={t("files.treeLabel", "运行时文件")}
        ref={treeRef}
        onKeyDown={onKeyDown}
      >
        {rows.map((row) => {
          const listing = listings[row.path];
          const isRoot = row.path === TREE_ROOT;
          const isDir = isDirectoryRow(row);
          return (
            <li key={row.path}>
              <div
                className={`file-row ${dropDir === row.path ? "file-row--drop" : ""} ${
                  focused === row.path ? "file-row--focused" : ""
                }`}
                style={{ paddingLeft: `calc(var(--space-3) + ${Math.min(row.depth, INDENT_DEPTH_CAP) * INDENT_PX}px)` }}
                onDragOver={(event) => {
                  if (!isDir) return;
                  event.preventDefault();
                  event.stopPropagation();
                  setDropDir(row.path);
                  armHoverExpand(row.path);
                }}
                onDragLeave={() => {
                  setDropDir(null);
                  cancelHoverExpand();
                }}
                onDrop={isDir ? (event) => void onDropInto(event, row.path) : undefined}
              >
                <button
                  type="button"
                  className="file-row__row"
                  role="treeitem"
                  aria-level={row.depth + 1}
                  aria-expanded={isDir && !isRoot ? row.open : undefined}
                  aria-selected={focused === row.path}
                  // The spinner in the icon column says "being read" to the eye;
                  // this says it to everything else.
                  aria-busy={listing?.loading ? true : undefined}
                  data-path={row.path}
                  tabIndex={focused === row.path || (focused === null && isRoot) ? 0 : -1}
                  title={isDir ? t("files.openDir", "进入目录") : t("files.openFile", "双击打开")}
                  onFocus={() => setFocused(row.path)}
                  onClick={(event) => activateRow(event, row, isDir)}
                >
                  <span className={`file-row__twisty ${isDir && !isRoot ? "" : "file-row__twisty--empty"}`} aria-hidden="true">
                    {isDir && !isRoot ? (
                      <ChevronRightIcon size={12} className={row.open ? "file-row__chevron--open" : undefined} />
                    ) : null}
                  </span>
                  <span className="file-row__icon" aria-hidden="true">
                    {/* A folder being read says so in its own icon column: the
                        row keeps its name and its place, and the state shows
                        without pointing at it. */}
                    {listing?.loading ? (
                      <SyncIcon size={14} className="spin-sync" />
                    ) : isDir ? (
                      row.open ? <FolderOpenIcon size={14} /> : <FolderClosedIcon size={14} />
                    ) : row.entry?.type === "link" ? (
                      <LinkIcon size={14} />
                    ) : (
                      <FileIcon size={14} />
                    )}
                  </span>
                  {/* The root shows its own path: with no breadcrumb above it,
                      this row is how the tree says what it is rooted at. */}
                  <span className="truncate">{isRoot ? TREE_ROOT : row.name}</span>
                </button>

                <span className="file-size">
                  {row.entry?.type === "file" ? formatSize(row.entry.size) : ""}
                </span>

                {/* One trigger, and only while the row is pointed at: a button on
                    every row is what made a directory of files unreadable. */}
                <span className="file-actions">
                  <Menu
                    label={t("files.menuLabel", "{{name}} 的操作", { name: isRoot ? TREE_ROOT : row.name })}
                    items={[
                      ...(row.entry?.type === "file"
                        ? [
                            {
                              label: t("files.open", "打开"),
                              onSelect: () => openFileTab(session, row.path, row.entry!.name),
                            },
                          ]
                        : []),
                      ...(isDir
                        ? [
                            {
                              label: t("files.newFolderHere", "在此新建"),
                              disabled: busy !== null,
                              onSelect: () => {
                                setCreatingIn(creatingIn === row.path ? null : row.path);
                                setFolderName("");
                                loadThenOpen(row.path);
                              },
                            },
                          ]
                        : []),
                      ...(row.entry?.type === "link" || isRoot
                        ? []
                        : [
                            {
                              label: isDir
                                ? t("files.downloadFolder", "下载文件夹")
                                : t("files.download", "下载"),
                              disabled: busy === `download:${row.path}`,
                              onSelect: () =>
                                isDir
                                  ? void downloadDirectory(row.entry!, row.path)
                                  : void download(row.entry!, row.path),
                            },
                          ]),
                      ...(isRoot
                        ? []
                        : [
                            {
                              label: t("files.delete", "删除"),
                              danger: true,
                              disabled: busy === `delete:${row.path}`,
                              onSelect: () => void remove(row.entry!, row.path),
                            },
                          ]),
                    ]}
                  />
                </span>
              </div>

              {creatingIn === row.path && (
                <form
                  className="folder-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void createFolder(row.path);
                  }}
                >
                  <input
                    className="input"
                    data-testid="folder-name"
                    value={folderName}
                    onChange={(event) => setFolderName(event.target.value)}
                    placeholder={t("files.folderNamePlaceholder", "新文件夹名称")}
                    autoFocus
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    type="submit"
                    data-testid="folder-create"
                    disabled={!folderName.trim() || busy !== null}
                  >
                    {t("files.create", "创建")}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setCreatingIn(null)}>
                    {t("files.cancel", "取消")}
                  </Button>
                </form>
              )}

              {row.open && listing && !listing.loading && listing.error && (
                <p className="error pane-error">{listing.error}</p>
              )}
              {row.open && listing && !listing.loading && !listing.error && listing.entries.length === 0 && !isRoot && (
                <p className="hint pane-error">{t("files.empty", "空目录")}</p>
              )}
            </li>
          );
        })}
      </ul>

      {transfers.length > 0 && (
        <div className="transfers">
          {transfers.map((transfer) => (
            <div key={transfer.id} className="transfer">
              <div className="transfer__line">
                <span className="truncate">
                  {transfer.direction === "upload" ? "↑" : "↓"} {transfer.name}
                  {transfer.files ? ` (${transfer.files.done}/${transfer.files.total})` : ""}
                </span>
                <span className="row" style={{ gap: "var(--space-2)", flexShrink: 0 }}>
                  <span
                    className={`transfer__state ${
                      transfer.error ? "transfer__state--error" : transfer.done ? "transfer__state--ok" : ""
                    }`}
                  >
                    {transfer.error
                      ? transfer.error
                      : transfer.canceled
                        ? t("files.transferCanceled", "已取消")
                        : transfer.done
                          ? transfer.skipped
                            ? t("files.transferSkipped", "已跳过 {{count}} 项", { count: transfer.skipped })
                            : t("files.transferDone", "完成")
                          : formatPercent(transfer.transferred, transfer.total)}
                  </span>
                  {!transfer.done && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void api.cancelTransfer(transfer.id)}
                      data-testid={`cancel-${transfer.id}`}
                    >
                      {t("files.transferCancel", "取消")}
                    </Button>
                  )}
                </span>
              </div>
              {!transfer.done && (
                <ProgressBar ratio={transfer.total > 0 ? transfer.transferred / transfer.total : 0} />
              )}
            </div>
          ))}
        </div>
      )}

      <p className="hint drop-hint">
        {t("files.dropHint", "拖拽文件或文件夹至此处上传")}
        <Button variant="link" size="sm" onClick={pickAndUploadFolder} disabled={busy !== null}>
          {t("files.chooseFolder", "选择文件夹")}
        </Button>
      </p>

      {conflict && (
        <Dialog
          title={t("files.conflictTitle", "同名文件已存在")}
          onClose={() => setConflict(null)}
          footer={
            <div className="row">
              <Button
                variant="primary"
                onClick={() => void runUpload(conflict.localPaths, conflict.remoteDir, "replace")}
              >
                {t("files.conflictReplace", "替换")}
              </Button>
              <Button
                variant="outline"
                onClick={() => void runUpload(conflict.localPaths, conflict.remoteDir, "keepBoth")}
              >
                {t("files.conflictKeepBoth", "两个都留")}
              </Button>
              <Button
                variant="ghost"
                onClick={() => void runUpload(conflict.localPaths, conflict.remoteDir, "skip")}
              >
                {t("files.conflictSkip", "跳过")}
              </Button>
            </div>
          }
        >
          <Callout tone="warn">
            {t("files.conflictBody", "{{list}} 已经在这个目录里。", { list: conflict.names.join("、") })}
          </Callout>
          <p className="hint">{t("files.conflictHint", "所选做法对本次全部文件生效。")}</p>
        </Dialog>
      )}
    </aside>
  );
}
