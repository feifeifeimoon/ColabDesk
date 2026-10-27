import { useTranslation } from "react-i18next";
import { Button } from "../components/ui/Button";
import { PanelRightIcon } from "../components/ui/icons";
import { IS_MAC } from "../lib/platform";
import { useAppStore } from "../store";
import { useWorkspaceChrome } from "../store/selectors";
import { WindowControls } from "./WindowControls";

/**
 * The top-right corner of a live workspace. It sits over the top-right 40px of
 * the window: the files toggle always, and the window controls on Windows and
 * Linux. When the files panel is open this row is above its head; when it is
 * closed the top pane strip carries a matching trailing reserve.
 */
export function WorkspaceWindowChrome() {
  const { t } = useTranslation();
  const workspace = useWorkspaceChrome();
  const filesOpen = useAppStore((state) => state.filesOpen);
  const toggleFiles = useAppStore((state) => state.toggleFiles);

  if (!workspace) return null;

  return (
    <div className="workspace-window-chrome">
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
      {!IS_MAC && <WindowControls />}
    </div>
  );
}
