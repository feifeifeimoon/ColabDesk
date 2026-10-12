import type { ReactNode } from "react";

/** Soft-filled blocks: an explanation, a warning, a failure — never a card. */
export function Callout({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "warn" | "danger";
}) {
  return <div className={`callout ${tone === "info" ? "" : `callout--${tone}`}`.trim()}>{children}</div>;
}

export function EmptyState({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <p className="empty">
      {title ? <span className="empty__title">{title}</span> : null}
      <span>{children}</span>
    </p>
  );
}
