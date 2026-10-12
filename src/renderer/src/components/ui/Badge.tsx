import type { ReactNode } from "react";

export type Tone = "neutral" | "ink" | "warn" | "info" | "danger" | "off";

const BADGE_TONE: Record<Tone, string> = {
  neutral: "",
  ink: "badge--ink",
  warn: "badge--warn",
  info: "badge--info",
  danger: "badge--danger",
  off: "badge--off",
};

export type StatusTone = "neutral" | "good" | "warn" | "danger";

const STATUS_TONE: Record<StatusTone, string> = {
  neutral: "",
  good: "status--good",
  warn: "status--warn",
  danger: "status--danger",
};

/** Identifiers and counts: what a thing *is* (`T4`, `GPU`, `colab 0.7.4`). */
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`badge ${BADGE_TONE[tone]}`.trim()}>{children}</span>;
}

/**
 * Status is always a dot plus a written label: colour alone never carries the
 * state, so it survives grayscale and colour-blindness.
 */
export function Status({ children, tone = "neutral" }: { children: ReactNode; tone?: StatusTone }) {
  return <span className={`status ${STATUS_TONE[tone]}`.trim()}>{children}</span>;
}
