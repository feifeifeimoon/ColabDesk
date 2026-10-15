/**
 * A remote file, open in the middle column: the other kind of tab, beside the
 * shells of its session.
 *
 * A tab rather than a dialog because the file is read *against* the terminal —
 * a training log is opened while a shell runs, and a modal would stand between
 * the two. It parks the way a terminal does: switching tabs hides the pane and
 * keeps its read.
 *
 * Everything a person sees is `FileViewPanel`, a pure function of the state it
 * is given, so the rules the design system states about this surface — every
 * refusal says why, a file that is not text offers a way out — are assertable
 * without a terminal or a connection.
 *
 * The size policy (whole file under 2 MiB, its two ends above) lives in the
 * main process; what arrives here is already the answer, including how many
 * bytes the preview is not showing.
 */

import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { RemoteTextRead } from "@shared/types";
import * as api from "../../lib/api";
import { messageOf } from "../../lib/api";
import { formatSize } from "../../lib/format";
import { useAppStore } from "../../store";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { CopyButton } from "../../components/ui/CopyButton";
import { Callout } from "../../components/ui/Notice";
import { TextSurface } from "./TextSurface";

export type FileViewState =
  | { status: "loading" }
  | { status: "failed"; message: string }
  | { status: "ready"; read: RemoteTextRead };

export function FileView({
  session,
  path,
  name,
  active,
}: {
  session: string;
  path: string;
  name: string;
  /** The shown tab; a parked pane keeps its read and its scroll position. */
  active: boolean;
}) {
  const { t } = useTranslation();
  const notify = useAppStore((state) => state.notify);
  const [state, setState] = useState<FileViewState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    setState({ status: "loading" });
    api.readTextFile(session, path).then(
      (read) => {
        if (current) setState({ status: "ready", read });
      },
      (cause: unknown) => {
        if (current) setState({ status: "failed", message: messageOf(cause) });
      },
    );
    return () => {
      current = false;
    };
  }, [session, path, attempt]);

  async function download(): Promise<void> {
    try {
      await api.download(session, path, name, t("files.saveDialogTitle", "保存到本地"));
    } catch (cause) {
      // A transfer that started reports itself on its row in the files panel —
      // progress is a broadcast, not this pane's child. Only never getting that
      // far lands here, and it is an action's result, so it is a message.
      notify({ tone: "danger", text: messageOf(cause) });
    }
  }

  return (
    <FileViewPanel
      path={path}
      name={name}
      active={active}
      state={state}
      onReload={() => setAttempt((count) => count + 1)}
      onDownload={() => void download()}
    />
  );
}

/** The text, or the reason there is not all of it. */
function PreviewBody({ read }: { read: RemoteTextRead }) {
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

  return <TextSurface text={read.text} />;
}

export function FileViewPanel({
  path,
  name,
  active,
  state,
  onReload,
  onDownload,
}: {
  path: string;
  name: string;
  active: boolean;
  state: FileViewState;
  onReload: () => void;
  onDownload: () => void;
}) {
  const { t } = useTranslation();
  const read = state.status === "ready" ? state.read : null;
  // The badge is for "this is text, and it is not all here": a binary file
  // never offers reading to begin with, so it needs no such label.
  const readOnly = read !== null && (read.kind === "truncated" || read.kind === "invalidUtf8");

  const eol =
    read?.kind === "text"
      ? read.eol === "crlf"
        ? t("editor.eolCrlf", "行尾 CRLF")
        : read.eol === "mixed"
          ? t("editor.eolMixed", "行尾 混合")
          : t("editor.eolLf", "行尾 LF")
      : null;
  const status = read ? [eol, formatSize(read.size)].filter(Boolean).join(" · ") : "";

  let actions: ReactNode = null;
  if (state.status === "failed") {
    // Getting the file is the point of this state, so retrying leads.
    actions = (
      <Button variant="primary" size="sm" onClick={onReload}>
        {t("editor.retry", "重试")}
      </Button>
    );
  } else if (state.status === "ready") {
    actions = (
      <>
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
    <section className="file-area" hidden={!active} inert={!active} aria-label={name}>
      <div className="pane__head">
        <span className="pane__title mono truncate" title={path}>
          {path}
        </span>
        <span className="pane__actions">
          {readOnly ? <Badge tone="warn">{t("editor.readOnly", "只读")}</Badge> : null}
          <span className="hint mono">{status}</span>
          <CopyButton
            text={path}
            label={t("editor.copyPath", "复制路径")}
            copiedLabel={t("editor.copied", "已复制")}
          />
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
        {read && <PreviewBody read={read} />}
      </div>
    </section>
  );
}
