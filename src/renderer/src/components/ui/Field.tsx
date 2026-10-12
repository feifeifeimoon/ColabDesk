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

export function Checkbox({
  label,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className="checkbox">
      <input type="checkbox" {...rest} />
      {label}
    </label>
  );
}
