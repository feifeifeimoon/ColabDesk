// The page's one script. It has three jobs: swap the language, point the
// download buttons at the visitor's platform, and fill in the GitHub numbers.
// Where a job cannot run, the markup's own fallback is what is left: the primary
// button is a plain link to the releases page, and the badge is still a link.

import { I18N, initialLanguage, readStoredLanguage, saveLanguage } from "./i18n.js";
import { detectPlatform, downloadPlan, pickReleaseAsset } from "./platform.js";
import { GITHUB, formatCount, totalDownloads } from "./github.js";

const $ = (selector) => document.querySelector(selector);

const langOptions = Array.from(document.querySelectorAll("[data-lang]"));
const starMeta = $("#star-meta");
const starCount = $("#star-count");
const downloadMeta = $("#download-meta");
const downloadCount = $("#download-count");
const primary = $("#download-primary");
const platformToggle = $("#platform-toggle");
const platformLabel = $("#platform-label");
const platformList = $("#platform-list");
const platformItems = Array.from(document.querySelectorAll("[data-platform]"));
const assetLinks = Array.from(document.querySelectorAll("[data-asset]"));

let target = "other";
let releaseAssets = [];

/** Even touching storage can throw in a sandboxed frame; a missing store is fine. */
function languageStore() {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

let lang = initialLanguage(navigator.language, readStoredLanguage(languageStore()));

// Same polarity rule as the app: the OS decides, and the brand's white lockup
// is swapped in by CSS rather than filtered.
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
function applyTheme() {
  document.documentElement.dataset.theme = darkQuery.matches ? "dark" : "light";
}

/** The release asset for a target, or the releases page while the API has not answered. */
function urlFor(assetTarget) {
  const asset = pickReleaseAsset(assetTarget, releaseAssets);
  return asset?.browser_download_url ?? GITHUB.releasesPage;
}

function applyLanguage() {
  const dict = I18N[lang];
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.title = dict["meta.title"];
  for (const el of document.querySelectorAll("[data-i18n]")) {
    el.textContent = dict[el.dataset.i18n];
  }
  for (const el of document.querySelectorAll("[data-i18n-aria]")) {
    el.setAttribute("aria-label", dict[el.dataset.i18nAria]);
  }
  for (const el of document.querySelectorAll("[data-i18n-alt]")) {
    el.setAttribute("alt", dict[el.dataset.i18nAlt]);
  }
  for (const option of langOptions) {
    option.setAttribute("aria-pressed", String(option.dataset.lang === lang));
  }
  renderDownloadCopy();
}

function renderDownloadCopy() {
  const dict = I18N[lang];
  const plan = downloadPlan(target);

  primary.textContent = dict[plan.labelKey];
  primary.href = plan.asset === null ? GITHUB.releasesPage : urlFor(plan.asset);
  platformLabel.textContent = dict[plan.menuLabelKey];

  // The menu lists what the primary button does not already offer; a guess
  // (unknown Mac architecture) hides nothing, so both builds stay reachable.
  for (const item of platformItems) {
    item.hidden = plan.hiddenAssets.includes(item.dataset.platform);
  }

  for (const link of assetLinks) {
    link.href = urlFor(link.dataset.asset);
  }
}

async function resolvePlatform() {
  let platform = "";
  let architecture = null;
  try {
    if (navigator.userAgentData) {
      platform = navigator.userAgentData.platform ?? "";
      const hints = await navigator.userAgentData.getHighEntropyValues(["architecture"]);
      architecture = hints.architecture;
    }
  } catch {
    // Browsers that gate the high-entropy hints: fall through to the UA.
  }
  if (!platform) platform = navigator.platform ?? "";
  target = detectPlatform({
    userAgent: navigator.userAgent,
    platform,
    architecture,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
  });
}

async function loadGitHub() {
  try {
    // Same-origin: the Worker resolves the release on GitHub's side, so the
    // visitor's network only has to reach the site it is already reading.
    const response = await fetch("/api/github", { headers: { Accept: "application/json" } });
    if (response.ok) {
      const data = await response.json();
      releaseAssets = Array.isArray(data.assets) ? data.assets : [];
    }
  } catch {
    // Offline or blocked: the placeholder links already point somewhere useful.
  }
  applyLanguage();
}

/** A GitHub API answer, or null when the visitor's network or the rate limit says no. */
async function githubJson(path) {
  try {
    const response = await fetch(`${GITHUB.api}${path}`, {
      headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

async function loadStars() {
  const repo = await githubJson(`/repos/${GITHUB.repo}`);
  const label = formatCount(repo?.stargazers_count);
  if (!label) return;
  starCount.textContent = label;
  starMeta.hidden = false;
}

async function loadDownloads() {
  // One page holds every release this project can plausibly have, and the sum
  // matches the README badge's definition.
  const releases = await githubJson(`/repos/${GITHUB.repo}/releases?per_page=100`);
  const label = formatCount(totalDownloads(releases));
  if (!label) return;
  downloadCount.textContent = label;
  downloadMeta.hidden = false;
}

for (const option of langOptions) {
  option.addEventListener("click", () => {
    lang = option.dataset.lang;
    saveLanguage(languageStore(), lang);
    applyLanguage();
  });
}

function setMenuOpen(open) {
  platformToggle.setAttribute("aria-expanded", String(open));
  platformList.hidden = !open;
}

platformToggle.addEventListener("click", () => {
  setMenuOpen(platformList.hidden);
});

// A choice closes the menu; anywhere else on the page closes it too.
platformList.addEventListener("click", (event) => {
  if (event.target.closest("a")) setMenuOpen(false);
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".platform-menu")) setMenuOpen(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || platformList.hidden) return;
  setMenuOpen(false);
  platformToggle.focus();
});

applyLanguage();
applyTheme();
darkQuery.addEventListener("change", applyTheme);
resolvePlatform()
  .catch(() => {
    // Detection is a courtesy; the neutral fallback in the markup is enough.
  })
  .then(() => {
    renderDownloadCopy();
    loadGitHub();
  });
loadStars();
loadDownloads();
