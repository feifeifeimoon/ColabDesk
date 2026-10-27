/**
 * An overlay that owns the screen: a question with a decision, or a read-only
 * tool whose content is copied elsewhere (the session's SSH snippet).
 *
 * A dialog, not an inline callout: the surface underneath stays visible so the
 * terminal or file it is about is still on screen. Escape, the backdrop and the
 * close button all mean "leave" — they call the same `onClose`.
 */

import { useEffect, useId, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { IconButton } from "./Button";
import { CloseIcon } from "./icons";

export function Dialog({
  title,
  onClose,
  children,
  footer,
  size = "form",
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** A confirmation is a narrow card; a form gets the wider surface; a tool
      dialog may use the window's height because its artifact is read in place. */
  size?: "form" | "confirm" | "tool";
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // A parked pane keeps its dialog mounted. Escape under a hidden or inert
      // surface belongs to the terminal that is on screen, not to a question
      // nobody can see.
      const dialog = root.current;
      if (!dialog || dialog.getClientRects().length === 0 || dialog.closest("[inert]")) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  return (
    <div
      ref={root}
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`dialog ${size === "confirm" ? "dialog--confirm" : size === "tool" ? "dialog--tool" : ""}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="dialog__head">
          <h2 className="dialog__title" id={titleId}>{title}</h2>
          <IconButton label={t("dialog.close", "关闭")} variant="ghost" size="sm" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </header>
        <div className="dialog__body">{children}</div>
        {footer ? <footer className="dialog__footer">{footer}</footer> : null}
      </div>
    </div>
  );
}
