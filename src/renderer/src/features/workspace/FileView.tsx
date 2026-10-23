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

import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { EditorView } from "@codemirror/view";
import type { Text as EditorText } from "@codemirror/state";
import type { RemoteTextRead } from "@shared/types";
import * as api from "../../lib/api";
import { messageOf, writeClipboard } from "../../lib/api";
import { formatSize, parentPath } from "../../lib/format";
import { useAppStore } from "../../store";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { Callout } from "../../components/ui/Notice";
import { MarkdownPreview } from "./MarkdownPreview";
import { hasFrontMatter } from "./markdown-document";
import { isMarkdownPath } from "./editor-language";
import { TextSurface } from "./TextSurface";

/** Tiptap + ProseMirror are a lazy chunk; they load with the rich view. */
const RichMarkdownEditor = lazy(() => import("./RichMarkdownEditor"));

/** What the pane is asking, if anything, before it will go on. */

export type FileViewState =
  | { status: "loading" }
  | { status: "failed"; message: string }
  | { status: "ready"; read: RemoteTextRead };

/** What the pane is asking, if anything, before it will go on. */
type Pending = { kind: "conflict"; reason: "changed" | "missing" };

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
    // The read about to replace this buffer has no view yet: the old one is
    // being destroyed, and its text belongs to the previous file or revision.
    viewRef.current = null;
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
      getPreviewText={() => viewRef.current?.state.doc.toString() ?? (read?.kind === "text" ? read.text : "")}
      onRichChange={(markdown) => {
        // The source editor stays the buffer Save reads; replacing its doc is
        // what makes a rich edit dirty and persists it across a view switch.
        const view = viewRef.current;
        if (!view || view.state.doc.toString() === markdown) return;
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: markdown } });
      }}
      onReady={(view) => {
        viewRef.current = view;
        if (view !== null) savedDoc.current = view.state.doc;
      }}
      onChange={noteEdit}
      onSave={() => void save(false)}
      onOverwrite={() => void save(true)}
      onReload={reload}
      onDiscardAndReload={discardAndReload}
      onKeepEditing={() => setPending(null)}
      onSaveAndClose={() => void saveThenClose(false)}
      onOverwriteAndClose={() => void saveThenClose(true)}
      onDiscardAndClose={() => {
        cancelPendingClose();
        closeTab(tabId);
      }}
      onCancelClose={() => cancelPendingClose()}
    />
  );
}

