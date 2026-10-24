import { app, BrowserWindow, shell } from "electron";
import { join } from "node:path";
import { watchWindowState } from "./ipc/handlers/window";
import { installPageZoomShortcuts } from "./page-zoom";

const isMac = process.platform === "darwin";

/**
 * The top bar is 40px tall; its visual center sits at 20 CSS px from the top.
 * Native traffic lights stay 12px tall in window pixels while CSS scales with
 * page zoom, so their top edge follows `20 * zoomFactor - 6`.
 */
const TITLEBAR_CSS_CENTER = 20;
const TRAFFIC_LIGHT_RADIUS = 6;
const TRAFFIC_LIGHT_X = 14;

export function trafficLightPosition(zoomFactor = 1): { x: number; y: number } {
  const safeFactor = Number.isFinite(zoomFactor) && zoomFactor > 0 ? zoomFactor : 1;
  return {
    x: TRAFFIC_LIGHT_X,
    y: Math.max(0, Math.round(TITLEBAR_CSS_CENTER * safeFactor - TRAFFIC_LIGHT_RADIUS)),
  };
}

export function syncTrafficLightPosition(
  window: BrowserWindow,
  zoomFactor: number,
  platform: NodeJS.Platform = process.platform,
): void {
  if (platform !== "darwin" || window.isDestroyed()) return;
  window.setWindowButtonPosition(trafficLightPosition(zoomFactor));
}

/**
 * The window icon is a dev-checkout concern only. electron-builder bakes `resources/icon.*`
 * into the executable and the app bundle, so a packaged build already reports the right icon
 * on its own and setting one here would just be a second source of truth. In a dev checkout
 * nothing sets it, which is the case this covers.
 */
export function devIconPath(): string | undefined {
  if (app.isPackaged) return undefined;
  return join(app.getAppPath(), "resources", process.platform === "win32" ? "icon.ico" : "icon.png");
}

/**
 * The app draws its own title bar (the top bar is the window chrome and drag
 * region; tabs live in their panes below it), so the OS frame goes away: fully
 * frameless on Windows and Linux, and on macOS just the inset traffic lights,
 * which macOS users expect to stay native.
 */
export function createWindow(): BrowserWindow {
  // BrowserWindow ignores `icon` on macOS; that platform's dock is set in index.ts instead.
  const icon = isMac ? undefined : devIconPath();
  const window = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    title: "ColabDesk",
    autoHideMenuBar: true,
    backgroundColor: "#0b0e13",
    ...(icon ? { icon } : {}),
    ...(isMac
      ? { titleBarStyle: "hiddenInset" as const, trafficLightPosition: trafficLightPosition() }
      : { frame: false }),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  watchWindowState(window);
  installPageZoomShortcuts(window);
  if (isMac) {
    window.webContents.on("dom-ready", () => {
      syncTrafficLightPosition(window, window.webContents.getZoomFactor());
    });
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return window;
}

/** Chromium's viz compositor breaks on some virtualized desktops. */
export function disableHardwareAccelerationForVirtualDisplays(): void {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-gpu-compositing");
}
