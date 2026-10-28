import { useTranslation } from "react-i18next";
import { Button } from "../components/ui/Button";
import { PanelRightIcon } from "../components/ui/icons";
import { useAppStore } from "../store";

/**
 * The files panel's toggle. The global bar and a live workspace's fixed
 * top-right corner both carry it, so it lives here once: two copies drifted
 * apart before, and the label, keycap and pressed state have to stay identical.
 */
export function FilesPanelToggle() {
  const { t } = useTranslation();
  const filesOpen = useAppStore((state) => state.filesOpen);
  const toggleFiles = useAppStore((state) => state.toggleFiles);

  return (
    <Button
      variant="ghost"
      icon
      data-testid="toggle-files"
      aria-pressed={filesOpen}
      aria-label={filesOpen ? t("topbar.filesCollapse", "收起文件面板") : t("topbar.filesExpand", "展开文件面板")}
      title={t("topbar.filesTooltip", "{{action}}文件面板（Ctrl+Shift+B）", {
        action: filesOpen ? t("topbar.actionCollapse", "收起") : t("topbar.actionExpand", "展开"),
      })}
      onClick={toggleFiles}
    >
      <PanelRightIcon />
    </Button>
  );
}
