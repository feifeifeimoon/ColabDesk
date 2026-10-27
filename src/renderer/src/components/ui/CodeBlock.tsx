/**
 * A copyable block of text: a labelled head, an action, and the code itself.
 *
 * The body never wraps. A wrapped `ProxyCommand` looks like several lines and
 * invites a paste that is not the text on screen; horizontal scrolling keeps
 * one line one line. The action lives in the head so it is reachable before the
 * reader scrolls a long line.
 */

import type { ReactNode } from "react";

export function CodeBlock({
  label,
  code,
  action,
}: {
  label: ReactNode;
  code: string;
  action?: ReactNode;
}) {
  return (
    <div className="code-block">
      <div className="code-block__head">
        <span className="code-block__label">{label}</span>
        {action}
      </div>
      <pre className="code-block__body">{code}</pre>
    </div>
  );
}
