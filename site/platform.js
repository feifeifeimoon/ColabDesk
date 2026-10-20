// Normalizes whatever a browser reports into one of the download targets the
// page knows, and matches a target against the real release assets. Pure so
// the matrix of UA strings and asset names is testable without a browser.

/**
 * @param {object} report
 * @param {string} [report.userAgent] the full UA string, if any
 * @param {string} [report.platform] `navigator.userAgentData.platform` or `navigator.platform`
 * @param {string|null} [report.architecture] from `getHighEntropyValues(["architecture"])`
 * @returns {"win" | "mac-arm" | "mac-x64" | "mac" | "other"}
 */
export function detectPlatform({ userAgent = "", platform = "", architecture = null } = {}) {
  const ua = userAgent.toLowerCase();
  const pf = String(platform).toLowerCase();
  if (pf.includes("win") || ua.includes("windows")) return "win";
  const isMac = pf.includes("mac") || ua.includes("macintosh") || ua.includes("mac os");
  if (!isMac) return "other";
  if (architecture) {
    const arch = String(architecture).toLowerCase();
    if (arch.includes("arm")) return "mac-arm";
    if (arch.includes("x86") || arch.includes("i386")) return "mac-x64";
  }
  // Apple silicon unless proven otherwise — the page's reference does the same.
  return "mac";
}

/**
 * @param {ReturnType<typeof detectPlatform>} target
 * @param {Array<{name?: string, browser_download_url?: string}>} assets
 */
export function pickReleaseAsset(target, assets = []) {
  const find = (pattern) => assets.find((asset) => pattern.test(asset.name ?? "")) ?? null;
  switch (target) {
    case "win":
      return find(/\.exe$/);
    case "mac-arm":
      return find(/arm64.*\.dmg$/);
    case "mac-x64":
      return find(/(?:^|[^a-zA-Z0-9])x64\.dmg$/);
    case "mac":
      return find(/arm64.*\.dmg$/) ?? find(/(?:^|[^a-zA-Z0-9])x64\.dmg$/);
    default:
      return null;
  }
}
