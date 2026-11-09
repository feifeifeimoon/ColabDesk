/**
 * The status bar's Ports button and its popover.
 *
 * The button is always present (0 included): the number is the state and the
 * click is the only entry to the feature. The popover is non-modal — no
 * backdrop, no inert workbench — because the person is usually copying a local
 * URL or checking a port while a terminal keeps running behind it.
 */

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type {
  PortForward,
  PortForwardRequest,
  PortForwardStatus,
} from "@shared/types";
import { Button, IconButton } from "../../components/ui/Button";
import { Input, Select } from "../../components/ui/Field";
import { Callout } from "../../components/ui/Notice";
import { CloseIcon, PlugIcon, SyncIcon } from "../../components/ui/icons";
import * as api from "../../lib/api";
import { useAppStore } from "../../store";

function portStatusKey(status: PortForwardStatus): string {
  switch (status) {
    case "starting":
      return "ports.status.starting";
    case "active":
      return "ports.status.active";
    case "stopped":
      return "ports.status.stopped";
    case "error":
      return "ports.status.error";
  }
}

function urlFor(forward: PortForward): string | null {
  return forward.local_port
    ? `${forward.scheme}://${forward.local_host}:${forward.local_port}`
    : null;
}

export function PortsControl() {
  // The status bar's own tests build a partial store; a missing ports slice is
  // an empty button, not a render failure.
  const forwardsBySession = useAppStore((state) => state.portsBySession) ?? {};
  const selectedSession = useAppStore((state) => state.selectedSession);
  const connectionReady = useAppStore((state) =>
    state.selectedSession
      ? state.connections?.[state.selectedSession]?.status === "ready"
      : false,
  );
  const createPort = useAppStore((state) => state.createPort);
  const startPort = useAppStore((state) => state.startPort);
  const stopPort = useAppStore((state) => state.stopPort);
  const removePort = useAppStore((state) => state.removePort);
  const loadPorts = useAppStore((state) => state.loadPorts);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open && selectedSession) void loadPorts(selectedSession);
  }, [open, selectedSession, loadPorts]);

  return (
    <PortsView
      open={open}
      onToggle={setOpen}
      selectedSession={selectedSession}
      connectionReady={connectionReady}
      forwardsBySession={forwardsBySession}
      onCreate={createPort}
      onStart={(id) => void startPort(id)}
      onStop={(id) => void stopPort(id)}
      onRemove={(id) => void removePort(id)}
      onOpen={(url) => api.openExternal(url)}
      onCopy={(url) => void api.writeClipboard(url)}
    />
  );
}

export interface PortsViewProps {
  open: boolean;
  onToggle(open: boolean): void;
  selectedSession: string | null;
  connectionReady: boolean;
  forwardsBySession: Record<string, PortForward[]>;
  onCreate(request: PortForwardRequest): Promise<PortForward | null>;
  onStart(id: string): void;
  onStop(id: string): void;
  onRemove(id: string): void;
  onOpen(url: string): void;
  onCopy(url: string): void;
}

