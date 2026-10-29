import { useTranslation } from "react-i18next";
import type { TransferProgress } from "@shared/types";
import { Button, IconButton } from "../../components/ui/Button";
import { CloseIcon } from "../../components/ui/icons";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { formatPercent } from "../../lib/format";

export interface FileTransferTrayProps {
  transfers: TransferProgress[];
  onDismiss: (id: string) => void;
  onCancel: (id: string) => void;
}

/**
 * Bottom transfer progress tray rendering active and completed SFTP file transfers.
 */
export function FileTransferTray({ transfers, onDismiss, onCancel }: FileTransferTrayProps) {
  const { t } = useTranslation();

  if (transfers.length === 0) return null;

  return (
    <div className="transfers">
      {transfers.map((transfer) => (
        <div key={transfer.id} className="transfer">
          <div className="transfer__line">
            <span className="truncate">
              {transfer.direction === "upload" ? "↑" : "↓"} {transfer.name}
              {transfer.files ? ` (${transfer.files.done}/${transfer.files.total})` : ""}
            </span>
            <span className="row" style={{ gap: "var(--space-2)", flexShrink: 0 }}>
              <span
                className={`transfer__state ${
                  transfer.error ? "transfer__state--error" : transfer.done ? "transfer__state--ok" : ""
                }`}
              >
                {transfer.error
                  ? transfer.error
                  : transfer.canceled
                    ? t("files.transferCanceled", "已取消")
                    : transfer.done
                      ? transfer.skipped
                        ? t("files.transferSkipped", "已跳过 {{count}} 项", { count: transfer.skipped })
                        : t("files.transferDone", "完成")
                      : formatPercent(transfer.transferred, transfer.total)}
              </span>
              {transfer.done ? (
                <IconButton
                  variant="ghost"
                  size="sm"
                  label={t("files.dismissTransfer", "清除")}
                  onClick={() => onDismiss(transfer.id)}
                >
                  <CloseIcon />
                </IconButton>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onCancel(transfer.id)}
                  data-testid={`cancel-${transfer.id}`}
                >
                  {t("files.transferCancel", "取消")}
                </Button>
              )}
            </span>
          </div>
          {!transfer.done && (
            <ProgressBar ratio={transfer.total > 0 ? transfer.transferred / transfer.total : 0} />
          )}
        </div>
      ))}
    </div>
  );
}
