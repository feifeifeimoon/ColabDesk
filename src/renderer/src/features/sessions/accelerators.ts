import type { AcceleratorEligibility } from "@shared/types";

/** `colab new` accepts exactly these (see its `--gpu` / `--tpu` help). */
export const ACCELERATORS = [
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
export const SINGLE_SHAPE = new Set(["L4", "tpu:v5e1", "tpu:v6e1"]);

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

/** Whether one option is among what the account was refused. */
export function isUnavailable(unavailable: Set<string>, optionId: string): boolean {
  return unavailable.has(optionId.toUpperCase());
}

/**
 * What the picker starts on: the first option this account can actually get.
 * T4 is only the fallback when the backend has not told us anything.
 */
export function defaultAccelerator(unavailable: Set<string>): string {
  return ACCELERATORS.find((option) => option.id !== "cpu" && !isUnavailable(unavailable, option.id))?.id ?? "T4";
}
