/**
 * A remote file, open in the middle column: the other kind of tab, beside the
 * shells of its session.
 *
 * A tab rather than a dialog because the file is read *against* the terminal —
 * a training log is opened while a shell runs, and a modal would stand between
 * the two. It parks the way a terminal does: switching tabs hides the pane and
 * keeps its read.
 *
 * Saving is three promises, each answered in a place the person can see:
 *
 * - **Nothing half-written.** The main process stages beside the target and
 *   renames on top (`sftp-text`), so a save that dies halfway leaves the old
 *   file, never half of the new one.
 * - **Nobody's work disappears quietly.** The file is written against the
 *   mtime/size it was read at; if the far side moved on, the write comes back
 *   as a question and the buffer stays on screen until the person answers.
 * - **A failure keeps the edits.** Nothing clears the dirty flag except a save
 *   that landed.
 *
 * Everything a person sees is `FileViewPanel`, a pure function of the state it
 * is given, so the design system's rules about this surface — every refusal
 * says why, nothing that cannot be written offers a save — are assertable
 * without a terminal or a connection.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { EditorView } from "@codemirror/view";
import type { Text as EditorText } from "@codemirror/state";
import type { RemoteTextRead } from "@shared/types";
import * as api from "../../lib/api";
import { messageOf } from "../../lib/api";
import { formatSize, parentPath } from "../../lib/format";
import { useAppStore } from "../../store";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { CopyButton } from "../../components/ui/CopyButton";
import { Callout } from "../../components/ui/Notice";
import { TextSurface } from "./TextSurface";

/** How long 「已保存」 stays in the status line before the facts come back. */
const SAVED_FLASH_MS = 2000;

export type FileViewState =
  | { status: "loading" }
  | { status: "failed"; message: string }
  | { status: "ready"; read: RemoteTextRead };

/** What the pane is asking, if anything, before it will go on. */
type Pending =
  | { kind: "conflict"; reason: "changed" | "missing" }
  | { kind: "confirmReload" };

