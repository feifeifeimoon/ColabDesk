import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function Field({
  label,
  hint,
  inline = false,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  inline?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`field ${inline ? "field--inline" : ""}`.trim()}>
      <span>
        {label}
        {hint ? <span className="field__hint"> · {hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className ?? ""}`.trim()} {...rest} />;
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`input ${className ?? ""}`.trim()} {...rest} />;
}

/**
 * A boolean row's control. It draws no text of its own — the row's label is the
 * name — and states itself through `aria-checked`, so the switch is readable
 * without the row around it.
 */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="switch"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="switch__thumb" aria-hidden="true" />
    </button>
  );
}
