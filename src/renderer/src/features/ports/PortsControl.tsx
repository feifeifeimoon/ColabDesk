/**
 * The status bar's Ports button and its popover.
 *
 * The button is always present (0 included): the number is the state and the
 * click is the only entry to the feature. The popover is non-modal — no
 * backdrop, no inert workbench — because the person is usually copying a local
 * URL or checking a port while a terminal keeps running behind it.
 *
 * The panel is a dense list, not a form with cards: the port number is the
 * scan anchor, the local URL is the line people came for, and the row actions
 * appear on hover or keyboard focus. This follows the same information rhythm
 * as Orca's ports panel without borrowing its palette.
 */

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type {
  PortForward,
  PortForwardRequest,
  PortForwardStatus,
} from "@shared/types";
import { Button, IconButton } from "../../components/ui/Button";
import { Input, Select } from "../../components/ui/Field";
import {
  ChevronRightIcon,
  CloseIcon,
  CopyIcon,
  ExternalIcon,
  PlayIcon,
  PlugIcon,
  RestartIcon,
  StopIcon,
  SyncIcon,
  TrashIcon,
} from "../../components/ui/icons";
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

  const totals = useMemo(() => {
    let running = 0;
    let total = 0;
    let failed = 0;
    let starting = false;
    for (const list of Object.values(forwardsBySession)) {
      for (const forward of list) {
        total += 1;
        if (forward.status === "active") running += 1;
        else if (forward.status === "starting") {
          running += 1;
          starting = true;
        } else if (forward.status === "error") failed += 1;
      }
    }
    return { running, total, failed, starting };
  }, [forwardsBySession]);

  const count = totals.running;
  const failed = totals.failed > 0;

  // The warning dot is aria-hidden, so the accessible name has to carry the
  // failure too; a screen reader otherwise gets only the count.
  const buttonLabel = failed
    ? t("ports.buttonLabelError", "端口转发：{{count}} 个，有失败", { count })
    : t("ports.buttonLabel", "端口转发：{{count}} 个", { count });

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
        aria-label={buttonLabel}
        title={buttonLabel}
        onClick={() => onToggle(!open)}
      >
        {totals.starting ? (
          <SyncIcon size={13} className="spin-sync" />
        ) : (
          <PlugIcon size={13} />
        )}
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
            <span className="ports-popover__title">
              <PlugIcon size={14} />
              {t("ports.title", "端口转发")}
            </span>
            <span className="ports-popover__count" aria-live="polite">
              {t("ports.runningCount", "{{count}} 个运行中", { count })}
              <span className="ports-popover__sep" aria-hidden="true">·</span>
              {t("ports.totalCount", "{{count}} 个映射", { count: totals.total })}
            </span>
            <IconButton
              variant="ghost"
              size="sm"
              className="ports-popover__close"
              label={t("dialog.close", "关闭")}
              onClick={() => {
                onToggle(false);
                button.current?.focus();
              }}
            >
              <CloseIcon />
            </IconButton>
          </div>

          <form className="ports-form" onSubmit={add}>
            <div className="ports-form__target">
              <span>
                {t("ports.addTo", "添加到")}{" "}
                <strong>{selectedSession ?? t("ports.noSession", "未选择会话")}</strong>
              </span>
              <button
                type="button"
                className="ports-form__advanced"
                aria-expanded={advanced}
                onClick={() => setAdvanced(!advanced)}
              >
                {t("ports.advanced", "更多选项")}
                <span className="ports-form__twisty" aria-hidden="true">
                  <ChevronRightIcon size={10} />
                </span>
              </button>
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
              <span className="ports-form__arrow" aria-hidden="true">→</span>
              <Input
                data-testid="ports-local"
                value={local}
                onChange={(event) => setLocal(event.target.value)}
                placeholder={t("ports.localPortAuto", "本地（自动）")}
                aria-label={t("ports.localPortAuto", "本地（自动）")}
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

            {advanced && (
              <>
                <div className="ports-form__row ports-form__row--advanced">
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
                <p className="hint">
                  {t("ports.remoteHostHint", "连接由运行时发起，不是本机代理。")}
                </p>
              </>
            )}

            {!selectedSession && (
              <p className="hint">{t("ports.selectSession", "先选择一个会话，再添加端口映射。")}</p>
            )}
            {selectedSession && !connectionReady && (
              <p className="hint">{t("ports.connectionHint", "启动映射会先连接运行时。")}</p>
            )}
            {error && <p className="error">{error}</p>}
          </form>

          <div className="ports-popover__body">
            {groups.length === 0 ? (
              <PortsEmpty onUseExample={setRemote} />
            ) : (
              groups.map(([session, list]) => (
                <section key={session} className="ports-group">
                  <h3 className="ports-group__head">
                    <span className="ports-group__name" title={session}>{session}</span>
                    <span className="ports-group__count">{list.length}</span>
                  </h3>
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

function PortsEmpty({ onUseExample }: { onUseExample(port: string): void }) {
  const { t } = useTranslation();
  return (
    <div className="ports-empty">
      <span className="ports-empty__icon" aria-hidden="true">
        <PlugIcon size={16} />
      </span>
      <p className="ports-empty__title">{t("ports.empty", "把运行时的端口映射到本机")}</p>
      <p className="ports-empty__hint">
        {t("ports.emptyHint", "例如 Gradio 7860、vLLM 8000，或任意 TCP 服务。")}
      </p>
      <div className="ports-empty__examples">
        {["7860", "8000"].map((port) => (
          <button
            key={port}
            type="button"
            className="ports-empty__example"
            aria-label={t("ports.useExample", "使用 {{port}}", { port })}
            onClick={() => onUseExample(port)}
          >
            {port}
          </button>
        ))}
      </div>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <IconButton
      variant="ghost"
      size="sm"
      className="port-row__action"
      label={label}
      onClick={onClick}
    >
      {children}
    </IconButton>
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
  const remote = `${forward.remote_host}:${forward.remote_port}`;

  let actions: ReactNode = null;
  if (forward.status === "active" && url) {
    actions = (
      <>
        <ActionButton label={t("ports.open", "打开")} onClick={() => onOpen(url)}>
          <ExternalIcon size={12} />
        </ActionButton>
        <ActionButton label={t("ports.copy", "复制")} onClick={() => onCopy(url)}>
          <CopyIcon size={12} />
        </ActionButton>
        <ActionButton label={t("ports.stop", "停止")} onClick={() => onStop(forward.id)}>
          <StopIcon size={12} />
        </ActionButton>
      </>
    );
  } else if (forward.status === "stopped") {
    actions = (
      <>
        <ActionButton label={t("ports.start", "启动")} onClick={() => onStart(forward.id)}>
          <PlayIcon size={12} />
        </ActionButton>
        <ActionButton label={t("ports.remove", "删除")} onClick={() => onRemove(forward.id)}>
          <TrashIcon size={12} />
        </ActionButton>
      </>
    );
  } else if (forward.status === "error") {
    actions = (
      <>
        <ActionButton label={t("ports.retry", "重试")} onClick={() => onStart(forward.id)}>
          <RestartIcon size={12} />
        </ActionButton>
        <ActionButton label={t("ports.remove", "删除")} onClick={() => onRemove(forward.id)}>
          <TrashIcon size={12} />
        </ActionButton>
      </>
    );
  }

  return (
    <div
      className="port-row"
      data-testid={`port-row-${forward.id}`}
      data-local-port={forward.local_port ?? ""}
    >
      <div className="port-row__lead">
        <span className="port-row__port">{forward.remote_port}</span>
        <span className={`port-row__status port-row__status--${forward.status}`}>
          {forward.status === "starting" ? (
            <SyncIcon size={11} className="spin-sync" />
          ) : (
            <span className="port-row__dot" aria-hidden="true" />
          )}
          {t(portStatusKey(forward.status), forward.status)}
        </span>
      </div>
      <div className="port-row__main">
        <span className="port-row__url">
          <span className="port-row__arrow" aria-hidden="true">
            <ChevronRightIcon size={10} />
          </span>
          {url ? (
            <button
              type="button"
              className="port-row__url-text"
              title={url}
              onClick={() => onOpen(url)}
            >
              {url}
            </button>
          ) : (
            <span className="port-row__url-text port-row__url-text--idle">—</span>
          )}
        </span>
        <span className="port-row__meta">
          <span className="port-row__remote" title={remote}>{remote}</span>
        </span>
      </div>
      {actions && <div className="port-row__actions">{actions}</div>}
      {forward.error && <p className="port-row__error">{forward.error}</p>}
    </div>
  );
}
