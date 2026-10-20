// GitHub facts the page shows: where the repo lives, and how its two numbers
// (stars, version) are rendered. Pure so the formatting is testable.

export const GITHUB = {
  api: "https://api.github.com",
  repo: "feifeifeimoon/ColabDesk",
  releasesPage: "https://github.com/feifeifeimoon/ColabDesk/releases/latest",
  allReleases: "https://github.com/feifeifeimoon/ColabDesk/releases",
};

/** 1200 → "1.2k", 98600 → "98.6k", 150000 → "150k"; junk or negative → null. */
export function formatStars(count) {
  if (count === null || count === undefined || count === "") return null;
  const num = Number(count);
  if (!Number.isFinite(num) || num < 0) return null;
  if (num < 1000) return String(num);
  const thousands = num / 1000;
  const text = thousands >= 100 ? String(Math.round(thousands)) : thousands.toFixed(1).replace(/\.0$/, "");
  return `${text}k`;
}