export function PortsView({
  open,
  onToggle,
  selectedSession,
  connectionReady,
  forwardsBySession,
  onCreate,
  onStart,
  onStop,
  onRemove,
  onOpen,
  onCopy,
}: PortsViewProps) {
  const { t } = useTranslation();
  const root = useRef<HTMLDivElement | null>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  const dialogId = useId();
  const [anchor, setAnchor] = useState({ right: 12, bottom: 32 });
  const [remote, setRemote] = useState("");
  const [local, setLocal] = useState("");
  const [host, setHost] = useState("127.0.0.1");
  const [scheme, setScheme] = useState<"http" | "https">("http");
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => {
    const entries = Object.entries(forwardsBySession).filter(([, list]) => list.length > 0);
    entries.sort(([left], [right]) => {
      if (left === selectedSession) return -1;
      if (right === selectedSession) return 1;
      return left.localeCompare(right);
    });
    return entries;
  }, [forwardsBySession, selectedSession]);

  const count = useMemo(() => {
    let total = 0;
    for (const list of Object.values(forwardsBySession)) {
      for (const forward of list) {
        if (forward.status === "starting" || forward.status === "active") total += 1;
      }
    }
    return total;
  }, [forwardsBySession]);

  const failed = useMemo(
    () => Object.values(forwardsBySession).some((list) =>
      list.some((forward) => forward.status === "error"),
    ),
    [forwardsBySession],
  );

  useEffect(() => {
    if (!open) return;
    const place = (): void => {
      const rect = button.current?.getBoundingClientRect();
      if (!rect) return;
      setAnchor({
        right: Math.max(8, window.innerWidth - rect.right),
        bottom: Math.max(32, window.innerHeight - rect.top + 6),
      });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) onToggle(false);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      onToggle(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, onToggle]);

  async function add(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    if (!selectedSession) {
      setError(t("ports.error.session", "先选择一个会话。"));
      return;
    }
    const remotePort = Number(remote);
    if (!Number.isInteger(remotePort) || remotePort < 1 || remotePort > 65535) {
      setError(t("ports.error.remotePort", "远程端口必须在 1–65535 之间。"));
      return;
    }
    const localPort = local.trim() === "" ? null : Number(local);
    if (
      localPort !== null
      && (!Number.isInteger(localPort) || localPort < 1024 || localPort > 65535)
    ) {
      setError(t("ports.error.localPort", "本地端口必须在 1024–65535 之间，或留空自动分配。"));
      return;
    }
    setBusy(true);
    try {
      const created = await onCreate({
        session: selectedSession,
        remote_port: remotePort,
        local_port: localPort,
        remote_host: host.trim() || "127.0.0.1",
        scheme,
      });
      if (created) {
        setRemote("");
        setLocal("");
      }
    } catch (cause) {
      setError(api.messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ports-control" ref={root}>
      <button
        ref={button}
        type="button"
        className="statusbar__item statusbar__item--action ports-button"
        data-testid="ports-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        aria-label={t("ports.buttonLabel", "端口转发：{{count}} 个", { count })}
        title={t("ports.buttonLabel", "端口转发：{{count}} 个", { count })}
        onClick={() => onToggle(!open)}
      >
        <PlugIcon size={13} />
        <span>{count}</span>
        {failed && <span className="ports-button__dot" aria-hidden="true" />}
      </button>

      {open && (
        <div
          id={dialogId}
          className="ports-popover"
          role="dialog"
          aria-label={t("ports.title", "端口转发")}
          data-testid="ports-popover"
          style={{ right: anchor.right, bottom: anchor.bottom }}
        >
          <div className="ports-popover__head">
            <span className="ports-popover__title">{t("ports.title", "端口转发")}</span>
            <span className="ports-popover__count">
              {t("ports.runningCount", "{{count}} 个运行中", { count })}
            </span>
            <IconButton
              variant="ghost"
              size="sm"
              label={t("dialog.close", "关闭")}
              onClick={() => onToggle(false)}
            >
              <CloseIcon />
            </IconButton>
          </div>

          <form className="ports-form" onSubmit={add}>
            <div className="ports-form__target">
              {t("ports.addTo", "添加到")}{" "}
              <strong>{selectedSession ?? t("ports.noSession", "未选择会话")}</strong>
            </div>
            <div className="ports-form__row">
              <Input
                data-testid="ports-remote"
                value={remote}
                onChange={(event) => setRemote(event.target.value)}
                placeholder={t("ports.remotePort", "远程端口")}
                aria-label={t("ports.remotePort", "远程端口")}
                inputMode="numeric"
                type="number"
                min={1}
                max={65535}
                autoFocus
              />
              <Input
                data-testid="ports-local"
                value={local}
                onChange={(event) => setLocal(event.target.value)}
                placeholder={t("ports.localPortAuto", "本地端口（自动）")}
                aria-label={t("ports.localPortAuto", "本地端口（自动）")}
                inputMode="numeric"
                type="number"
                min={1024}
                max={65535}
              />
              <Button
                type="submit"
                variant="primary"
                size="sm"
                data-testid="ports-add"
                disabled={busy || !selectedSession || !remote.trim()}
              >
                {t("ports.add", "添加")}
              </Button>
            </div>

            <button
              type="button"
              className="ports-form__advanced"
              aria-expanded={advanced}
              onClick={() => setAdvanced(!advanced)}
            >
              {t("ports.advanced", "更多选项")}
            </button>

            {advanced && (
              <div className="ports-form__row">
                <Input
                  data-testid="ports-host"
                  value={host}
                  onChange={(event) => setHost(event.target.value)}
                  placeholder={t("ports.remoteHost", "远程主机")}
                  aria-label={t("ports.remoteHost", "远程主机")}
                />
                <Select
                  data-testid="ports-scheme"
                  value={scheme}
                  onChange={(event) =>
                    setScheme(event.target.value === "https" ? "https" : "http")
                  }
                  aria-label={t("ports.scheme", "协议")}
                >
                  <option value="http">{t("ports.http", "http")}</option>
                  <option value="https">{t("ports.https", "https")}</option>
                </Select>
              </div>
            )}

            {!selectedSession && (
              <p className="hint">{t("ports.selectSession", "先选择一个会话，再添加端口映射。")}</p>
            )}
            {selectedSession && !connectionReady && (
              <Callout tone="info">
                {t("ports.connectionHint", "启动映射会先连接运行时。")}
              </Callout>
            )}
            {error && <p className="error">{error}</p>}
          </form>

          <div className="ports-popover__body">
            {groups.length === 0 ? (
              <p className="ports-empty">
                {t("ports.empty", "把运行时的端口映射到本机。例如 Gradio 7860、vLLM 8000。")}
              </p>
            ) : (
              groups.map(([session, list]) => (
                <section key={session} className="ports-group">
                  <h3 className="ports-group__title">{session}</h3>
                  {list.map((forward) => (
                    <PortRow
                      key={forward.id}
                      forward={forward}
                      onStart={onStart}
                      onStop={onStop}
                      onRemove={onRemove}
                      onOpen={onOpen}
                      onCopy={onCopy}
                    />
                  ))}
                </section>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PortRow({
  forward,
  onStart,
  onStop,
  onRemove,
  onOpen,
  onCopy,
}: {
  forward: PortForward;
  onStart(id: string): void;
  onStop(id: string): void;
  onRemove(id: string): void;
  onOpen(url: string): void;
  onCopy(url: string): void;
}) {
  const { t } = useTranslation();
  const url = urlFor(forward);
  return (
    <div className="port-row" data-testid={`port-row-${forward.id}`}>
      <div className="port-row__line">
        <span className="port-row__endpoints">
          <span className="port-row__remote">
            {forward.remote_host}:{forward.remote_port}
          </span>
          <span className="port-row__arrow" aria-hidden="true">→</span>
          <code className="port-row__local">
            {forward.local_port ? `${forward.local_host}:${forward.local_port}` : "—"}
          </code>
        </span>
        <span className={`port-row__status port-row__status--${forward.status}`}>
          {forward.status === "starting" && <SyncIcon size={12} className="spin-sync" />}
          {t(portStatusKey(forward.status), forward.status)}
        </span>
      </div>

      <div className="port-row__actions">
        {forward.status === "active" && url && (
          <>
            <Button variant="link" size="sm" onClick={() => onOpen(url)}>
              {t("ports.open", "打开")}
            </Button>
            <Button variant="link" size="sm" onClick={() => onCopy(url)}>
              {t("ports.copy", "复制")}
            </Button>
            <Button variant="link" size="sm" onClick={() => onStop(forward.id)}>
              {t("ports.stop", "停止")}
            </Button>
          </>
        )}
        {forward.status === "stopped" && (
          <>
            <Button variant="link" size="sm" onClick={() => onStart(forward.id)}>
              {t("ports.start", "启动")}
            </Button>
            <Button variant="link" size="sm" onClick={() => onRemove(forward.id)}>
              {t("ports.remove", "删除")}
            </Button>
          </>
        )}
        {forward.status === "error" && (
          <>
            <Button variant="link" size="sm" onClick={() => onStart(forward.id)}>
              {t("ports.retry", "重试")}
            </Button>
            <Button variant="link" size="sm" onClick={() => onRemove(forward.id)}>
              {t("ports.remove", "删除")}
            </Button>
          </>
        )}
      </div>

      {forward.error && <p className="port-row__error">{forward.error}</p>}
    </div>
  );
}
