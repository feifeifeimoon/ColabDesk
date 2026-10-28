// Where the repository lives, and how its numbers are rendered for the badges.
// Pure so the formatting is testable.

export const GITHUB = {
  origin: "https://github.com",
  api: "https://api.github.com",
  repo: "feifeifeimoon/ColabDesk",
  releasesPage: "https://github.com/feifeifeimoon/ColabDesk/releases/latest",
};

/** 1200 → "1.2k", 98600 → "98.6k", 1500000 → "1.5m"; junk or negative → null. */
export function formatCount(count) {
  if (count === null || count === undefined || count === "") return null;
  const num = Number(count);
  if (!Number.isFinite(num) || num < 0) return null;
  if (num < 1000) return String(num);
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  }
  const thousands = num / 1000;
  const text = thousands >= 100 ? String(Math.round(thousands)) : thousands.toFixed(1).replace(/\.0$/, "");
  return `${text}k`;
}

/**
 * Downloads across every asset of every release — the definition the README's
 * shields.io badge uses, so the page and the badge never disagree. A non-array
 * answer is null rather than 0: "could not ask" must not render as "no one
 * downloaded it".
 */
export function totalDownloads(releases) {
  if (!Array.isArray(releases)) return null;
  let total = 0;
  for (const release of releases) {
    if (!Array.isArray(release?.assets)) continue;
    for (const asset of release.assets) {
      const count = Number(asset?.download_count);
      if (Number.isFinite(count) && count > 0) total += count;
    }
  }
  return total;
}
