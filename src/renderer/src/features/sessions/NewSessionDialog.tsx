import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AcceleratorEligibility, CommandReport } from "@shared/types";
import { Button } from "../../components/ui/Button";
import { CopyButton } from "../../components/ui/CopyButton";
import { Checkbox, Field, Input } from "../../components/ui/Field";
import { Callout } from "../../components/ui/Notice";
import { createSession, messageOf } from "../../lib/api";
import { failureHint, failureLabel, failureReason } from "../../lib/failure";
import { useAppStore } from "../../store";
import { Dialog } from "../../app-shell/AppShell";

/** `colab new` accepts exactly these (see its `--gpu` / `--tpu` help). */
const ACCELERATORS = [
  { id: "cpu", label: "CPU（无加速器）" },
  { id: "T4", label: "T4" },
  { id: "L4", label: "L4" },
  { id: "G4", label: "G4" },
  { id: "A100", label: "A100" },
  { id: "H100", label: "H100" },
  { id: "tpu:v5e1", label: "TPU v5e1" },
  { id: "tpu:v6e1", label: "TPU v6e1" },
];

/** The CLI ignores `--high-mem` for these: they only offer one machine shape. */
const SINGLE_SHAPE = new Set(["L4", "tpu:v5e1", "tpu:v6e1"]);

/**
 * Which of the above the signed-in account may actually allocate.
 *
 * Names are folded to upper case because the accelerator names already are
 * (`T4`, `A100`), while the picker spells TPUs lower case for the CLI's sake
 * (`tpu:v6e1`). `null` means "not known" — an unreachable backend must leave
 * every option selectable, since `colab new` is the only thing that truly
 * decides.
 */
export function unavailableAccelerators(eligibility: AcceleratorEligibility | null): Set<string> {
  if (!eligibility) return new Set();
  const names = [...eligibility.ineligible_gpus, ...eligibility.ineligible_tpus.map((tpu) => `tpu:${tpu}`)];
  return new Set(names.map((name) => name.toUpperCase()));
}

/** Whether one picker option is among what the account was refused. */
function isUnavailable(unavailable: Set<string>, optionId: string): boolean {
  return unavailable.has(optionId.toUpperCase());
}

/**
 * What the picker starts on: the first option this account can actually get.
 * T4 is only the fallback when the backend has not told us anything.
 */
export function defaultAccelerator(unavailable: Set<string>): string {
  return ACCELERATORS.find((option) => option.id !== "cpu" && !isUnavailable(unavailable, option.id))?.id ?? "T4";
}

/**
 * The create-session dialog, mounted only while it is open. A blank slate per
 * opening is what the mount buys — a name typed at a cancelled attempt must not
 * still be sitting there, waiting to be created by accident — and unlike a
 * reset effect it cannot run at any other time.
 */
export function NewSessionDialog() {
  const open = useAppStore((state) => state.newSessionOpen);
  return open ? <NewSessionForm /> : null;
}