/** The text, or the reason there is not all of it. */
function PreviewBody({
  read,
  path,
  editable,
  onReady,
  onChange,
}: {
  read: RemoteTextRead;
  path: string;
  editable: boolean;
  onReady: (view: EditorView | null) => void;
  onChange: (view: EditorView) => void;
}) {
  const { t } = useTranslation();

  if (read.kind === "binary") {
    return (
      <Callout tone="warn">
        {t("editor.binary", "二进制文件无法预览，请下载后使用相应程序打开。")}
      </Callout>
    );
  }

  if (read.kind === "invalidUtf8") {
    return (
      <>
        <Callout tone="warn">{t("editor.invalidUtf8", "不是有效的 UTF-8 文本，仅可查看。")}</Callout>
        <TextSurface text={read.text} path={path} />
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
          {t("editor.truncated", "文件较大（{{size}}），仅显示开头与结尾。", {
            size: formatSize(read.size),
          })}
        </Callout>
        <TextSurface text={[read.head, omitted, read.tail].join("\n")} path={path} lineNumbers={false} />
      </>
    );
  }

  return <TextSurface text={read.text} path={path} editable={editable} onReady={onReady} onChange={onChange} />;
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
  getPreviewText,
  onRichChange,
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
  /** The live document, including edits the far side has not seen yet. */
  getPreviewText?: () => string;
  onRichChange: (markdown: string) => void;
  onReady: (view: EditorView | null) => void;
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
}) {
  const { t } = useTranslation();
  const read = state.status === "ready" ? state.read : null;
  const [markdownView, setMarkdownView] = useState<"source" | "rich">("source");
  const [copied, setCopied] = useState(false);
  // Decided when the file is read and again when Rich is entered, not on every
  // keystroke: typing a horizontal rule at the top must not take the editor
  // out from under the cursor.
  const [frontMatter, setFrontMatter] = useState(false);
  const markdown = isMarkdownPath(path);
  const previewable = markdown && read?.kind === "text";
  const liveText = getPreviewText?.() ?? (read?.kind === "text" ? read.text : "");
  const writable = read?.kind === "text" && (read.mode & 0o222) !== 0;
  const useRichEditor = writable && !frontMatter;
  const showRich = markdownView === "rich" && previewable;

  useEffect(() => {
    setFrontMatter(read?.kind === "text" ? hasFrontMatter(read.text) : false);
  }, [read]);

  // A new read is a new document. A fast read can resolve before the loading
  // render commits, so the rich editor would never unmount on its own; the key
  // makes it reopen from the text that actually arrived.
  const [readRevision, setReadRevision] = useState(0);
  useEffect(() => {
    if (read !== null) setReadRevision((count) => count + 1);
  }, [read]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const conflict = pending?.kind === "conflict" ? pending : null;
  /** A question is up: the view toggle steps out of the way so the answers fit
      in a pane whose column can be at its 360px floor. */
  const asking = closing || conflict !== null;

  let actions: ReactNode = null;
  if (state.status === "failed") {
    // Getting the file is the point of this state, so retrying leads.
    actions = (
      <Button variant="primary" size="sm" onClick={onReload}>
        {t("editor.retry", "重试")}
      </Button>
    );
  } else if (state.status === "ready" && !asking) {
    // The viewing header is the path and the view toggle; Save appears only
    // when there is something to save. A question takes the decision to the
    // dialog instead of putting buttons in the header.
    actions =
      writable && dirty ? (
        <Button
          variant="primary"
          size="sm"
          disabled={saving}
          onClick={onSave}
          data-testid="save-file"
        >
          {saving ? t("editor.saving", "保存中…") : t("editor.save", "保存")}
        </Button>
      ) : null;
  }

  const closeReason = closing ? t("editor.closeAsk", "有未保存的修改。") : null;
  const conflictReason = conflict
    ? conflict.reason === "missing"
      ? t("editor.conflictMissing", "文件在服务器上已不存在，保存将重新创建。")
      : t("editor.conflictBody", "文件已在服务器上更改，保存将覆盖服务器版本。")
    : null;
  const dialogTitle = closing
    ? t("editor.closeTitle", "关闭「{{name}}」？", { name })
    : t("editor.conflictTitle", "覆盖「{{name}}」？", { name });

  let questionActions: ReactNode = null;
  if (closing) {
    // The primary finishes the job: while the far side has moved on, that is
    // the overwrite, not a plain save that would ask the same question again.
    questionActions = (
      <>
        <Button variant="outline" disabled={saving} onClick={onDiscardAndClose}>
          {t("editor.dontSave", "不保存")}
        </Button>
        <Button
          variant="primary"
          disabled={saving}
          autoFocus
          onClick={conflict ? onOverwriteAndClose : onSaveAndClose}
        >
          {conflict
            ? t("editor.overwriteAndClose", "覆盖并关闭")
            : t("editor.saveAndClose", "保存并关闭")}
        </Button>
      </>
    );
  } else if (conflict) {
    questionActions = (
      <>
        <Button variant="outline" disabled={saving} onClick={onDiscardAndReload}>
          {t("editor.discardAndReload", "放弃修改并重新加载")}
        </Button>
        <Button variant="destructive" disabled={saving} autoFocus onClick={onOverwrite}>
          {t("editor.overwrite", "覆盖")}
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
        <span className="file-area__path-group">
          <button
            type="button"
            className="file-area__path pane__title mono truncate"
            data-testid="file-path-copy"
            title={t("editor.copyPath", "复制路径")}
            aria-label={`${t("editor.copyPath", "复制路径")}：${path}`}
            onClick={() => {
              void writeClipboard(path);
              setCopied(true);
            }}
          >
            {path}
          </button>
          {copied && (
            <span className="file-area__copied" aria-live="polite">
              {t("editor.copied", "已复制")}
            </span>
          )}
        </span>
        <span className="pane__actions">
          {previewable && !asking && (
            <SegmentedControl
              label={t("editor.viewMode", "查看方式")}
              value={markdownView}
              options={[
                { value: "source", label: t("editor.source", "源码"), testId: "markdown-view-source" },
                { value: "rich", label: t("editor.rich", "富文本"), testId: "markdown-view-rich" },
              ]}
              onChange={(next) => {
                if (next === "rich") {
                  setFrontMatter(read?.kind === "text" ? hasFrontMatter(liveText) : false);
                }
                setMarkdownView(next);
              }}
            />
          )}
          {actions}
        </span>
      </div>
      <div className="file-area__body">
        <div className="file-area__notices">
          {state.status === "loading" && <p className="hint">{t("editor.reading", "读取中…")}</p>}
          {state.status === "failed" && (
            <Callout tone="danger">
              {t("editor.readFailed", "读取失败")}：<span className="mono">{state.message}</span>
            </Callout>
          )}
          {read?.kind === "text" && !writable && (
            <Callout tone="warn">{t("editor.notWritable", "文件不可写，仅可查看。")}</Callout>
          )}
          {/* A save that failed is a result, not a question: it stays here.
              Questions about unsaved edits are the dialog below. */}
          {saveError !== null && (
            <div className="file-area__status" role="status" aria-live="polite">
              <Callout tone="danger">
                {t("editor.saveFailed", "保存失败")}：<span className="mono">{saveError}</span>
              </Callout>
            </div>
          )}
        </div>
        {read && (
          <>
            <div
              className="file-area__source"
              hidden={showRich}
              inert={showRich}
            >
              <PreviewBody
                read={read}
                path={path}
                editable={Boolean(writable)}
                onReady={onReady}
                onChange={onChange}
              />
            </div>
            {showRich && read.kind === "text" && (
              useRichEditor ? (
                <Suspense fallback={<p className="hint">{t("editor.loadingRich", "加载富文本…")}</p>}>
                  <RichMarkdownEditor key={readRevision} markdown={liveText} editable onChange={onRichChange} />
                </Suspense>
              ) : (
                <MarkdownPreview text={liveText} />
              )
            )}
          </>
        )}
      </div>
      {asking && (
        <Dialog
          size="confirm"
          title={dialogTitle}
          onClose={closing ? onCancelClose : onKeepEditing}
          footer={<div className="dialog__actions">{questionActions}</div>}
        >
          <div className="dialog__description">
            {closeReason && <p>{closeReason}</p>}
            {conflictReason && <p>{conflictReason}</p>}
          </div>
        </Dialog>
      )}
    </section>
  );
}
