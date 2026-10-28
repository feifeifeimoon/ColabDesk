import { IS_MAC } from "../lib/platform";
import { useWorkspaceChrome } from "../store/selectors";
import { FilesPanelToggle } from "./FilesPanelToggle";
import { WindowControls } from "./WindowControls";

/**
 * The top-right corner of a live workspace. It sits over the top-right 40px of
 * the window: the files toggle always, and the window controls on Windows and
 * Linux. When the files panel is open this row is above its head; when it is
 * closed the top pane strip carries a matching trailing reserve.
 */
export function WorkspaceWindowChrome() {
  const workspace = useWorkspaceChrome();

  if (!workspace) return null;

  return (
    <div className="workspace-window-chrome">
      <FilesPanelToggle />
      {!IS_MAC && <WindowControls />}
    </div>
  );
}
