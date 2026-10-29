import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../lib/api";
import { messageOf } from "../../lib/api";
import { localName, parentPath } from "../../lib/format";
import type { ConflictPolicy, RemoteEntry, TransferProgress } from "@shared/types";
import { Button, IconButton } from "../../components/ui/Button";
import { Menu, type MenuItem } from "../../components/ui/Menu";
import { ChevronUpIcon, MoreIcon, SyncIcon, UploadIcon } from "../../components/ui/icons";
import { Callout } from "../../components/ui/Notice";
import { Dialog } from "../../components/ui/Dialog";
import { PanelDivider } from "../../components/ui/PanelDivider";
import { PANEL_WIDTH } from "../../lib/panel-width";
import { childPath, projectRows, TREE_ROOT, type Listing, type Row } from "./file-tree";
import { makeRequestTokens } from "./request-tokens";
import { mergeTransferProgress } from "./transfer-list";
import { useAppStore } from "../../store";
import { selectActiveFilePath, useWorkspaceChrome } from "../../store/selectors";
import { useFileTreeKeyboard } from "./useFileTreeKeyboard";
import { FileTreeList } from "./FileTreeList";
import { FileTransferTray } from "./FileTransferTray";
import { FilePaneContextMenu, type MenuState } from "./FilePaneContextMenu";

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
 * A row has no permanent action button: right-clicking it is the gesture that
 * asks what can be done, the same way a file manager answers. The keyboard gets
 * the same menu from the context-menu key (or Shift+F10) on the focused row.
 *
 * An upload that would replace a file already on the runtime asks first: the
 * question is the only thing standing between a re-upload and a silently
 * destroyed copy, and it is asked once for the whole batch rather than per file.
 */

/** Opens a folder after the pointer rests on it, the way a file manager does. */
const HOVER_EXPAND_MS = 600;

/** An upload waiting on the answer to "these names are taken". */
interface ConflictAsk {
  localPaths: string[];
  remoteDir: string;
  names: string[];
}

/** A delete waiting on the confirmation dialog. */
interface DeleteAsk {
  entry: RemoteEntry;
  path: string;
}

/** What a link points at, once that has been asked. */
type LinkTarget = "file" | "dir";

/**
 * Which pane last wrote `--files-width`. One runtime's pane is visible at a
 * time, but every session keeps one mounted; a hidden pane unmounting must not
 * clear a value the visible pane published.
 */
