/**
 * The corner where the app answers what just happened.
 *
 * A message goes here when it belongs to an action rather than to a screen: it
 * says so over whatever is on screen and leaves on its own, because the row
 * that raised it is often already gone. What the user has to *do* something
 * about — an update to install, a runtime that failed to load — is a banner
 * instead, since a message that expires cannot be an instruction.
 */

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { IconButton } from "../components/ui/Button";
import { CloseIcon } from "../components/ui/icons";
import { Callout } from "../components/ui/Notice";
import { useAppStore } from "../store";
import type { Toast } from "../store/types";

/** How long a message waits before taking itself away. */
const LIFETIME_MS: Record<Toast["tone"], number> = { info: 4000, warn: 8000, danger: 12000 };

export function Toasts() {
  const toasts = useAppStore((state) => state.toasts);
  if (toasts.length === 0) return null;

  // `status` rather than `alert`: these report outcomes, they do not interrupt.
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <ToastMessage key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

function ToastMessage({ toast }: { toast: Toast }) {
  const { t } = useTranslation();
  const dismissToast = useAppStore((state) => state.dismissToast);
  const { id, tone, text } = toast;

  // Keyed by id on purpose: the same sentence sent again arrives as a new
  // message, and its countdown starts over with it.
  useEffect(() => {
    const timer = setTimeout(() => dismissToast(id), LIFETIME_MS[tone]);
    return () => clearTimeout(timer);
  }, [id, tone, dismissToast]);

  return (
    <div className="toast">
      <Callout tone={tone}>
        <span className="row" style={{ justifyContent: "space-between", gap: "var(--space-2)" }}>
          <span>{text}</span>
          <IconButton
            label={t("toasts.dismiss", "关闭提示")}
            variant="ghost"
            size="sm"
            data-testid="toast-dismiss"
            onClick={() => dismissToast(id)}
          >
            <CloseIcon />
          </IconButton>
        </span>
      </Callout>
    </div>
  );
}
