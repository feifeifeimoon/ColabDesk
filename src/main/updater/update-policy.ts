/**
 * The updater's decisions that are worth stating once and testing directly:
 * whether it runs at all, and how long to wait after a failure. Everything
 * here is pure — the Electron and electron-updater plumbing lives next door.
 */

/** How often a healthy install looks for a new version. */
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** First retry after a failed check; doubles per consecutive failure. */
export const RETRY_BASE_MS = 60 * 60 * 1000;

/**
 * Ceiling for that backoff. A feed that stays broken should not turn into a
 * request every hour forever, which is what a fixed retry produced before the
 * cap existed.
 */
export const RETRY_MAX_MS = 6 * 60 * 60 * 1000;

/** Long enough for the renderer to flush, short enough not to feel stuck. */
export const QUIT_AND_INSTALL_DELAY_MS = 100;

/**
 * How long to wait for a clean exit before forcing it. The installer cannot
 * replace files a live process still holds, and a wedged teardown would
 * otherwise leave the user with a splash and no app.
 */
export const INSTALL_EXIT_WATCHDOG_MS = 20_000;

export function retryDelayMs(consecutiveFailures: number): number {
  const failures = Number.isFinite(consecutiveFailures) ? Math.max(1, Math.floor(consecutiveFailures)) : 1;
  // The exponent is clamped before it is applied rather than after: 2 ** 9999 is
  // Infinity, and Math.min(Infinity, cap) only works by luck of comparison order.
  const exponent = Math.min(failures - 1, 32);
  return Math.min(RETRY_BASE_MS * 2 ** exponent, RETRY_MAX_MS);
}

export interface UpdateCapability {
  isPackaged: boolean;
  platform: NodeJS.Platform;
  /** Set only by the E2E harness; a real build never has one. */
  e2eFeed: string | null;
}

/**
 * Whether this process should run the updater at all.
 *
 * Two gates, for two different reasons. Packaged-only because a dev checkout
 * has no `app-update.yml` and no installed version to replace — the E2E feed
 * exists to lift exactly this one, so the flow can be driven without cutting a
 * release. And macOS is excluded outright: Electron's updater there is
 * Squirrel.Mac, which throws while constructing itself when the running app has
 * no code signature, so an unsigned build has no updater to run.
 */
export function canUseUpdater({ isPackaged, platform, e2eFeed }: UpdateCapability): boolean {
  if (!isPackaged && e2eFeed === null) return false;
  return platform !== "darwin";
}