function NewSessionForm() {
  const { t } = useTranslation();
  const closeNewSession = useAppStore((state) => state.closeNewSession);
  const sessionCreated = useAppStore((state) => state.sessionCreated);
  const eligibility = useAppStore((state) => state.env?.accelerator_eligibility ?? null);

  // Memoised: a Set built during render is a new reference every time, and the
  // correction below is keyed on it.
  const unavailable = useMemo(() => unavailableAccelerators(eligibility), [eligibility]);

  const [name, setName] = useState("");
  const [accelerator, setAccelerator] = useState(() => defaultAccelerator(unavailable));
  const [highMem, setHighMem] = useState(false);
  const [pending, setPending] = useState(false);
  const [report, setReport] = useState<CommandReport | null>(null);

  // An entitlement that lands after the dialog opened can leave the pick
  // unallocatable, so the picker follows it — and only the picker. The name
  // being typed is not this effect's business.
  useEffect(() => {
    setAccelerator((current) =>
      isUnavailable(unavailable, current) ? defaultAccelerator(unavailable) : current,
    );
  }, [unavailable]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    // The option is disabled, but the selection survives the eligibility
    // arriving late — so the submit is what has to refuse it.
    if (isUnavailable(unavailable, accelerator)) return;
    const isTpu = accelerator.startsWith("tpu:");
    setPending(true);
    setReport(null);
    try {
      const result = await createSession({
        gpu: isTpu || accelerator === "cpu" ? null : accelerator,
        tpu: isTpu ? accelerator.slice(4) : null,
        name: name.trim() || null,
        highMem,
      });
      setReport(result);
      if (result.ok) void sessionCreated(name.trim() || null);
    } catch (cause) {
      setReport({
        ok: false,
        code: null,
        timed_out: false,
        output: "",
        error: messageOf(cause),
        attempts: 1,
      });
    } finally {
      setPending(false);
    }
  }

  const chosenName =
    accelerator === "cpu"
      ? t("sessions.acceleratorCpu", "CPU（无加速器）")
      : (ACCELERATORS.find((option) => option.id === accelerator)?.label ?? accelerator);
  // The footer's left half: what the button is about to create, in the
  // machine's voice. High memory is left out for the accelerators that only
  // have one machine shape, because the checkbox is disabled for them too.
  const summary = [
    chosenName,
    highMem && !SINGLE_SHAPE.has(accelerator) ? t("sessions.summaryHighMem", "高内存") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Dialog
      title={t("sessions.newTitle", "新建会话")}
      onClose={closeNewSession}
      footer={
        <>
          <span className="dialog__summary" data-testid="session-summary">
            {summary}
          </span>
          <span className="row">
            <Button variant="ghost" onClick={closeNewSession} disabled={pending}>
              {t("sessions.cancelButton", "取消")}
            </Button>
            <Button variant="primary" type="submit" form="new-session-form" disabled={pending}>
              {pending ? t("sessions.creatingButton", "正在申请运行时…") : t("sessions.createButton", "创建")}
            </Button>
          </span>
        </>
      }
    >
      <form id="new-session-form" className="stack" onSubmit={submit}>
        {/*
          The one decision this dialog exists for is a surface of choices, not a
          dropdown: an accelerator is what the runtime will be, and the options
          this account cannot get say so in place instead of being one keystroke
          away (DESIGN: the strikethrough carries the meaning). Native radios sit
          underneath, hidden, so the keyboard and the screen reader keep their
          usual behaviour; the label is the card.
        */}
        <fieldset className="accelerator-picker" data-testid="accelerator-picker">
          <legend className="accelerator-picker__legend">
            {t("sessions.acceleratorLabel", "加速器")}
          </legend>
          {eligibility ? (
            <p className="accelerator-picker__hint">
              {t("sessions.acceleratorAvailable", "当前账号可用：{{list}}", {
                list: [...eligibility.gpus, ...eligibility.tpus].join(" / "),
              })}
            </p>
          ) : null}
          <div className="accelerator-picker__grid">
            {ACCELERATORS.map((option) => {
              const off = isUnavailable(unavailable, option.id);
              const chosen = accelerator === option.id;
              return (
                <label
                  key={option.id}
                  className={[
                    "accelerator-option",
                    chosen ? "accelerator-option--chosen" : "",
                    off ? "accelerator-option--off" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <input
                    type="radio"
                    className="visually-hidden"
                    name="accelerator"
                    value={option.id}
                    checked={chosen}
                    disabled={off}
                    onChange={() => setAccelerator(option.id)}
                  />
                  <span className="accelerator-option__name">
                    {option.id === "cpu"
                      ? t("sessions.acceleratorCpu", "CPU（无加速器）")
                      : option.label}
                  </span>
                  {off && (
                    <span className="accelerator-option__note">
                      {t("sessions.acceleratorUnavailable", "当前账号不可用")}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>

        <Checkbox
          label={t("sessions.highMemLabel", "高内存机型（需 Colab Pro/Pro+）")}
          checked={highMem && !SINGLE_SHAPE.has(accelerator)}
          disabled={SINGLE_SHAPE.has(accelerator)}
          onChange={(e) => setHighMem(e.target.checked)}
        />

        <Field label={t("sessions.nameLabel", "会话名称")} hint={t("sessions.nameHint", "留空将自动生成")}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("sessions.namePlaceholder", "可选")}
            autoFocus
          />
        </Field>

        <p className="hint">{t("sessions.waitingHint", "申请云端运行时可能需要数分钟，请耐心等待。")}</p>

        {report?.error && <Callout tone="danger">{report.error}</Callout>}
        {report?.timed_out && (
          <Callout tone="warn">{t("sessions.timeoutCallout", "命令超时，已终止。稍后同步即可查看结果。")}</Callout>
        )}
        {report && !report.error && !report.timed_out && !report.ok && (
          <Callout tone="danger">
            <span className="row" style={{ justifyContent: "space-between", gap: "var(--space-2)" }}>
              <span>
                {failureLabel(report.code)}
                {failureHint(report.output) ?? failureReason(report.output)}
              </span>
              {/* The evidence travels to wherever the user is already talking about
                  it; the log is for whoever reads it afterwards. */}
              {report.output.trim() ? (
                <CopyButton
                  text={report.output.trim()}
                  label={t("sessions.copyDetails", "复制详情")}
                  copiedLabel={t("sessions.copiedDetails", "已复制")}
                />
              ) : null}
            </span>
          </Callout>
        )}
        {report?.ok && <Callout>{t("sessions.runtimeReadyCallout", "运行时已就绪，正在打开终端。")}</Callout>}
      </form>
    </Dialog>
  );
}
