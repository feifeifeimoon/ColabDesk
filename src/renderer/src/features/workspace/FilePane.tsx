import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../lib/api";
import { messageOf } from "../../lib/api";
import { formatPercent, formatSize, localName, parentPath } from "../../lib/format";
import type { ConflictPolicy, RemoteEntry, TransferProgress } from "@shared/types";
import { Button, IconButton } from "../../components/ui/Button";
import { ContextMenu } from "../../components/ui/ContextMenu";
import { Menu, type MenuItem } from "../../components/ui/Menu";
import {
  ChevronRightIcon,
  ChevronUpIcon,
  CloseIcon,
  CopyIcon,
  DownloadIcon,
  FileIcon,
  FolderClosedIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  LinkIcon,
  MoreIcon,
  SyncIcon,
  TrashIcon,
  UploadIcon,
} from "../../components/ui/icons";
import { Callout, EmptyState } from "../../components/ui/Notice";
import { Dialog } from "../../components/ui/Dialog";
import { PanelDivider } from "../../components/ui/PanelDivider";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { PANEL_WIDTH } from "../../lib/panel-width";
import { childPath, projectRows, type Listing, type Row } from "./file-tree";
import { makeRequestTokens } from "./request-tokens";
import { mergeTransferProgress } from "./transfer-list";
import { useAppStore } from "../../store";
import { selectActiveFilePath, useWorkspaceChrome } from "../../store/selectors";

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

/** Where the tree starts. The shell lands here too (`cd /content`). */
const TREE_ROOT = "/content";

/** How deep a row indents, and how far that goes before it stops growing. */
const INDENT_PX = 12;
const INDENT_DEPTH_CAP = 6;

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

/** The open context menu, anchored to a row or to the panel's empty area. */
interface MenuState {
  point: { x: number; y: number };
  row: Row | null;
  returnFocus: HTMLElement | null;
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
  const [focused, setFocused] = useState<string | null>(null);
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

