import { useTranslation } from "react-i18next";
import type { RemoteEntry } from "@shared/types";
import { ContextMenu } from "../../components/ui/ContextMenu";
import { type MenuItem } from "../../components/ui/Menu";
import {
  CopyIcon,
  DownloadIcon,
  FileIcon,
  FolderPlusIcon,
  LinkIcon,
  SyncIcon,
  TrashIcon,
  UploadIcon,
} from "../../components/ui/icons";
import { writeClipboard } from "../../lib/api";
import { TREE_ROOT, type Row } from "./file-tree";

export interface MenuState {
  point: { x: number; y: number };
  row: Row | null;
  returnFocus: HTMLElement | null;
}

export interface FilePaneContextMenuProps {
  menu: MenuState | null;
  session: string;
  busy: string | null;
  rootLoading: boolean;
  kindOf: (row: Row) => "dir" | "file" | "link";
  onClose: () => void;
  onOpenFile: (session: string, path: string, name: string) => void;
  onOpenLink: (row: Row) => void;
  onBeginCreate: (parent: string, kind: "file" | "folder") => void;
  onUploadTo: (path: string) => void;
  onUploadFolder: (path: string) => void;
  onDownload: (entry: RemoteEntry, path: string) => void;
  onDownloadDirectory: (entry: RemoteEntry, path: string) => void;
  onDeleteAsk: (entry: RemoteEntry, path: string) => void;
  onRefresh: () => void;
}

/**
 * Context menu for file tree rows and empty panel areas.
 */
export function FilePaneContextMenu({
  menu,
  session,
  busy,
  rootLoading,
  kindOf,
  onClose,
  onOpenFile,
  onOpenLink,
  onBeginCreate,
  onUploadTo,
  onUploadFolder,
  onDownload,
  onDownloadDirectory,
  onDeleteAsk,
  onRefresh,
}: FilePaneContextMenuProps) {
  const { t } = useTranslation();

  if (!menu) return null;

  const row = menu.row;
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
      onSelect: () => onOpenFile(session, path, entry?.name ?? path),
    });
  }
  if (kind === "link") {
    items.push({
      label: t("files.open", "打开"),
      icon: <LinkIcon size={14} />,
      onSelect: () => {
        if (row) onOpenLink(row);
      },
    });
  }
  if (isDir) {
    items.push(
      {
        label: t("files.newFileHere", "在此新建文件"),
        icon: <FileIcon size={14} />,
        disabled: busy !== null,
        onSelect: () => onBeginCreate(path, "file"),
      },
      {
        label: t("files.newFolderHere", "在此新建文件夹"),
        icon: <FolderPlusIcon size={14} />,
        disabled: busy !== null,
        onSelect: () => onBeginCreate(path, "folder"),
      },
      {
        label: t("files.uploadHere", "上传文件到此处"),
        icon: <UploadIcon size={14} />,
        dividerBefore: true,
        disabled: busy !== null,
        onSelect: () => onUploadTo(path),
      },
      {
        label: t("files.uploadFolderHere", "上传文件夹到此处"),
        icon: <UploadIcon size={14} />,
        disabled: busy !== null,
        onSelect: () => onUploadFolder(path),
      },
    );
  }
  if (isFile) {
    items.push({
      label: t("files.download", "下载"),
      icon: <DownloadIcon size={14} />,
      disabled: busy !== null,
      onSelect: () => {
        if (entry) onDownload(entry, path);
      },
    });
  }
  if (isDir && !isRoot) {
    items.push({
      label: t("files.downloadFolder", "下载文件夹"),
      icon: <DownloadIcon size={14} />,
      disabled: busy !== null,
      onSelect: () => {
        if (entry) onDownloadDirectory(entry, path);
      },
    });
  }
  items.push({
    label: t("files.copyPath", "复制路径"),
    icon: <CopyIcon size={14} />,
    onSelect: () => void writeClipboard(path),
  });
  if (row === null) {
    items.push({
      label: t("files.refresh", "刷新"),
      icon: <SyncIcon size={14} />,
      dividerBefore: true,
      disabled: rootLoading,
      onSelect: onRefresh,
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
        if (entry) onDeleteAsk(entry, path);
      },
    });
  }

  const label = menu.row
    ? t("files.menuLabel", "{{name}} 的操作", {
        name: menu.row.path === TREE_ROOT ? TREE_ROOT : menu.row.name,
      })
    : t("files.panelMenuLabel", "文件面板操作");

  return (
    <ContextMenu
      point={menu.point}
      label={label}
      items={items}
      onClose={onClose}
      returnFocus={menu.returnFocus}
    />
  );
}
