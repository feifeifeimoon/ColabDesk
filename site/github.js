// Where the repository lives, and how its star count is rendered for the badge.
// Pure so the formatting is testable.

export const GITHUB = {
  origin: "https://github.com",
  api: "https://api.github.com",
  repo: "feifeifeimoon/ColabDesk",
  releasesPage: "https://github.com/feifeifeimoon/ColabDesk/releases/latest",
};

/** 1200 → "1.2k", 98600 → "98.6k", 1500000 → "1.5m"; junk or negative → null. */
export function formatStars(count) {
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
