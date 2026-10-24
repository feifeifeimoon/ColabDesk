import { useWorkspaceChrome } from "../store/selectors";
import { TopBar } from "./AppShell";

/**
 * The global top bar, except while a live workspace owns the top row. There the
 * top pane strip is the titlebar, so a second bar would stack chrome above it.
 */
export function ShellBar() {
  return useWorkspaceChrome() ? null : <TopBar />;
}
