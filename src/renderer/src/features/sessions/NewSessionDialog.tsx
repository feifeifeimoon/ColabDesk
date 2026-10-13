import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AcceleratorEligibility, CommandReport } from "@shared/types";
import { Button } from "../../components/ui/Button";
import { Checkbox, Field, Input, Select } from "../../components/ui/Field";
import { Callout } from "../../components/ui/Notice";
import { RawOutput } from "../../components/ui/RawOutput";
import { createSession, messageOf } from "../../lib/api";
import { failureHint, failureLabel } from "../../lib/failure";
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

export function NewSessionDialog() {
  const { t } = useTranslation();
  const open = useAppStore((state) => state.newSessionOpen);
  const closeNewSession = useAppStore((state) => state.closeNewSession);
  const sessionCreated = useAppStore((state) => state.sessionCreated);
  const eligibility = useAppStore((state) => state.env?.accelerator_eligibility ?? null);

  const [name, setName] = useState("");
  const [accelerator, setAccelerator] = useState("T4");
  const [highMem, setHighMem] = useState(false);
  const [pending, setPending] = useState(false);
  const [report, setReport] = useState<CommandReport | null>(null);

  const unavailable = unavailableAccelerators(eligibility);

  // A dialog opens blank: a name typed at a cancelled attempt would otherwise
  // still be sitting there, waiting to be created by accident.
  useEffect(() => {
    if (!open) return;
    setName("");
    // The default has to be one this account can actually get; T4 is only the
    // fallback when the backend has not told us anything.
    setAccelerator(
      ACCELERATORS.find((option) => option.id !== "cpu" && !isUnavailable(unavailable, option.id))?.id ?? "T4",
    );
    setHighMem(false);
    setReport(null);
  }, [open, unavailable]);

  if (!open) return null;

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

  return (
    <Dialog title={t("sessions.newTitle", "新建会话")} onClose={closeNewSession}>
      <form className="stack" onSubmit={submit}>
        <Field label={t("sessions.nameLabel", "会话名称")} hint={t("sessions.nameHint", "留空将自动生成")}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("sessions.namePlaceholder", "可选")}
            autoFocus
          />
        </Field>

        <Field
          label={t("sessions.acceleratorLabel", "加速器")}
          hint={
            eligibility
              ? t("sessions.acceleratorAvailable", "当前账号可用：{{list}}", {
                  list: [...eligibility.gpus, ...eligibility.tpus].join(" / "),
                })
              : undefined
          }
        >
          <Select value={accelerator} onChange={(e) => setAccelerator(e.target.value)}>
            {ACCELERATORS.map((option) => (
              <option key={option.id} value={option.id} disabled={isUnavailable(unavailable, option.id)}>
                {option.id === "cpu" ? t("sessions.acceleratorCpu", "CPU（无加速器）") : option.label}
                {isUnavailable(unavailable, option.id) ? t("sessions.acceleratorUnavailable", "（当前账号不可用）") : ""}
              </option>
            ))}
          </Select>
        </Field>

        <Checkbox
          label={t("sessions.highMemLabel", "高内存机型（需 Colab Pro/Pro+）")}
          checked={highMem && !SINGLE_SHAPE.has(accelerator)}
          disabled={SINGLE_SHAPE.has(accelerator)}
          onChange={(e) => setHighMem(e.target.checked)}
        />

        <p className="hint">{t("sessions.waitingHint", "申请云端运行时可能需要数分钟，请耐心等待。")}</p>

        <div className="row">
          <Button variant="primary" type="submit" disabled={pending}>
            {pending ? t("sessions.creatingButton", "正在申请运行时…") : t("sessions.createButton", "创建")}
          </Button>
          <Button variant="ghost" onClick={closeNewSession} disabled={pending}>
            {t("sessions.cancelButton", "取消")}
          </Button>
        </div>

        {report?.error && <Callout tone="danger">{report.error}</Callout>}
        {report?.timed_out && (
          <Callout tone="warn">{t("sessions.timeoutCallout", "命令超时，已终止。稍后同步即可查看结果。")}</Callout>
        )}
        {report && !report.error && !report.timed_out && !report.ok && (
          <Callout tone="danger">
            {failureLabel(report.code)}
            {failureHint(report.output) ?? t("sessions.detailsInOutput", "详情见下方输出。")}
          </Callout>
        )}
        {report?.ok && <Callout>{t("sessions.runtimeReadyCallout", "运行时已就绪，正在打开终端。")}</Callout>}
        <RawOutput text={report?.output ?? ""} />
      </form>
    </Dialog>
  );
}