export function FileView({
  session,
  path,
  name,
  tabId,
  active,
}: {
  session: string;
  path: string;
  name: string;
  /** The tab this pane belongs to: how the strip and the store name it. */
  tabId: string;
  /** The shown tab; a parked pane keeps its read and its scroll position. */
  active: boolean;
}) {
  const { t } = useTranslation();
  const notify = useAppStore((state) => state.notify);
  const closeTab = useAppStore((state) => state.closeTab);
  const setTabDirty = useAppStore((state) => state.setTabDirty);
  const cancelPendingClose = useAppStore((state) => state.cancelPendingClose);
  const noteFileWrite = useAppStore((state) => state.noteFileWrite);
  const closing = useAppStore((state) => state.pendingCloseTabId) === tabId;

  const [state, setState] = useState<FileViewState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  /** What the far side looked like when the buffer was last in step with it. */
  const [baseline, setBaseline] = useState<{ mtime: number; size: number } | null>(null);

  const viewRef = useRef<EditorView | null>(null);
  /** The document as the runtime has it — undo back to it counts as clean. */
  const savedDoc = useRef<EditorText | null>(null);
  const dirtyRef = useRef(false);

  useEffect(() => {
    let current = true;
    setState({ status: "loading" });
    setPending(null);
    setSaveError(null);
    setBaseline(null);
    // A fresh read is clean by definition; the flag is dropped here rather than
    // in a cleanup, because this same effect is what a reload runs.
    savedDoc.current = null;
    dirtyRef.current = false;
    setDirty(false);
    setTabDirty(tabId, false);
    api.readTextFile(session, path).then(
      (read) => {
        if (!current) return;
        setState({ status: "ready", read });
        if (read.kind === "text") setBaseline({ mtime: read.mtime, size: read.size });
      },
      (cause: unknown) => {
        if (current) setState({ status: "failed", message: messageOf(cause) });
      },
    );
    return () => {
      current = false;
    };
  }, [session, path, attempt, tabId, setTabDirty]);

  useEffect(() => {
    if (savedAt === null) return;
    const timer = setTimeout(() => setSavedAt(null), SAVED_FLASH_MS);
    return () => clearTimeout(timer);
  }, [savedAt]);

  const read = state.status === "ready" ? state.read : null;
  const writable = read?.kind === "text" && (read.mode & 0o222) !== 0;

  /** Tells the strip — and the store — that the buffer is back in step. */
  function forceClean(): void {
    dirtyRef.current = false;
    setDirty(false);
    setTabDirty(tabId, false);
  }

  /**
   * The document as the runtime now has it, which is what "clean" compares
   * against — and only that document: typing while a save is in flight is
   * ordinary, and the keystrokes after the snapshot are still unsaved.
   */
  function markInStep(doc: EditorText): void {
    savedDoc.current = doc;
    const live = viewRef.current;
    if (live !== null && !live.state.doc.eq(doc)) {
      dirtyRef.current = true;
      setDirty(true);
      setTabDirty(tabId, true);
      return;
    }
    forceClean();
  }

  function noteEdit(view: EditorView): void {
    const next = savedDoc.current === null || !view.state.doc.eq(savedDoc.current);
    // Only the crossings are news: a keystroke is not a store write.
    if (next === dirtyRef.current) return;
    dirtyRef.current = next;
    setDirty(next);
    setTabDirty(tabId, next);
  }

  /** Reads the document and writes it back. `true` when the runtime took it. */
  async function save(force: boolean): Promise<boolean> {
    const view = viewRef.current;
    if (!view || read?.kind !== "text" || !writable || saving) return false;
    // The snapshot the write carries, and the one "clean" will be measured
    // against when the answer comes back.
    const doc = view.state.doc;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await api.writeTextFile({
        session,
        path,
        text: doc.toString(),
        eol: read.eol,
        expected: baseline,
        ...(force ? { force: true } : {}),
      });
      if (!result.ok) {
        setPending({ kind: "conflict", reason: result.reason });
        return false;
      }
      setPending(null);
      setBaseline({ mtime: result.mtime, size: result.size });
      setSavedAt(Date.now());
      markInStep(doc);
      // The tree shows a size, and the size just changed.
      noteFileWrite(session, parentPath(path) || "/");
      return true;
    } catch (cause) {
      // The edits stay: a save that failed is not a reason to lose them.
      setSaveError(messageOf(cause));
      return false;
    } finally {
      setSaving(false);
    }
  }

  /** The close that follows a save: only a landed write closes the tab. */
  async function saveThenClose(force: boolean): Promise<void> {
    // A save already in flight: the question stays up until its answer lands,
    // rather than being dismissed by a second click that cannot act yet.
    if (saving) return;
    if (!(await save(force))) {
      // Whatever stopped the save (a conflict, a failed write) is the thing to
      // show; the close question would sit on top of it. The buffer stays.
      cancelPendingClose();
      return;
    }
    cancelPendingClose();
    closeTab(tabId);
  }

  function reload(): void {
    setPending(null);
    setAttempt((count) => count + 1);
  }

  function discardAndReload(): void {
    forceClean();
    reload();
  }

  return (
    <FileViewPanel
      path={path}
      name={name}
      active={active}
      state={state}
      dirty={dirty}
      saving={saving}
      pending={pending}
      closing={closing}
      saveError={saveError}
      savedAt={savedAt}
      size={baseline?.size ?? null}
      onReady={(view) => {
        viewRef.current = view;
        savedDoc.current = view.state.doc;
      }}
      onChange={noteEdit}
      onSave={() => void save(false)}
      onOverwrite={() => void save(true)}
      onReload={() => {
        if (dirtyRef.current) setPending({ kind: "confirmReload" });
        else reload();
      }}
      onDiscardAndReload={discardAndReload}
      onKeepEditing={() => setPending(null)}
      onSaveAndClose={() => void saveThenClose(false)}
      onOverwriteAndClose={() => void saveThenClose(true)}
      onDiscardAndClose={() => {
        cancelPendingClose();
        closeTab(tabId);
      }}
      onCancelClose={() => cancelPendingClose()}
      onDownload={() => {
        void api
          .download(session, path, name, t("files.saveDialogTitle", "保存到本地"))
          .catch((cause: unknown) => {
            // A transfer that started reports itself on its row in the files
            // panel; only never getting that far lands here, and that is an
            // action's result, so it is a message.
            notify({ tone: "danger", text: messageOf(cause) });
          });
      }}
    />
  );
}

