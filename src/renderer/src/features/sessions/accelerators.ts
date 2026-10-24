import type { AcceleratorEligibility } from "@shared/types";

/** `colab new` accepts exactly these (see its `--gpu` / `--tpu` help). */
export const ACCELERATORS = [
  { id: "cpu", label: "CPU" },
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
 * Reference compute units per hour, by the key `acceleratorKey` produces.
 *
 * Colab publishes no per-accelerator table, and the account's own
 * `consumptionRateHourly` is the only authoritative figure. These values were
 * measured on 2026-10-22 by allocating one session per machine, reading
 * `consumptionRateHourly` twice and stopping it. H100 is refused for this
 * account, G4's high-RAM shape was refused, and V6E1 kept timing out after
 * 120 s, so those few figures are provisional; the rest are measurements.
 * `null` means "not known", which is not the same as zero.
 */
interface AcceleratorRate {
  /** Standard shape, CU per hour. */
  standard: number | null;
  /** HIGH_RAM shape, CU per hour; `undefined` when the machine has one shape. */
  highRam?: number | null;
}

const ACCELERATOR_RATES: Record<string, AcceleratorRate> = {
  CPU: { standard: 0.08, highRam: 0.26 },
  T4: { standard: 1.07, highRam: 1.27 },
  L4: { standard: 1.54 },
  A100: { standard: 5.3, highRam: 6.77 },
  // High-RAM G4 was refused for this account; ~1.2x is the T4/A100 premium.
  G4: { standard: 8.9, highRam: 10.6 },
  // H100 is not available to this account; the public dollar rate is the only
  // figure there is. The high-RAM value extrapolates the same ~1.2x premium.
  H100: { standard: 18.62, highRam: 22.34 },
  V100: { standard: 5.45, highRam: 8.18 },
  "TPU V2": { standard: 1.3 },
  "TPU V5E1": { standard: 2.92 },
  // Three allocation attempts timed out in the backend; a community report is
  // the only figure available until a session can be measured.
  "TPU V6E1": { standard: 4.6 },
  TPU: { standard: null },
};

/** `SINGLE_SHAPE`, keyed the way `acceleratorKey` produces it. */
const SINGLE_SHAPE_KEYS = new Set(["L4", "TPU V5E1", "TPU V6E1"]);

/**
 * One key for the spellings a machine id arrives in: the picker writes
 * `tpu:v6e1`, while the backend and `sessions.json` write `V6E1` (and `NONE`
 * for a CPU runtime).
 */
export function acceleratorKey(accelerator: string | null | undefined): string {
  const upper = typeof accelerator === "string" ? accelerator.trim().toUpperCase() : "";
  if (!upper || upper === "NONE" || upper === "CPU") return "CPU";
  if (upper === "TPU:V5E1" || upper === "V5E1") return "TPU V5E1";
  if (upper === "TPU:V6E1" || upper === "V6E1") return "TPU V6E1";
  if (upper === "TPU:V2" || upper === "V2") return "TPU V2";
  return upper;
}

/**
 * The machine class, for the rail's leading icon. Every accelerator this app
 * knows falls into one of three: a CPU runtime, a GPU, or a TPU.
 */
export type AcceleratorKind = "cpu" | "gpu" | "tpu";

export function acceleratorKind(accelerator: string | null | undefined): AcceleratorKind {
  const key = acceleratorKey(accelerator);
  if (key === "CPU") return "cpu";
  if (key.startsWith("TPU")) return "tpu";
  return "gpu";
}

/** The picker's display name for a machine id. */
export function acceleratorLabel(accelerator: string | null | undefined): string {
  const key = acceleratorKey(accelerator);
  if (key === "TPU V5E1") return "TPU v5e1";
  if (key === "TPU V6E1") return "TPU v6e1";
  if (key === "TPU V2") return "TPU v2";
  return key;
}

export interface SessionRate {
  /** Compute units per hour, or null when no figure is known. */
  rate: number | null;
  /** True when this is the account's own reading, not a reference value. */
  actual: boolean;
}

/**
 * The rate to print for one session.
 *
 * `actualRate` is the account reading when this is the only runtime being
 * billed; it already includes the accelerator and shape, so it wins over the
 * table. Otherwise the table answers, and HIGH_RAM uses its own measured rate
 * only on machines that offer the choice (`L4` and the TPUs have one shape).
 */
export function sessionRate(
  accelerator: string | null | undefined,
  highRam: boolean,
  actualRate: number | null,
): SessionRate {
  if (actualRate !== null) return { rate: actualRate, actual: true };
  const key = acceleratorKey(accelerator);
  const entry = ACCELERATOR_RATES[key];
  if (!entry || entry.standard === null) return { rate: null, actual: false };
  if (!highRam || SINGLE_SHAPE_KEYS.has(key)) return { rate: entry.standard, actual: false };
  return { rate: entry.highRam ?? null, actual: false };
}

/** `~` is a reference value, no `~` is the account's own reading, `—` is unknown. */
export function sessionRateText(rate: SessionRate): string {
  if (rate.rate === null) return "—/h";
  const value = rate.rate.toFixed(2);
  return rate.actual ? `${value}/h` : `~${value}/h`;
}

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