  function focusRow(path: string): void {
    setFocused(path);
    const element = treeRef.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"]`);
    element?.focus();
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

  /** Arrow keys walk the drawn rows; the root is not one of them. */
  function onKeyDown(event: React.KeyboardEvent<HTMLUListElement>): void {
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
      if (row.path === TREE_ROOT) return;
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
      openRowMenuAt(row);
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

  /** The items for a row's context menu, or for the panel's empty area. */
  function itemsForMenu(row: Row | null): MenuItem[] {
    const path = row?.path ?? TREE_ROOT;
    const entry = row?.entry ?? null;
    const kind = row ? kindOf(row) : "dir";
    const isRoot = path === TREE_ROOT;
    const isDir = kind === "dir";
    const isFile = kind === "file";
    const items: MenuItem[] = [];

    if (isFile) {
      items.push({
        label: t("files.open", "打开"),
        icon: <FileIcon size={14} />,
        onSelect: () => openFileTab(session, path, entry?.name ?? path),
      });
    }
    if (kind === "link") {
      items.push({
        label: t("files.open", "打开"),
        icon: <LinkIcon size={14} />,
        onSelect: () => {
          if (row) void openLink(row);
        },
      });
    }
    if (isDir) {
      items.push(
        {
          label: t("files.newFileHere", "在此新建文件"),
          icon: <FileIcon size={14} />,
          disabled: busy !== null,
          onSelect: () => beginCreate(path, "file"),
        },
        {
          label: t("files.newFolderHere", "在此新建文件夹"),
          icon: <FolderPlusIcon size={14} />,
          disabled: busy !== null,
          onSelect: () => beginCreate(path, "folder"),
        },
        {
          label: t("files.uploadHere", "上传文件到此处"),
          icon: <UploadIcon size={14} />,
          dividerBefore: true,
          disabled: busy !== null,
          onSelect: () => void pickAndUploadTo(path),
        },
        {
          label: t("files.uploadFolderHere", "上传文件夹到此处"),
          icon: <UploadIcon size={14} />,
          disabled: busy !== null,
          onSelect: () => void pickAndUploadFolder(path),
        },
      );
    }
    if (isFile) {
      items.push({
        label: t("files.download", "下载"),
        icon: <DownloadIcon size={14} />,
        disabled: busy !== null,
        onSelect: () => {
          if (entry) void download(entry, path);
        },
      });
    }
    if (isDir && !isRoot) {
      items.push({
        label: t("files.downloadFolder", "下载文件夹"),
        icon: <DownloadIcon size={14} />,
        disabled: busy !== null,
        onSelect: () => {
          if (entry) void downloadDirectory(entry, path);
        },
      });
    }
    items.push({
      label: t("files.copyPath", "复制路径"),
      icon: <CopyIcon size={14} />,
      onSelect: () => void api.writeClipboard(path),
    });
    if (row === null) {
      items.push({
        label: t("files.refresh", "刷新"),
        icon: <SyncIcon size={14} />,
        dividerBefore: true,
        disabled: listings[TREE_ROOT]?.loading ?? false,
        onSelect: () => void refresh(),
      });
    }
    if (!isRoot) {
      items.push({
        label: t("files.delete", "删除"),
        icon: <TrashIcon size={14} />,
        danger: true,
        dividerBefore: true,
        disabled: busy !== null,
        onSelect: () => {
          if (entry) setDeleteAsk({ entry, path });
        },
      });
    }
    return items;
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

  const entryPlaceholder =
    newEntry?.kind === "file"
      ? t("files.fileNamePlaceholder", "新文件名称")
      : t("files.folderNamePlaceholder", "新文件夹名称");

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
          panel's head; this 32px band is the titlebar they share. */}
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
        onContextMenu={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest(".file-row, .new-entry-form, .file-empty, .file-error")) return;
          openRowMenu(event, null);
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
                onDragOver={(event) => {
                  if (!isDir) return;
                  event.preventDefault();
                  event.stopPropagation();
                  setDropDir(row.path);
                  if (!row.open) armHoverExpand(row.path);
                }}
                onDragLeave={() => {
                  setDropDir(null);
                  cancelHoverExpand();
                }}
                onDrop={isDir ? (event) => void onDropInto(event, row.path) : undefined}
                onContextMenu={(event) => openRowMenu(event, row)}
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
                    onFocus={() => setFocused(TREE_ROOT)}
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
                    // The spinner in the icon column says "being read" to the eye;
                    // this says it to everything else.
                    aria-busy={isLoading ? true : undefined}
                    data-path={row.path}
                    tabIndex={
                      focused === row.path || (focused === null && row.path === firstFocusable)
                        ? 0
                        : -1
                    }
                    title={title}
                    onFocus={() => setFocused(row.path)}
                    onClick={(event) => activateRow(event, row)}
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
                    void createEntry();
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Escape") return;
                    event.preventDefault();
                    event.stopPropagation();
                    cancelCreate();
                  }}
                >
                  <input
                    ref={newEntryInput}
                    className="input"
                    data-testid="new-entry-name"
                    aria-label={entryPlaceholder}
                    value={entryName}
                    onChange={(event) => setEntryName(event.target.value)}
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
                    onClick={cancelCreate}
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
                    <Button variant="link" size="sm" onClick={() => void load(row.path)}>
                      {t("files.retry", "重试")}
                    </Button>
                  </Callout>
                </div>
              )}
              {row.open && listing && !listing.loading && !listing.error && listing.entries.length === 0 && (
                isRoot ? (
                  <div className="file-empty" onContextMenu={(event) => openRowMenu(event, row)}>
                    <EmptyState title={t("files.emptyRoot", "运行时还没有文件")}>
                      {t("files.emptyRootHint", "拖入文件，或在终端中创建。")}
                    </EmptyState>
                  </div>
                ) : (
                  <div
                    className="file-empty file-empty--nested"
                    style={{ paddingLeft: `${Math.min(row.depth + 1, INDENT_DEPTH_CAP) * INDENT_PX}px` }}
                    onContextMenu={(event) => openRowMenu(event, row)}
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
                  {transfer.done ? (
                    <IconButton
                      variant="ghost"
                      size="sm"
                      label={t("files.dismissTransfer", "清除")}
                      onClick={() =>
                        setTransfers((current) => current.filter((item) => item.id !== transfer.id))
                      }
                    >
                      <CloseIcon />
                    </IconButton>
                  ) : (
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

      {menu && (
        <ContextMenu
          point={menu.point}
          label={
            menu.row
              ? t("files.menuLabel", "{{name}} 的操作", {
                  name: menu.row.path === TREE_ROOT ? TREE_ROOT : menu.row.name,
                })
              : t("files.panelMenuLabel", "文件面板操作")
          }
          items={itemsForMenu(menu.row)}
          onClose={() => setMenu(null)}
          returnFocus={menu.returnFocus}
        />
      )}
    </aside>
  );
}
