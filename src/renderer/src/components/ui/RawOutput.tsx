import { useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * The CLI's own words. Every action that shells out can show this, because a
 * parse that silently produces the wrong number is worse than a format the
 * user can see and report.
 */
export function RawOutput({
  text,
  label,
}: {
  text: string;
  label?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!text.trim()) return null;

  const displayLabel = label ?? t("rawOutput.defaultLabel", "命令输出");

  return (
    <div className="raw">
      <button type="button" className="raw-toggle" onClick={() => setOpen(!open)}>
        {open ? "▾" : "▸"} {displayLabel}
      </button>
      {open && <pre className="raw-body">{text}</pre>}
    </div>
  );
}