/** The text, or the reason there is not all of it. */
function PreviewBody({
  read,
  editable,
  onReady,
  onChange,
}: {
  read: RemoteTextRead;
  editable: boolean;
  onReady: (view: EditorView) => void;
  onChange: (view: EditorView) => void;
}) {
  const { t } = useTranslation();

  if (read.kind === "binary") {
    return (
      <Callout tone="warn">
        {t("editor.binary", "二进制文件无法预览，下载到本地后用它自己的程序打开。")}
      </Callout>
    );
  }

  if (read.kind === "invalidUtf8") {
    return (
      <>
        <Callout tone="warn">{t("editor.invalidUtf8", "不是有效的 UTF-8 文本，只能查看。")}</Callout>
        <TextSurface text={read.text} />
      </>
    );
  }

  if (read.kind === "truncated") {
    // The gap is spelled out in the text itself, not hidden between two
    // excerpts: a copy of this takes the fact that something is missing along.
    const omitted = t("editor.omitted", "⋯⋯ 省略 {{size}} ⋯⋯", { size: formatSize(read.omitted) });
    return (
      <>
        <Callout tone="warn">
          {t("editor.truncated", "文件较大（{{size}}），只显示了开头与结尾。", {
            size: formatSize(read.size),
          })}
        </Callout>
        <TextSurface text={[read.head, omitted, read.tail].join("\n")} lineNumbers={false} />
      </>
    );
  }

  return <TextSurface text={read.text} editable={editable} onReady={onReady} onChange={onChange} />;
}

