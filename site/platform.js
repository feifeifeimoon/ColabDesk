// Normalizes whatever a browser reports into one of the download targets the
// page knows, and turns that target into what the hero shows. Pure so the
// matrix of UA strings, asset names and button plans is testable without a
// browser.

/**
 * @param {object} report
 * @param {string} [report.userAgent] the full UA string, if any
 * @param {string} [report.platform] `navigator.userAgentData.platform` or `navigator.platform`
 * @param {string|null} [report.architecture] from `getHighEntropyValues(["architecture"])`
 * @param {number} [report.maxTouchPoints] iPadOS reports `MacIntel`; a touch screen says it is not a Mac
 * @returns {"win" | "mac-arm" | "mac-x64" | "mac" | "other"}
 */
export function detectPlatform({
  userAgent = "",
  platform = "",
  architecture = null,
  maxTouchPoints = 0,
} = {}) {
  const ua = userAgent.toLowerCase();
  const pf = String(platform).toLowerCase();
  if (pf.includes("win") || ua.includes("windows")) return "win";
  const isMac = pf.includes("mac") || ua.includes("macintosh") || ua.includes("mac os");
  if (!isMac) return "other";
  // iPadOS in desktop mode claims to be a Mac; no Mac has a touch screen.
  if (maxTouchPoints > 1) return "other";
  if (architecture) {
    const arch = String(architecture).toLowerCase();
    if (arch.includes("arm")) return "mac-arm";
    if (["x86", "i386", "x64", "amd64", "ia32"].some((name) => arch.includes(name))) return "mac-x64";
  }
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
    default:
      return null;
  }
}

/**
 * What the hero shows for one target: which asset the primary button points at
 * (`null` means the releases page), what the menu is called, and which menu
 * rows would only repeat the primary.
 *
 * A Mac whose architecture could not be read is the one guess: Safari and
 * Firefox do not expose the CPU, so the primary offers Apple silicon but the
 * menu keeps both Mac builds rather than hiding the one an Intel reader needs.
 *
 * @param {ReturnType<typeof detectPlatform>} target
 * @returns {{ labelKey: string, asset: string|null, hiddenAssets: string[], menuLabelKey: string }}
 */
export function downloadPlan(target) {
  switch (target) {
    case "win":
      return { labelKey: "hero.download.win", asset: "win", hiddenAssets: ["win"], menuLabelKey: "alt.label.mac" };
    case "mac-arm":
      return {
        labelKey: "hero.download.mac",
        asset: "mac-arm",
        hiddenAssets: ["mac-arm"],
        menuLabelKey: "alt.label.win",
      };
    case "mac-x64":
      return {
        labelKey: "hero.download.mac",
        asset: "mac-x64",
        hiddenAssets: ["mac-x64"],
        menuLabelKey: "alt.label.win",
      };
    case "mac":
      return {
        labelKey: "hero.download.mac",
        asset: "mac-arm",
        hiddenAssets: [],
        menuLabelKey: "alt.label.other",
      };
    default:
      return {
        labelKey: "hero.download.any",
        asset: null,
        hiddenAssets: [],
        menuLabelKey: "alt.label.all",
      };
  }
}