let filesWidthOwner: string | null = null;

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
  const [deleteAsk, setDeleteAsk] = useState<DeleteAsk | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newEntry, setNewEntry] = useState<{ parent: string; kind: "file" | "folder" } | null>(null);
  const [entryName, setEntryName] = useState("");
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolvedLinks, setResolvedLinks] = useState<Record<string, LinkTarget>>({});
  const [error, setError] = useState<string | null>(null);

  const expanded = useAppStore((state) => state.expandedDirs[session]);
  const toggleDirectory = useAppStore((state) => state.toggleDirectory);
  const collapseAllDirectories = useAppStore((state) => state.collapseAllDirectories);
  const forgetDirectory = useAppStore((state) => state.forgetDirectory);
  const openFileTab = useAppStore((state) => state.openFileTab);
  const width = useAppStore((state) => state.panelWidths.files);
  const setPanelWidth = useAppStore((state) => state.setPanelWidth);
  const showFileSizes = useAppStore((state) => state.showFileSizes);
  const setShowFileSizes = useAppStore((state) => state.setShowFileSizes);
  const activeFilePath = useAppStore((state) => selectActiveFilePath(state, session));
  const settingsOpen = useAppStore((state) => state.settingsOpen);
  const setupOpen = useAppStore((state) => state.creation.open);
  const workspaceChrome = useWorkspaceChrome();

  const panelRef = useRef<HTMLElement | null>(null);
  const treeRef = useRef<HTMLUListElement | null>(null);
  const newEntryInput = useRef<HTMLInputElement | null>(null);
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
    if (!panel || !visible) return;
    const publish = (): void => {
      const { width: rendered } = panel.getBoundingClientRect();
      if (rendered === 0) return;
      filesWidthOwner = session;
      document.documentElement.style.setProperty("--files-width", `${rendered}px`);
    };
    const observer = new ResizeObserver(publish);
    observer.observe(panel);
    publish();
    return () => {
      observer.disconnect();
      // Only the pane that wrote the value may remove it: another session's
      // pane may already be visible with a value of its own.
      if (filesWidthOwner === session) {
        filesWidthOwner = null;
        document.documentElement.style.removeProperty("--files-width");
      }
    };
  }, [session, visible]);

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

  // Transfers are per session, and so is this list: a hidden session's pane is
  // mounted too, and without this filter it would show another runtime's work.
  useEffect(() => {
    return api.onTransferProgress((progress) => {
      if (progress.session !== session) return;
      setTransfers((current) => mergeTransferProgress(current, progress));
    });
  }, [session]);

  /** The rows to draw: the projection of the open directories, in order. */
  const rows = useMemo(() => projectRows(listings, open, TREE_ROOT), [listings, open]);

  // The context menu is portalled out of the panel. Hiding the pane, opening
  // settings or opening the setup console would leave it floating above the
  // layer that just took over.
  useEffect(() => {
    if (!visible || settingsOpen || setupOpen) setMenu(null);
  }, [visible, settingsOpen, setupOpen]);

  // Switching between "new file" and "new folder" for the same directory keeps
  // the same input node, so `autoFocus` alone would not fire again.
  useEffect(() => {
    if (newEntry) newEntryInput.current?.focus();
  }, [newEntry]);

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

  function loadThenOpen(path: string): void {
    toggleDirectory(session, path);
    if (listings[path] === undefined) void load(path);
  }

  /** What a row is, following a link's answer once the user has opened it. */
  function kindOf(row: Row): "dir" | "file" | "link" {
    if (row.entry === null || row.entry.type === "dir") return "dir";
    if (row.entry.type === "file") return "file";
    return resolvedLinks[row.path] ?? "link";
  }

  async function linkTarget(path: string): Promise<LinkTarget | null> {
    const cached = resolvedLinks[path];
    if (cached) return cached;
    const answer = await api.followPath(session, path);
    const target = answer?.type;
    if (target === "dir" || target === "file") {
      setResolvedLinks((current) => ({ ...current, [path]: target }));
      return target;
    }
    return null;
  }

  /** Opens a link as what it points at: a folder expands, a file gets a tab. */
  async function openLink(row: Row): Promise<void> {
    setResolving(row.path);
    try {
      const target = await linkTarget(row.path);
      if (target === "dir") {
        loadThenOpen(row.path);
      } else if (target === "file") {
        openFileTab(session, row.path, row.name);
      } else {
        setError(t("files.linkTargetMissing", "链接目标不存在"));
        return;
      }
      setError(null);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setResolving(null);
    }
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
   * toggling it back shut. A link is opened as what it points at, on the
   * gesture that would have opened a file.
   */
  function activateRow(event: React.MouseEvent, row: Row): void {
    const kind = kindOf(row);
    if (kind === "dir") {
      if (event.detail === 2) return;
      if (row.open) toggle(row.path);
      else loadThenOpen(row.path);
      return;
    }
    if (kind === "link") {
      if (event.detail === 1) return;
      void openLink(row);
      return;
    }
    if (event.detail === 1 || !row.entry) return;
    openFileTab(session, row.path, row.entry.name);
  }

  function openRowMenuAt(row: Row): void {
    const element = treeRef.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(row.path)}"]`);
    const rect = element?.getBoundingClientRect();
    focusRow(row.path);
    const active = document.activeElement;
    setMenu({
      point: { x: (rect?.left ?? 0) + 24, y: rect?.bottom ?? 0 },
      row,
      returnFocus: active instanceof HTMLElement ? active : null,
    });
  }

  const { focused, firstFocusable, focusRow, onKeyDown } = useFileTreeKeyboard({
    rows,
    treeRef,
    kindOf,
    toggle,
    loadThenOpen,
    openRowMenuAt,
  });

  function openRowMenu(event: React.MouseEvent, row: Row | null): void {
    event.preventDefault();
    event.stopPropagation();
    if (row) focusRow(row.path);
    const active = document.activeElement;
    setMenu({
      point: { x: event.clientX, y: event.clientY },
      row,
      returnFocus: active instanceof HTMLElement ? active : null,
    });
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
      // The upload target may be collapsed while its listing is still cached:
      // `refresh` only re-reads the root and open directories, and reopening
      // the folder later would otherwise show the listing from before the
      // upload. Re-read the one directory the upload definitely changed.
      if (remoteDir !== TREE_ROOT && !open.has(remoteDir)) await load(remoteDir);
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

  async function pickAndUploadTo(remoteDir: string) {
    try {
      await beginUpload(
        await api.pickUploadTargets(t("files.uploadDialogTitle", "选择要上传的文件")),
        remoteDir,
      );
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  async function pickAndUploadFolder(remoteDir = TREE_ROOT) {
    try {
      await beginUpload(
        await api.pickUploadFolder(t("files.uploadFolderTitle", "选择要上传的文件夹")),
        remoteDir,
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

  async function deleteRow(path: string): Promise<void> {
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
      setResolvedLinks((current) =>
        Object.fromEntries(
          Object.entries(current).filter(
            ([key]) => key !== path && !key.startsWith(`${path}/`),
          ),
        ),
      );
      await load(parentPath(path) || TREE_ROOT);
      setError(null);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(null);
    }
  }

  async function createFolder(parent: string, name: string): Promise<void> {
    setBusy("mkdir");
    try {
      await api.makeDirectory(session, childPath(parent, name));
      setEntryName("");
      setNewEntry(null);
      await load(parent);
      setError(null);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(null);
    }
  }

  /**
   * A new file is an empty one, created through the same staging write a save
   * uses, then opened as a tab: the person asked for a file to work in, not for
   * a row to select.
   */
  async function createFile(parent: string, name: string): Promise<void> {
    const path = childPath(parent, name);
    setBusy("create-file");
    try {
      const result = await api.writeTextFile({
        session,
        path,
        text: "",
        eol: "lf",
        expected: null,
      });
      if (!result.ok) {
        setError(
          result.reason === "changed"
            ? t("files.nameTaken", "同名文件已存在。")
            : t("files.createFailed", "创建文件失败，请重试。"),
        );
        return;
      }
      setEntryName("");
      setNewEntry(null);
      await load(parent);
      setError(null);
      openFileTab(session, path, name);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(null);
    }
  }

  async function createEntry(): Promise<void> {
    const target = newEntry;
    const name = entryName.trim();
    if (!target || !name) return;
    if (name === "." || name === ".." || name.includes("/")) {
      setError(t("files.nameInvalid", "名称不能包含 /，也不能是 . 或 ..。"));
      return;
    }
    if (target.kind === "folder") await createFolder(target.parent, name);
    else await createFile(target.parent, name);
  }

  /** Opens the inline form, and opens the folder when it was closed. */
  function beginCreate(parent: string, kind: "file" | "folder"): void {
    setNewEntry({ parent, kind });
    setEntryName("");
    if (parent !== TREE_ROOT && !open.has(parent)) loadThenOpen(parent);
  }

  /** Closes the form and hands the keyboard back to the directory row. */
  function cancelCreate(): void {
    const parent = newEntry?.parent;
    setNewEntry(null);
    setEntryName("");
    if (parent) focusRow(parent);
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

  function cancelHoverExpand(): void {
    if (hoverTimer.current !== null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }

  function handleRowDragOver(event: React.DragEvent, row: Row): void {
    if (kindOf(row) !== "dir") return;
    event.preventDefault();
    event.stopPropagation();
    setDropDir(row.path);
    if (!row.open) armHoverExpand(row.path);
  }

  function handleRowDragLeave(): void {
    setDropDir(null);
    cancelHoverExpand();
  }

  function handleRowDrop(event: React.DragEvent, row: Row): void {
    if (kindOf(row) === "dir") void onDropInto(event, row.path);
  }

  const moreItems: MenuItem[] = [
    {
      label: t("files.uploadFolder", "上传文件夹"),
      icon: <UploadIcon size={14} />,
      disabled: busy !== null,
      onSelect: () => void pickAndUploadFolder(),
    },
    {
      label: t("files.collapseAll", "全部收起"),
      icon: <ChevronUpIcon size={14} />,
      disabled: open.size === 0,
      onSelect: () => collapseAllDirectories(session),
    },
    {
      label: t("files.showSizes", "显示文件大小"),
      checked: showFileSizes,
      dividerBefore: true,
      onSelect: () => setShowFileSizes(!showFileSizes),
    },
  ];

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
      {/* In a live workspace the window controls and files toggle sit above this
          panel's head; this 40px band is the titlebar they share. */}
      {workspaceChrome && (
        <div
          className="files-panel__titlebar"
          aria-hidden="true"
          onDoubleClick={() => void api.toggleMaximizeWindow()}
        />
      )}
      <div className="pane__head">
        <span className="pane__title">{t("files.title", "文件")}</span>
        <span className="pane__actions">
          <IconButton
            variant="ghost"
            size="sm"
            label={t("files.refresh", "刷新")}
            onClick={() => void refresh()}
            disabled={listings[TREE_ROOT]?.loading ?? false}
          >
            <SyncIcon
              size={14}
              className={listings[TREE_ROOT]?.loading ? "spin-sync" : undefined}
            />
          </IconButton>
          <IconButton
            variant="ghost"
            size="sm"
            label={busy === "upload" ? t("files.uploading", "上传中…") : t("files.upload", "上传")}
            onClick={() => void pickAndUpload()}
            disabled={busy !== null}
          >
            <UploadIcon size={14} />
          </IconButton>
          <Menu
            label={t("files.moreActions", "更多文件操作")}
            trigger={<MoreIcon size={14} />}
            items={moreItems}
          />
        </span>
      </div>

      {error && (
        <div className="pane-error">
          <Callout tone="danger">{error}</Callout>
        </div>
      )}

      <FileTreeList
        treeRef={treeRef}
        rows={rows}
        listings={listings}
        focused={focused}
        activeFilePath={activeFilePath}
        resolving={resolving}
        dropDir={dropDir}
        showFileSizes={showFileSizes}
        firstFocusable={firstFocusable}
        newEntry={newEntry}
        entryName={entryName}
        newEntryInputRef={newEntryInput}
        busy={busy}
        kindOf={kindOf}
        onKeyDown={onKeyDown}
        onFocusRow={focusRow}
        onActivateRow={activateRow}
        onOpenRowMenu={openRowMenu}
        onRowDragOver={handleRowDragOver}
        onRowDragLeave={handleRowDragLeave}
        onRowDrop={handleRowDrop}
        onEntryNameChange={setEntryName}
        onSubmitEntry={() => void createEntry()}
        onCancelEntry={cancelCreate}
        onRetryListing={(path) => void load(path)}
      />

      <FileTransferTray
        transfers={transfers}
        onDismiss={(id) => setTransfers((current) => current.filter((item) => item.id !== id))}
        onCancel={(id) => void api.cancelTransfer(id)}
      />

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
            {t("files.conflictBody", "{{list}} 已存在于该目录。", { list: conflict.names.join("、") })}
          </Callout>
          <p className="hint">{t("files.conflictHint", "所选做法对本次全部文件生效。")}</p>
        </Dialog>
      )}

      {deleteAsk && (
        <Dialog
          size="confirm"
          title={t("files.deleteTitle", "删除 {{name}}？", { name: deleteAsk.entry.name })}
          onClose={() => setDeleteAsk(null)}
          footer={
            <div className="row">
              <Button variant="outline" onClick={() => setDeleteAsk(null)}>
                {t("files.cancel", "取消")}
              </Button>
              <Button
                variant="destructive"
                autoFocus
                onClick={() => {
                  const ask = deleteAsk;
                  setDeleteAsk(null);
                  if (ask) void deleteRow(ask.path);
                }}
              >
                {t("files.delete", "删除")}
              </Button>
            </div>
          }
        >
          <p className="hint">
            {deleteAsk.entry.type === "dir"
              ? t("files.deleteBodyDir", "此操作不可撤销，目录中的内容会一并删除。")
              : t("files.deleteBody", "此操作不可撤销。")}
          </p>
        </Dialog>
      )}

      <FilePaneContextMenu
        menu={menu}
        session={session}
        busy={busy}
        rootLoading={listings[TREE_ROOT]?.loading ?? false}
        kindOf={kindOf}
        onClose={() => setMenu(null)}
        onOpenFile={openFileTab}
        onOpenLink={(row) => void openLink(row)}
        onBeginCreate={beginCreate}
        onUploadTo={(path) => void pickAndUploadTo(path)}
        onUploadFolder={(path) => void pickAndUploadFolder(path)}
        onDownload={(entry, path) => void download(entry, path)}
        onDownloadDirectory={(entry, path) => void downloadDirectory(entry, path)}
        onDeleteAsk={(entry, path) => setDeleteAsk({ entry, path })}
        onRefresh={() => void refresh()}
      />
    </aside>
  );
}