export function FileViewPanel({
  path,
  name,
  active,
  state,
  dirty,
  saving,
  pending,
  closing,
  saveError,
  savedAt,
  size,
  onReady,
  onChange,
  onSave,
  onOverwrite,
  onReload,
  onDiscardAndReload,
  onKeepEditing,
  onSaveAndClose,
  onOverwriteAndClose,
  onDiscardAndClose,
  onCancelClose,
  onDownload,
}: {
  path: string;
  name: string;
  active: boolean;
  state: FileViewState;
  dirty: boolean;
  saving: boolean;
  pending: Pending | null;
  /** The strip asked to close this tab and is waiting for an answer. */
  closing: boolean;
  saveError: string | null;
  savedAt: number | null;
  /** The size as last written, which is the one the facts line should show. */
  size: number | null;
  onReady: (view: EditorView) => void;
  onChange: (view: EditorView) => void;
  onSave: () => void;
  onOverwrite: () => void;
  onReload: () => void;
  onDiscardAndReload: () => void;
  onKeepEditing: () => void;
  onSaveAndClose: () => void;
  onOverwriteAndClose: () => void;
  onDiscardAndClose: () => void;
  onCancelClose: () => void;
  onDownload: () => void;
}) {
  const { t } = useTranslation();
  const read = state.status === "ready" ? state.read : null;
  const writable = read?.kind === "text" && (read.mode & 0o222) !== 0;
  // The badge is for "there is text here you cannot change" — too large to send
  // whole, not UTF-8, not writable. A binary file has no text to label, so it
  // gets none: the callout already says why it cannot be opened.
  const readOnly =
    read !== null &&
    (read.kind === "truncated" || read.kind === "invalidUtf8" || (read.kind === "text" && !writable));

  const eol =
    read?.kind === "text"
      ? read.eol === "crlf"
        ? t("editor.eolCrlf", "行尾 CRLF")
        : read.eol === "mixed"
          ? t("editor.eolMixed", "行尾 混合")
          : t("editor.eolLf", "行尾 LF")
      : null;
  const bytes = size ?? read?.size ?? null;
  const facts = [eol, bytes !== null ? formatSize(bytes) : null].filter(Boolean).join(" · ");
  const mark = dirty
    ? `● ${t("editor.unsaved", "未保存")}`
    : savedAt !== null
      ? t("editor.saved", "已保存")
      : null;
  const status = [facts, mark].filter(Boolean).join(" · ");

  const conflict = pending?.kind === "conflict" ? pending : null;
  /** A question is up: the copy button steps out of the way so the answers fit
      in a pane whose column can be at its 360px floor. The facts stay — "● 未保存"
      is what the question is about — and they shrink first when room runs out. */
  const asking = closing || conflict !== null || pending?.kind === "confirmReload";

  let actions: ReactNode = null;
  if (state.status === "failed") {
    // Getting the file is the point of this state, so retrying leads.
    actions = (
      <Button variant="primary" size="sm" onClick={onReload}>
        {t("editor.retry", "重试")}
      </Button>
    );
  } else if (closing) {
    // The focus goes to the answer that finishes the job (this question is
    // raised from the strip or a shortcut, never from inside the pane), and
    // while the far side has moved on, the one that finishes it is the
    // overwrite — or the discard. A plain save would conflict again and the
    // pair of questions would trade places forever.
    actions = (
      <>
        <Button
          variant="primary"
          size="sm"
          disabled={saving}
          autoFocus
          onClick={conflict ? onOverwriteAndClose : onSaveAndClose}
        >
          {conflict
            ? t("editor.overwriteAndClose", "覆盖并关闭")
            : t("editor.saveAndClose", "保存并关闭")}
        </Button>
        <Button variant="outline" size="sm" onClick={onDiscardAndClose}>
          {t("editor.dontSave", "不保存")}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancelClose}>
          {t("editor.cancel", "取消")}
        </Button>
      </>
    );
  } else if (conflict) {
    actions = (
      <>
        <Button variant="destructive" size="sm" onClick={onOverwrite}>
          {t("editor.overwrite", "覆盖")}
        </Button>
        <Button variant="outline" size="sm" onClick={onDiscardAndReload}>
          {t("editor.discardAndReload", "放弃我的修改并重新加载")}
        </Button>
        <Button variant="ghost" size="sm" onClick={onKeepEditing}>
          {t("editor.cancel", "取消")}
        </Button>
      </>
    );
  } else if (pending?.kind === "confirmReload") {
    actions = (
      <>
        <Button variant="outline" size="sm" onClick={onDiscardAndReload}>
          {t("editor.reloadDiscard", "重新加载并丢弃修改")}
        </Button>
        <Button variant="ghost" size="sm" onClick={onKeepEditing}>
          {t("editor.cancel", "取消")}
        </Button>
      </>
    );
  } else if (state.status === "ready") {
    actions = (
      <>
        {writable ? (
          <Button
            variant="primary"
            size="sm"
            disabled={!dirty || saving}
            onClick={onSave}
            data-testid="save-file"
          >
            {saving ? t("editor.saving", "保存中…") : t("editor.save", "保存")}
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={onReload}>
          {t("editor.reload", "重新加载")}
        </Button>
        <Button variant="outline" size="sm" onClick={onDownload}>
          {t("editor.download", "下载到本地")}
        </Button>
      </>
    );
  }

  return (
    <section
      className="file-area"
      hidden={!active}
      inert={!active}
      aria-label={name}
      onKeyDown={(event) => {
        // The pane's own save key, scoped to the pane: a global one would take
        // Ctrl+S away from the terminal, where it is XOFF. Nothing to save
        // means nothing happens — a write of unchanged text only moves the
        // mtime.
        if (!(event.ctrlKey || event.metaKey) || event.key !== "s") return;
        event.preventDefault();
        if (writable && dirty && !saving && pending === null && !closing) onSave();
      }}
    >
      <div className="pane__head">
        <span className="pane__title mono truncate" title={path}>
          {path}
        </span>
        <span className="pane__actions">
          {!asking && readOnly ? <Badge tone="warn">{t("editor.readOnly", "只读")}</Badge> : null}
          {status !== "" && <span className="hint mono file-area__facts">{status}</span>}
          {!asking && (
            <CopyButton
              text={path}
              label={t("editor.copyPath", "复制路径")}
              copiedLabel={t("editor.copied", "已复制")}
            />
          )}
          {actions}
        </span>
      </div>
      <div className="file-area__body">
        {state.status === "loading" && <p className="hint">{t("editor.reading", "读取中…")}</p>}
        {state.status === "failed" && (
          <Callout tone="danger">
            {t("editor.readFailed", "读取失败")}：<span className="mono">{state.message}</span>
          </Callout>
        )}
        {read?.kind === "text" && !writable && (
          <Callout tone="warn">{t("editor.notWritable", "这个文件不可写，只能查看。")}</Callout>
        )}
        {/* The questions and the failure that follows a save attempt are one
            live region: they appear from an action taken elsewhere (the strip,
            a shortcut, a write that came back wrong), so they have to say so
            to anything that cannot see them appear. */}
        {(closing || conflict || pending?.kind === "confirmReload" || saveError !== null) && (
          <div className="file-area__status" role="status" aria-live="polite">
            {closing && <Callout tone="warn">{t("editor.closeAsk", "有未保存的修改。")}</Callout>}
            {conflict && (
              <Callout tone="danger">
                {conflict.reason === "missing"
                  ? t("editor.conflictMissing", "文件在服务器上已不存在，保存会重新创建它。")
                  : t("editor.conflictBody", "文件在服务器上已改变，保存会覆盖那边的版本。")}
              </Callout>
            )}
            {pending?.kind === "confirmReload" && (
              <Callout tone="warn">{t("editor.reloadAsk", "有未保存的修改，重新加载会丢弃它们。")}</Callout>
            )}
            {saveError !== null && (
              <Callout tone="danger">
                {t("editor.saveFailed", "保存失败")}：<span className="mono">{saveError}</span>
              </Callout>
            )}
          </div>
        )}
        {read && (
          <PreviewBody
            read={read}
            editable={Boolean(writable)}
            onReady={onReady}
            onChange={onChange}
          />
        )}
      </div>
    </section>
  );
}
