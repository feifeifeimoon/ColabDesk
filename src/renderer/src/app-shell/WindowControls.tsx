import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CloseWindowIcon, MaximizeIcon, MinimizeIcon, RestoreIcon } from "../components/ui/icons";
import { closeWindow, minimizeWindow, onWindowMaximized, toggleMaximizeWindow } from "../lib/api";

/**
 * Minimize / maximize-restore / close, drawn by us because the frame is ours.
 * The workspace titlebar is 40px, so these stretch to the row like the old bar.
 */
export function WindowControls() {
  const { t } = useTranslation();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => onWindowMaximized(setMaximized), []);

  return (
    <div className="window-controls">
      <button
        type="button"
        className="window-controls__button"
        data-testid="window-minimize"
        aria-label={t("topbar.windowMinimize", "最小化")}
        title={t("topbar.windowMinimize", "最小化")}
        onClick={() => void minimizeWindow()}
      >
        <MinimizeIcon />
      </button>
      <button
        type="button"
        className="window-controls__button"
        data-testid="window-maximize"
        aria-label={maximized ? t("topbar.windowRestore", "还原") : t("topbar.windowMaximize", "最大化")}
        title={maximized ? t("topbar.windowRestore", "还原") : t("topbar.windowMaximize", "最大化")}
        onClick={() => void toggleMaximizeWindow()}
      >
        {maximized ? <RestoreIcon /> : <MaximizeIcon />}
      </button>
      <button
        type="button"
        className="window-controls__button window-controls__button--close"
        data-testid="window-close"
        aria-label={t("topbar.windowClose", "关闭")}
        title={t("topbar.windowClose", "关闭")}
        onClick={() => void closeWindow()}
      >
        <CloseWindowIcon />
      </button>
    </div>
  );
}
