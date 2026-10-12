import { useEffect } from "react";
import { StatusBar, TopBar } from "./app-shell/AppShell";
import { Banners } from "./app-shell/Banners";
import { SettingsPage } from "./app-shell/SettingsPage";
import { useAppShortcuts } from "./app-shell/shortcuts";
import { Sidebar } from "./app-shell/Sidebar";
import { NewSessionDialog } from "./features/sessions/NewSessionDialog";
import { Workbench } from "./features/workspace/Workbench";
import { startAppEvents } from "./store";
import "./assets/main.css";

/**
 * The workbench: sessions on the left, one terminal tab per session in the
 * middle, the runtime's files on the right, machine state along the bottom.
 * This is the shape a terminal tool has — nothing is a page you navigate to.
 *
 * The shell itself holds no state. Each part subscribes to the slice it needs,
 * so a connection update repaints the tab strip and nothing else.
 */
export default function App() {
  useEffect(startAppEvents, []);
  useAppShortcuts();

  return (
    <div className="app">
      <TopBar />
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

      <StatusBar />
      <NewSessionDialog />
    </div>
  );
}
