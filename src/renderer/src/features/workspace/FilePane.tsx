import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../lib/api";
import { messageOf } from "../../lib/api";
import { formatPercent, formatSize, joinPath, parentPath } from "../../lib/format";
import type { RemoteEntry, TransferProgress } from "@shared/types";
import { Button } from "../../components/ui/Button";
import { PanelDivider } from "../../components/ui/PanelDivider";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { PANEL_WIDTH } from "../../lib/panel-width";
import { useAppStore } from "../../store";

/**
 * The runtime's filesystem over SFTP, on the same SSH connection the terminal
 * uses (a runtime only accepts one). Uploads and downloads report progress as
 * events from the main process.
 */
export function FilePane({
  session,
  onPathChange,
  onTransferCount,
}: {
  session: string;
  /** Reported up so the status bar can show where the browser is. */
  onPathChange?: (path: string) => void;
  onTransferCount?: (active: number) => void;
}) {
  const { t } = useTranslation();
  const [path, setPath] = useState("/content");
  const [entries, setEntries] = useState<RemoteEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transfers, setTransfers] = useState<TransferProgress[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const width = useAppStore((state) => state.panelWidths.files);
  const setPanelWidth = useAppStore((state) => state.setPanelWidth);
  const panelRef = useRef<HTMLElement | null>(null);
  const pathRef = useRef(path);
  pathRef.current = path;

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

  /**
   * Read at call time rather than captured. The parent rebuilds these closures
   * as the map over open tabs re-renders, and an effect depending on one would
   * report, update the parent, and run again.
   */
  const latest = useRef({ onPathChange, onTransferCount });
  useEffect(() => {
    latest.current = { onPathChange, onTransferCount };
  });

  useEffect(() => {
    latest.current.onPathChange?.(path);
  }, [path]);

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

  const refresh = useCallback(
    async (target: string) => {
      setLoading(true);
      try {
        setEntries(await api.listDirectory(session, target));
        setError(null);
      } catch (cause) {
        setError(messageOf(cause));
        setEntries([]);
      } finally {
        setLoading(false);
      }
    },
    [session],
  );

  useEffect(() => {
    setPath("/content");
    void refresh("/content");
  }, [refresh]);

  useEffect(() => {
    const off = api.onTransferProgress((progress) => {
      setTransfers((current) => {
        const next = current.filter((item) => item.id !== progress.id);
        next.push(progress);
        return next.slice(-6);
      });
      if (progress.done && !progress.error) void refresh(pathRef.current);
    });
    return off;
  }, [refresh]);

  function navigate(target: string) {
    setPath(target);
    void refresh(target);
  }

  async function uploadPaths(localPaths: string[]) {
    if (localPaths.length === 0) return;
    setBusy("upload");
    try {
      await api.upload({ session, localPaths, remoteDir: path });
      setError(null);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(null);
    }
  }

  async function pickAndUpload() {
    try {
      await uploadPaths(await api.pickUploadTargets(session, path));
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  async function download(entry: RemoteEntry) {
    setBusy(`download:${entry.name}`);
    try {
      await api.download(session, joinPath(path, entry.name), entry.name);
      setError(null);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(null);
    }
  }

  async function remove(entry: RemoteEntry) {
    const extra = entry.type === "dir" ? t("files.deleteConfirmDir", "（整个目录）") : "";
    if (!window.confirm(t("files.deleteConfirm", "删除 {{name}}{{extra}}？此操作不可撤销。", { name: entry.name, extra }))) {
      return;
    }
    setBusy(`delete:${entry.name}`);
    try {
      await api.deletePath(session, joinPath(path, entry.name));
      await refresh(path);
      setError(null);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(null);
    }
  }

  async function createFolder() {
    const name = folderName.trim();
    if (!name) return;
    setBusy("mkdir");
    try {
      await api.makeDirectory(session, joinPath(path, name));
      setFolderName("");
      setCreatingFolder(false);
      await refresh(path);
      setError(null);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(null);
    }
  }

  async function onDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragOver(false);
    const paths = Array.from(event.dataTransfer.files).map((file) => api.pathForFile(file));
    await uploadPaths(paths.filter(Boolean));
  }

  const segments = path.split("/").filter(Boolean);

  return (
    <aside
      className={`files-panel ${dragOver ? "drag-over" : ""}`}
      ref={panelRef}
      style={{ width, minWidth: PANEL_WIDTH.files.min }}
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
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
          <Button variant="ghost" size="sm" onClick={() => void refresh(path)} disabled={loading}>
            {t("files.refresh", "刷新")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            data-testid="new-folder"
            onClick={() => {
              setCreatingFolder(!creatingFolder);
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
      {creatingFolder && (
        <form
          className="folder-form"
          onSubmit={(event) => {
            event.preventDefault();
            void createFolder();
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
          <Button variant="ghost" size="sm" onClick={() => setCreatingFolder(false)}>
            {t("files.cancel", "取消")}
          </Button>
        </form>
      )}

      <div className="breadcrumb">
        <button type="button" className="crumb" onClick={() => navigate("/")}>
          /
        </button>
        {segments.map((segment, index) => {
          const target = `/${segments.slice(0, index + 1).join("/")}`;
          return (
            <span key={target}>
              <button type="button" className="crumb" onClick={() => navigate(target)}>
                {segment}
              </button>
              {index < segments.length - 1 ? <span className="crumb-sep">/</span> : null}
            </span>
          );
        })}
        {path !== "/" && (
          <button type="button" className="crumb up" onClick={() => navigate(parentPath(path))}>
            {t("files.parentDir", "返回上级")}
          </button>
        )}
      </div>

      {error && <p className="error pane-error">{error}</p>}
      {loading && <p className="hint pane-error">{t("files.loading", "读取中…")}</p>}
      {!loading && !error && entries.length === 0 && <p className="hint pane-error">{t("files.empty", "当前目录为空")}</p>}

      <ul className="file-list">
        {entries.map((entry) => (
          <li key={entry.name} className="file-row">
            <button
              type="button"
              className="file-name"
              onClick={() => (entry.type === "dir" ? navigate(joinPath(path, entry.name)) : void download(entry))}
              title={entry.type === "dir" ? t("files.openDir", "进入目录") : t("files.downloadFile", "下载到本地")}
            >
              <span>{entry.type === "dir" ? "📁" : entry.type === "link" ? "🔗" : "📄"}</span>
              <span className="truncate">{entry.name}</span>
            </button>
            <span className="file-size">{entry.type === "file" ? formatSize(entry.size) : ""}</span>
            <span className="file-actions">
              {entry.type === "file" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void download(entry)}
                  disabled={busy === `download:${entry.name}`}
                >
                  {busy === `download:${entry.name}` ? "…" : t("files.download", "下载")}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void remove(entry)}
                disabled={busy === `delete:${entry.name}`}
              >
                {busy === `delete:${entry.name}` ? "…" : t("files.delete", "删除")}
              </Button>
            </span>
          </li>
        ))}
      </ul>

      {transfers.length > 0 && (
        <div className="transfers">
          {transfers.map((transfer) => (
            <div key={transfer.id} className="transfer">
              <div className="transfer__line">
                <span className="truncate">
                  {transfer.direction === "upload" ? "↑" : "↓"} {transfer.name}
                </span>
                <span
                  className={`transfer__state ${
                    transfer.error ? "transfer__state--error" : transfer.done ? "transfer__state--ok" : ""
                  }`}
                >
                  {transfer.error
                    ? transfer.error
                    : transfer.done
                      ? t("files.transferDone", "完成")
                      : formatPercent(transfer.transferred, transfer.total)}
                </span>
              </div>
              {!transfer.done && !transfer.error && (
                <ProgressBar ratio={transfer.total > 0 ? transfer.transferred / transfer.total : 0} />
              )}
            </div>
          ))}
        </div>
      )}

      <p className="hint drop-hint">{t("files.dropHint", "拖拽文件至此处上传")}</p>
    </aside>
  );
}
