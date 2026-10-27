/**
 * The SSH dialog: fetch one session's snippet, then hand it to the card view.
 *
 * It is read-only by design. Writing `~/.ssh/config` on the user's behalf is
 * the one thing this app does not do; a block that is wrong is then a paste
 * they can reject, not a configuration that broke on their machine.
 */

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SshSnippet } from "@shared/types";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Callout } from "../../components/ui/Notice";
import { acceleratorLabel } from "../sessions/accelerators";
import { messageOf, sshGenerateKey, sshSnippet, writeClipboard } from "../../lib/api";
import { useAppStore } from "../../store";
import { SshSnippetView, type SshCopyTarget } from "./SshSnippetView";

export function SshDialog() {
  const { t } = useTranslation();
  const session = useAppStore((state) => state.sshDialogSession);
  const close = useAppStore((state) => state.closeSshDialog);
  const sessions = useAppStore((state) => state.sessions);
  const runtimeEndpoints = useAppStore((state) => state.runtimeEndpoints);
  const refreshSshIdentity = useAppStore((state) => state.refreshSshIdentity);
  const notify = useAppStore((state) => state.notify);

  const [snippet, setSnippet] = useState<SshSnippet | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState<SshCopyTarget | null>(null);
  const [reload, setReload] = useState(0);
  const copyTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!session) {
      setSnippet(null);
      setLoadError(null);
      setLoading(false);
      return;
    }

    let live = true;
    setLoading(true);
    setSnippet(null);
    setLoadError(null);
    setCopied(null);
    sshSnippet(session)
      .then((result) => {
        if (!live) return;
        setSnippet(result);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (!live) return;
        setLoadError(messageOf(cause));
        setLoading(false);
      });

    return () => {
      live = false;
    };
  }, [session, reload]);

  useEffect(
    () => () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    },
    [],
  );

  if (!session) return null;

  const record = sessions.find((candidate) => candidate.name === session);
  const endpoint = record?.endpoint ?? null;
  const accelerator = record ? acceleratorLabel(record.accelerator) : null;
  // `null` is "the server did not answer"; the card must not call that gone.
  const runtimeMissing =
    runtimeEndpoints !== null && endpoint ? !runtimeEndpoints.includes(endpoint) : null;

  async function copy(text: string, target: SshCopyTarget): Promise<void> {
    try {
      await writeClipboard(text);
      setCopied(target);
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(null), 1_600);
    } catch (cause) {
      // The card is still on screen; a failed clipboard write is a message,
      // not a reason to replace it.
      notify({ tone: "danger", text: messageOf(cause) });
    }
  }

  async function generate(): Promise<void> {
    if (!session) return;
    setGenerating(true);
    try {
      await sshGenerateKey();
      await refreshSshIdentity();
      setSnippet(await sshSnippet(session));
    } catch (cause) {
      notify({ tone: "danger", text: messageOf(cause) });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Dialog
      size="tool"
      title={t("ssh.dialogTitle", "连接到 {{session}}", { session })}
      onClose={close}
      footer={
        <div className="dialog__actions">
          <Button variant="outline" onClick={close}>
            {t("ssh.close", "关闭")}
          </Button>
          {loadError && (
            <Button variant="primary" onClick={() => setReload((value) => value + 1)}>
              {t("ssh.retry", "重试")}
            </Button>
          )}
        </div>
      }
    >
      {loading && <p className="ssh-loading">{t("ssh.loading", "正在准备连接信息…")}</p>}
      {!loading && loadError && <Callout tone="danger">{loadError}</Callout>}
      {snippet && (
        <SshSnippetView
          snippet={snippet}
          accelerator={accelerator}
          endpoint={endpoint}
          runtimeMissing={runtimeMissing}
          copied={copied}
          generating={generating}
          onCopy={(text, target) => void copy(text, target)}
          onGenerateKey={() => void generate()}
        />
      )}
    </Dialog>
  );
}
