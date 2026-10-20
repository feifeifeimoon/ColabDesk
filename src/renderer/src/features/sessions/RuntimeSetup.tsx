/**
 * The runtime-setup surface: the middle column while a runtime is commissioned.
 *
 * Not a dialog. Asking for a machine is a terminal-shaped job — the CLI prints
 * its own progress, the machine is the thing this column holds, and a modal
 * would dim the workbench to say "wait". So the console covers the work surface
 * (the terminals under it stay mounted), asks its three questions on one
 * screen, and keeps printing what `colab new` says below them on that screen.
 *
 * The palette is the terminal's own (`--terminal-*`), which follows the theme
 * the reader picked for terminals: this column is a machine from beginning to
 * end, and handing off to the terminal beside it should not change the colour
 * of the room.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createSessionArgs } from "@shared/create-session";
import type { CreateSessionOptions } from "@shared/api";
import { writeClipboard } from "../../lib/api";
import { useAppStore } from "../../store";
import {
  ACCELERATORS,
  SINGLE_SHAPE,
  defaultAccelerator,
  isUnavailable,
  unavailableAccelerators,
} from "./accelerators";

/** `m:ss`, because the wait is the only clock this screen has. */
function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function RuntimeSetup() {
  const { t } = useTranslation();
  const phase = useAppStore((state) => state.creation.phase);
  const request = useAppStore((state) => state.creation.request);
  const startedAt = useAppStore((state) => state.creation.startedAt);
  const lines = useAppStore((state) => state.creation.lines);
  const error = useAppStore((state) => state.creation.error);
  const eligibility = useAppStore((state) => state.env?.accelerator_eligibility ?? null);
  const startCreation = useAppStore((state) => state.startCreation);
  const closeNewSession = useAppStore((state) => state.closeNewSession);

  // Memoised: a Set built during render is a new reference every time.
  const unavailable = useMemo(() => unavailableAccelerators(eligibility), [eligibility]);

  /*
    A failed attempt comes back here with its request, because the usual next
    move is the same machine with one thing changed. A fresh opening starts
    blank, which is why these are initial values and not store fields: an
    abandoned name must not still be sitting here, waiting to be created by
    accident.
  */
  const [accelerator, setAccelerator] = useState(() =>
    request?.gpu ? request.gpu : request?.tpu ? `tpu:${request.tpu}` : request ? "cpu" : defaultAccelerator(unavailable),
  );
  const [highMem, setHighMem] = useState(request?.highMem ?? false);
  const [name, setName] = useState(request?.name ?? "");
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const listRef = useRef<HTMLFieldSetElement | null>(null);
  const highMemRef = useRef<HTMLInputElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  const chosen = ACCELERATORS.find((option) => option.id === accelerator) ?? ACCELERATORS[0];
  const available = ACCELERATORS.filter((option) => !isUnavailable(unavailable, option.id));
  const busy = phase === "provisioning";

  // The wait, counted from the store's timestamp so it survives a re-render —
  // and so reopening the surface mid-request shows the true elapsed time.
  useEffect(() => {
    if (phase !== "provisioning") return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  function move(step: 1 | -1): void {
    const index = available.findIndex((option) => option.id === accelerator);
    const next = available[(index + step + available.length) % available.length];
    if (next) setAccelerator(next.id);
  }

  /*
    Enter walks the form like an installer: the list, then the high-memory
    option, then the name, and only then the create. "Enter submits" from the
    first field is a web form's habit, not this screen's: the person is being
    walked through three answers. The walk stays live after a failure, because
    the form is still on screen to be edited.

    The handler sits on the window because the surface owns the keyboard while
    it is open (the workbench behind it is inert): a click on the empty part of
    the panel lands on `body`, and a form-level listener would go quiet there.
  */
  useEffect(() => {
    if (phase === "provisioning") return;
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const inName = Boolean(target?.closest(".setup__name-row"));

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        // A single-line input has nothing to do with these keys, so they keep
        // meaning "the next machine" even while a name is being typed.
        event.preventDefault();
        move(event.key === "ArrowDown" ? 1 : -1);
        return;
      }
      if (/^[1-9]$/.test(event.key)) {
        if (inName) return; // a digit is a character there
        const option = ACCELERATORS[Number(event.key) - 1];
        if (option && !isUnavailable(unavailable, option.id)) {
          event.preventDefault();
          setAccelerator(option.id);
        }
        return;
      }
      if (event.key !== "Enter") return;
      // A focused button does its own Enter.
      if (target instanceof HTMLButtonElement) return;
      event.preventDefault();
      if (inName) {
        formRef.current?.requestSubmit();
        return;
      }
      const highMemInput = highMemRef.current;
      // A machine with a single shape has no high-memory question to answer,
      // so its step is skipped rather than swallowing the Enter.
      if (target?.closest(".setup__high-mem") || highMemInput?.disabled) {
        nameRef.current?.focus();
        return;
      }
      highMemInput?.focus();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  });

  // Entering the form puts the keyboard on the chosen machine; a failure puts
  // it back in the name, which is where the next edit and the retry happen.
  useEffect(() => {
    if (phase === "setup") {
      const selected =
        listRef.current?.querySelector<HTMLInputElement>("input:checked:not(:disabled)") ??
        listRef.current?.querySelector<HTMLInputElement>("input:not(:disabled)");
      selected?.focus();
      return;
    }
    if (phase === "failed") nameRef.current?.focus();
  }, [phase]);

  // The log follows its own newest line; the page itself does not move, so the
  // answers above stay where the person left them.
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [lines]);

  // A request that just went out is brought into view once — the answers stay
  // above, but the thing the person started has to be visible.
  useEffect(() => {
    if (phase !== "provisioning") return;
    logRef.current?.scrollIntoView({ block: "nearest" });
  }, [phase, startedAt]);

  // Escape leaves the surface; during a request it leaves the request running
  // (the CLI cannot be cancelled safely), and closing the view is the honest
  // way to say "carry on without me".
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeNewSession();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [closeNewSession]);

  function submit(event: React.FormEvent): void {
    event.preventDefault();
    if (busy || isUnavailable(unavailable, accelerator)) return;
    const isTpu = accelerator.startsWith("tpu:");
    const options: CreateSessionOptions = {
      gpu: isTpu || accelerator === "cpu" ? null : accelerator,
      tpu: isTpu ? accelerator.slice(4) : null,
      name: name.trim() || null,
      highMem: highMem && !SINGLE_SHAPE.has(accelerator),
    };
    void startCreation(options);
  }

  const command = request ? `colab ${createSessionArgs(request).join(" ")}` : null;
  const wait = startedAt === null ? "0:00" : clock(now - startedAt);

  return (
    <section className="setup" data-testid="runtime-setup" aria-label={t("sessions.setupTitle", "新建运行时")}>
      <header className="setup__head">
        <span className="setup__brand">ColabDesk</span>
        <span className="setup__sep" aria-hidden="true">·</span>
        <span>{t("sessions.setupTitle", "新建运行时")}</span>
      </header>

      <form ref={formRef} className="setup__form" onSubmit={submit} aria-busy={busy}>
        <p className="setup__note">
          {eligibility
            ? t("sessions.acceleratorAvailable", "当前账号可用机型：{{list}}", {
                list: [...eligibility.gpus, ...eligibility.tpus].join(" / "),
              })
            : t("sessions.setupEligibilityUnknown", "账号可用的机型尚未读到 —— 都可以试，最终由 colab new 决定。")}
        </p>

        <fieldset className="setup__group" ref={listRef}>
          <legend className="setup__question">? {t("sessions.acceleratorLabel", "机型")}</legend>
          <ul className="setup__options">
            {ACCELERATORS.map((option, index) => {
              const off = isUnavailable(unavailable, option.id);
              const selected = accelerator === option.id;
              return (
                <li key={option.id}>
                  <label
                    className={`setup__option${selected ? " setup__option--selected" : ""}${off ? " setup__option--off" : ""}`}
                  >
                    <input
                      type="radio"
                      className="visually-hidden"
                      name="accelerator"
                      value={option.id}
                      checked={selected}
                      disabled={off || busy}
                      onChange={() => setAccelerator(option.id)}
                    />
                    <span className="setup__marker" aria-hidden="true">
                      {selected ? "▸" : ""}
                    </span>
                    <span className="setup__index" aria-hidden="true">
                      {index + 1}
                    </span>
                    <span className="setup__name">
                      {option.id === "cpu"
                        ? t("sessions.acceleratorCpu", "CPU（无 GPU/TPU）")
                        : option.label}
                    </span>
                    {off && (
                      <span className="setup__off-note">{t("sessions.acceleratorUnavailable", "当前账号不可用")}</span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>

        <label className="setup__row setup__high-mem">
          <span className="setup__question">? {t("sessions.highMemShort", "高内存")}</span>
          <input
            ref={highMemRef}
            type="checkbox"
            className="visually-hidden"
            checked={highMem && !SINGLE_SHAPE.has(accelerator)}
            disabled={SINGLE_SHAPE.has(accelerator) || busy}
            onChange={(event) => setHighMem(event.target.checked)}
          />
          <span className="setup__check" aria-hidden="true">
            {highMem && !SINGLE_SHAPE.has(accelerator) ? "[x]" : "[ ]"}
          </span>
          <span className="setup__row-note">
            {SINGLE_SHAPE.has(accelerator)
              ? t("sessions.highMemSingleShape", "该机型没有高内存版本")
              : t("sessions.highMemNote", "需 Colab Pro/Pro+")}
          </span>
        </label>

        <label className="setup__row setup__name-row">
          <span className="setup__question">? {t("sessions.nameLabel", "会话名称")}</span>
          <input
            ref={nameRef}
            type="text"
            className="setup__input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("sessions.nameHint", "留空将自动生成")}
            spellCheck={false}
            disabled={busy}
          />
        </label>

        <div className="setup__actions">
          <button type="submit" className="setup__action setup__action--primary" disabled={busy}>
            {t("sessions.createButton", "创建")}
          </button>
        </div>

        {phase === "setup" && (
          <p className="setup__hint">
            {t("sessions.setupKeys", "↑/↓ 或数字选择 · Enter 下一步 · Esc 返回")}
          </p>
        )}
      </form>

      {phase !== "setup" && (
        <div className="setup__console">
          <p className="setup__command" data-testid="setup-command">
            <span className="setup__prompt" aria-hidden="true">$ </span>
            {command}
          </p>

          {/* The CLI's own lines, as they arrive. `role="log"` so a screen
              reader hears them rather than discovering them later. */}
          <div className="setup__log" role="log" aria-live="polite" ref={logRef}>
            {lines.map((line, index) => (
              <p key={`${index}:${line}`} className="setup__line">
                {line}
              </p>
            ))}
          </div>

          {phase === "provisioning" ? (
            <>
              <p className="setup__wait" data-testid="setup-wait">
                <span className="setup__spinner" aria-hidden="true" />
                {t("sessions.setupWorking", "正在申请 {{machine}} 运行时…", { machine: chosen.label })}
                <span className="setup__sep" aria-hidden="true">·</span>
                <span data-testid="setup-elapsed">
                  {t("sessions.setupElapsed", "已等待 {{time}}", { time: wait })}
                </span>
              </p>
              <p className="setup__hint">{t("sessions.setupMayTake", "申请可能需要几分钟，完成后会自动打开终端。")}</p>
              <div className="setup__actions">
                <button type="button" className="setup__action" onClick={() => closeNewSession()}>
                  {t("sessions.setupBackground", "在后台继续")}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="setup__failed" data-testid="setup-error">
                {error}
              </p>
              <div className="setup__actions">
                {/* The evidence travels to wherever the person is already
                    talking about it; the log is for whoever reads it after. */}
                <button
                  type="button"
                  className="setup__action"
                  onClick={() => {
                    void writeClipboard([...lines, error ?? ""].join("\n").trim());
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? t("sessions.copiedDetails", "已复制") : t("sessions.copyDetails", "复制详情")}
                </button>
              </div>
              <p className="setup__hint">{t("sessions.setupFailedKeys", "修改后 Enter 重试 · Esc 返回")}</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
