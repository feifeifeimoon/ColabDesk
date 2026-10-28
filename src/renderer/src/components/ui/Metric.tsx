import type { ReactNode } from "react";

/** A KPI block: the number a person came for, then what it counts. */
export function Metric({
  value,
  label,
  testId,
}: {
  value: ReactNode;
  /** The unit belongs here: a bare 42.50 does not say compute units or hours. */
  label: ReactNode;
  testId?: string;
}) {
  return (
    <div className="metric" data-testid={testId}>
      <span className="metric__value">{value}</span>
      <span className="metric__label">{label}</span>
    </div>
  );
}
