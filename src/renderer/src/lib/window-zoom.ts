/**
 * Keeps the top bar's macOS traffic-light space and button vertical alignment
 * in step with Chromium page zoom.
 *
 * Native window buttons stay in 1x physical window pixels while `webFrame`
 * scales CSS by `zoomFactor`. Publishing `--ui-zoom-factor` lets the top bar's
 * left inset divide out the scale horizontally, and `syncTrafficLights` moves
 * the native buttons to the scaled 40px bar's vertical center.
 *
 * The same watcher reports the zoom level: the Appearance stepper and the page
 * must agree even when the zoom came from a chord rather than the stepper.
 */

import { syncTrafficLights, zoomFactor, zoomLevel } from "./api";

export interface ZoomSyncTarget {
  setProperty(name: string, value: string): void;
  addEventListener(type: "resize", listener: () => void): void;
  removeEventListener(type: "resize", listener: () => void): void;
}

function defaultTarget(): ZoomSyncTarget {
  return {
    setProperty: (name, value) => document.documentElement.style.setProperty(name, value),
    addEventListener: (type, listener) => window.addEventListener(type, listener),
    removeEventListener: (type, listener) => window.removeEventListener(type, listener),
  };
}

export function syncWindowZoom(options?: {
  readZoomFactor?: () => number;
  syncButtons?: (factor: number) => void;
  isMac?: boolean;
  setProperty?: (name: string, value: string) => void;
}): number {
  const readZoom = options?.readZoomFactor ?? zoomFactor;
  const syncButtons = options?.syncButtons ?? syncTrafficLights;
  const isMac = options?.isMac ?? navigator.userAgent.includes("Mac");
  const setProperty =
    options?.setProperty ?? ((name, value) => document.documentElement.style.setProperty(name, value));

  const raw = readZoom();
  const factor = Number.isFinite(raw) && raw > 0 ? raw : 1;
  setProperty("--ui-zoom-factor", String(factor));
  if (isMac) syncButtons(factor);
  return factor;
}

export function watchWindowZoom(options?: {
  readZoomFactor?: () => number;
  /** The page's zoom level, for the Appearance stepper. */
  readZoomLevel?: () => number;
  syncButtons?: (factor: number) => void;
  isMac?: boolean;
  target?: ZoomSyncTarget;
  /**
   * Called with the level on start and whenever a resize changes it. On start
   * the page has the last word: the stored level was applied before this runs,
   * so what is actually in effect is what the stepper must show.
   */
  onLevel?: (level: number) => void;
}): () => void {
  const target = options?.target ?? defaultTarget();
  const readZoom = options?.readZoomFactor ?? zoomFactor;
  const readLevel = options?.readZoomLevel ?? zoomLevel;
  const onLevel = options?.onLevel;
  const syncButtons = options?.syncButtons ?? syncTrafficLights;
  const isMac = options?.isMac ?? navigator.userAgent.includes("Mac");

  let lastFactor = syncWindowZoom({
    readZoomFactor: readZoom,
    syncButtons,
    isMac,
    setProperty: target.setProperty,
  });

  let lastLevel = 0;
  if (onLevel) {
    const initial = readLevel();
    if (Number.isFinite(initial)) {
      lastLevel = initial;
      onLevel(initial);
    }
  }

  const onResize = (): void => {
    const next = readZoom();
    if (next !== lastFactor) {
      lastFactor = syncWindowZoom({
        readZoomFactor: () => next,
        syncButtons,
        isMac,
        setProperty: target.setProperty,
      });
    }

    if (!onLevel) return;
    const nextLevel = readLevel();
    // A zoom chord changes both the factor and the level; a plain window
    // resize changes neither. NaN is not a reading, so it never overwrites one.
    if (!Number.isFinite(nextLevel) || nextLevel === lastLevel) return;
    lastLevel = nextLevel;
    onLevel(nextLevel);
  };

  target.addEventListener("resize", onResize);
  return () => target.removeEventListener("resize", onResize);
}
