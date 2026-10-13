/**
 * Assembles the updater for this process: which backend, how it reaches the
 * renderer, and what "quit and install" means here.
 *
 * Returns `null` when this build should not update at all, which is the common
 * case — a development checkout, or macOS before signing exists. The IPC layer
 * turns that into a status rather than a missing answer, so the settings panel
 * can say why instead of showing a button that does nothing.
 */

import { app } from "electron";
import { EVENTS } from "@shared/ipc";
import { broadcast } from "../broadcast";
import { e2eMockEnabled } from "../e2e/mode";
import { createE2EUpdateBackend } from "../e2e/update-backend";
import { canUseUpdater } from "./update-policy";
import { createUpdater, type Updater } from "./updater";

export async function setupUpdater(beforeInstall: () => void): Promise<Updater | null> {
  const e2e = e2eMockEnabled();
  if (!canUseUpdater({ isPackaged: app.isPackaged, platform: process.platform, e2e })) return null;

  // Imported lazily so a build that will never update does not load the library
  // at all — it reaches into Electron on construction.
  const { createElectronUpdateBackend } = await import("./update-backend-electron");
  const backend = e2e ? createE2EUpdateBackend() : createElectronUpdateBackend();

  const updater = createUpdater({
    backend,
    // The one place status reaches the renderer, so there is one place to look
    // when it does not.
    publish: (status) => broadcast(EVENTS.updateStatus, status),
    beforeInstall,
    forceExit: () => app.exit(0),
  });
  updater.start();
  return updater;
}
