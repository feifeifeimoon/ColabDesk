import { useEffect } from "react";
import { StatusBar } from "./app-shell/AppShell";
import { Banners } from "./app-shell/Banners";
import { ConfirmationDialog } from "./app-shell/ConfirmationDialog";
import { SettingsPage } from "./app-shell/SettingsPage";
import { ShellBar } from "./app-shell/ShellBar";
import { Toasts } from "./app-shell/Toasts";
import { WorkspaceWindowChrome } from "./app-shell/WorkspaceWindowChrome";
import { useAppShortcuts } from "./app-shell/shortcuts";
import { Sidebar } from "./app-shell/Sidebar";
import { IS_MAC } from "./lib/platform";
import { Workbench } from "./features/workspace/Workbench";
import { startAppEvents } from "./store";
import "./assets/main.css";

/**
 * The workbench: sessions on the left, one terminal tab per session in the
 * middle, the runtime's files on the right, machine state along the bottom.
 * This is the shape a terminal tool has — nothing is a page you navigate to.
 *
 * A live workspace owns the top row: its top pane strip is the window titlebar,
 * so `ShellBar` steps aside and `WorkspaceWindowChrome` carries the top-right
 * controls. The start page, settings and runtime setup keep the one global bar.
 *
 * The shell itself holds no state. Each part subscribes to the slice it needs,
 * so a connection update repaints the pane strips and nothing else.
 */
export default function App() {
  useEffect(startAppEvents, []);
  useAppShortcuts();

  return (
    <div className="app" data-mac={IS_MAC ? "true" : undefined}>
      <ShellBar />
      <Banners />

      <div className="app-body">
        <Sidebar />

        <div className="main-column">
          <div className="work-surface">
            <Workbench />
          </div>
        </div>

        {/* A layer over the workbench, not a replacement for it: the terminals
            below are live SSH sessions and must not be torn down to read a
            setting. */}
        <SettingsPage />
      </div>

      <WorkspaceWindowChrome />
      <StatusBar />
      <Toasts />
      <ConfirmationDialog />
    </div>
  );
}
