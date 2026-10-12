import type { ReactNode } from "react";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className ?? ""}`.trim()}>{children}</section>;
}

export function CardHead({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="card__head">
      <div>
        <h2 className="card__title">{title}</h2>
        {description ? <p className="card__desc">{description}</p> : null}
      </div>
      {actions ? <div className="card__actions">{actions}</div> : null}
    </header>
  );
}

/**
 * One card per section, rows divided by hairlines — the shape facts and
 * settings take, so a four-fact page is a card, not four stacked fields.
 */
export function Panel({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel">
      {title ? (
        <header className="panel__head">
          <h2 className="card__title">{title}</h2>
        </header>
      ) : null}
      <div className="panel__body">{children}</div>
    </section>
  );
}

/** What it is on the left, how to read or change it on the right. */
export function PanelRow({
  label,
  description,
  value,
  actions,
  stacked = false,
  title,
  children,
}: {
  label: ReactNode;
  description?: ReactNode;
  value?: ReactNode;
  actions?: ReactNode;
  /** For a row whose content is a block (a form, a list) rather than a value. */
  stacked?: boolean;
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`panel-row ${stacked ? "panel-row--stacked" : ""}`.trim()}>
      <div className="panel-row__label">
        <div className="panel-row__title">{label}</div>
        {description ? <p className="panel-row__desc">{description}</p> : null}
      </div>
      {value !== undefined ? (
        <div className="panel-row__value" title={title ?? undefined}>
          {value}
        </div>
      ) : null}
      {actions ? <div className="row">{actions}</div> : null}
      {children}
    </div>
  );
}
