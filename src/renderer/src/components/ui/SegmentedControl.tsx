import type { ReactNode } from "react";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  testId?: string;
}

/**
 * A single-choice control that reads as one track with a moving selection.
 *
 * Each segment is a toggle button (`aria-pressed`), not a radio input: the
 * settings tests and callers already address these choices as buttons, and a
 * group of pressed buttons is what a segmented control is.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  /** The group's name, e.g. "界面语言"; each segment carries its own label. */
  label: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={`segmented__item ${active ? "segmented__item--active" : ""}`}
            aria-pressed={active}
            data-testid={option.testId}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
