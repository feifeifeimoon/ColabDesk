/**
 * The runtime-setup surface: the middle column while a runtime is commissioned.
 *
 * Not a dialog. Asking for a machine is a terminal-shaped job — the CLI prints
 * its own progress, the machine is the thing this column holds, and a modal
 * would dim the workbench to say "wait". So the console covers the work surface
 * (the terminals under it stay mounted), asks its three questions on one
 * screen, and then keeps printing what `colab new` actually says.
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
  const editCreation = useAppStore((state) => state.editCreation);

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

  const chosen = ACCELERATORS.find((option) => option.id === accelerator) ?? ACCELERATORS[0];
  const available = ACCELERATORS.filter((option) => !isUnavailable(unavailable, option.id));

  // The wait, counted from the store's timestamp so it survives a re-render —
  // and so reopening the surface mid-request shows the true elapsed time.
  useEffect(() => {
    if (phase !== "provisioning") return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  // Escape leaves the surface; during a request it leaves the request running
  // (the CLI cannot be cancelled safely), and closing the view is the honest
  // way to say "carry on without me".
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (phase === "failed") editCreation();
      else closeNewSession();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [closeNewSession, editCreation, phase]);

  function move(step: 1 | -1): void {
    const index = available.findIndex((option) => option.id === accelerator);
    const next = available[(index + step + available.length) % available.length];
    if (next) setAccelerator(next.id);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLFormElement>): void {
    // The name field owns its keys: arrows move a caret there, and a digit is
    // a character.
    if ((event.target as HTMLElement).closest(".setup__name")) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      move(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (/^[1-9]$/.test(event.key)) {
      const option = ACCELERATORS[Number(event.key) - 1];
      if (option && !isUnavailable(unavailable, option.id)) {
        event.preventDefault();
        setAccelerator(option.id);
      }
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  function submit(event: React.FormEvent): void {
    event.preventDefault();
    if (isUnavailable(unavailable, accelerator)) return;
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

      {phase === "setup" ? (
        <form ref={formRef} className="setup__form" onSubmit={submit} onKeyDown={onKeyDown}>
          <p className="setup__note">
            {eligibility
              ? t("sessions.acceleratorAvailable", "当前账号可用：{{list}}", {
                  list: [...eligibility.gpus, ...eligibility.tpus].join(" / "),
                })
              : t("sessions.setupEligibilityUnknown", "账号可用的加速器尚未读到 —— 都可以试，最终由 colab new 决定。")}
          </p>

          <fieldset className="setup__group">
            <legend className="setup__question">? {t("sessions.acceleratorLabel", "加速器")}</legend>
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
                        disabled={off}
                        autoFocus={selected}
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
                          ? t("sessions.acceleratorCpu", "CPU（无加速器）")
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

          <label className="setup__row">
            <span className="setup__question">? {t("sessions.highMemShort", "高内存机型")}</span>
            <input
              type="checkbox"
              className="visually-hidden"
              checked={highMem && !SINGLE_SHAPE.has(accelerator)}
              disabled={SINGLE_SHAPE.has(accelerator)}
              onChange={(event) => setHighMem(event.target.checked)}
            />
            <span className="setup__check" aria-hidden="true">
              {highMem && !SINGLE_SHAPE.has(accelerator) ? "[x]" : "[ ]"}
            </span>
            <span className="setup__row-note">
              {SINGLE_SHAPE.has(accelerator)
                ? t("sessions.highMemSingleShape", "这台加速器只有一种机型")
                : t("sessions.highMemNote", "需 Colab Pro/Pro+")}
            </span>
          </label>

          <label className="setup__row setup__name">
            <span className="setup__question">? {t("sessions.nameLabel", "会话名称")}</span>
            <input
              type="text"
              className="setup__input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("sessions.nameHint", "留空将自动生成")}
              spellCheck={false}
            />
          </label>

          <div className="setup__actions">
            <button type="submit" className="setup__action setup__action--primary">
              {t("sessions.createButton", "创建")}
            </button>
          </div>

          <p className="setup__hint">
            {t("sessions.setupKeys", "↑/↓ 或数字选择 · Enter 创建 · Esc 返回")}
          </p>
        </form>
      ) : (
        <div className="setup__console">
          <p className="setup__command" data-testid="setup-command">
            <span className="setup__prompt" aria-hidden="true">$ </span>
            {command}
          </p>

          {/* The CLI's own lines, as they arrive. `role="log"` so a screen
              reader hears them rather than discovering them later. */}
          <div className="setup__log" role="log" aria-live="polite">
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
                <button type="button" className="setup__action" onClick={() => editCreation()}>
                  {t("sessions.setupEdit", "返回修改")}
                </button>
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
              <p className="setup__hint">{t("sessions.setupFailedKeys", "Esc 返回修改")}</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
