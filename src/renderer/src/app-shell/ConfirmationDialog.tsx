/**
 * The one confirmation surface. It is store-driven because the action that
 * asks the question is not a component: stopping a session and closing a batch
 * of dirty tabs await the answer, then continue or return.
 *
 * The question uses the app's own `Dialog` — a native `confirm()` would ignore
 * the theme, the language and the window's own window chrome.
 */

import { useTranslation } from "react-i18next";
import { Button } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";
import { useAppStore } from "../store";

export function ConfirmationDialog() {
  const { t } = useTranslation();
  const confirmation = useAppStore((state) => state.confirmation);
  const resolveConfirmation = useAppStore((state) => state.resolveConfirmation);

  if (!confirmation) return null;

  return (
    <Dialog
      size="confirm"
      title={confirmation.title}
      onClose={() => resolveConfirmation(false)}
      footer={
        <div className="dialog__actions">
          <Button variant="outline" onClick={() => resolveConfirmation(false)}>
            {t("dialog.cancel", "取消")}
          </Button>
          <Button
            variant={confirmation.destructive ? "destructive" : "primary"}
            autoFocus
            onClick={() => resolveConfirmation(true)}
          >
            {confirmation.confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="dialog__description">
        <p>{confirmation.body}</p>
      </div>
    </Dialog>
  );
}
