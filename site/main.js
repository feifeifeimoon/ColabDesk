// The page's one script. It has three jobs: swap the language, point the
// download buttons at the visitor's platform, and fill in the GitHub numbers.
// Every job degrades to the static HTML when it cannot run — the buttons keep
// their releases-page links and the star badge stays hidden.

import { I18N, initialLanguage } from "./i18n.js";
import { detectPlatform, pickReleaseAsset } from "./platform.js";
import { GITHUB, formatStars } from "./github.js";

const $ = (selector) => document.querySelector(selector);

const langOptions = Array.from(document.querySelectorAll("[data-lang]"));
const starMeta = $("#star-meta");
const starCount = $("#star-count");
const primary = $("#download-primary");
const platformToggle = $("#platform-toggle");
const platformLabel = $("#platform-label");
const platformList = $("#platform-list");
const platformItems = Array.from(document.querySelectorAll("[data-platform]"));
const assetLinks = Array.from(document.querySelectorAll("[data-asset]"));

const STORAGE_KEY = "colabdesk-lang";
let target = "other";
let releaseAssets = [];

let lang = initialLanguage(navigator.language, localStorage.getItem(STORAGE_KEY));

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
  const onMac = target.startsWith("mac");
  // "mac" means a Mac whose architecture could not be read; it gets Apple silicon.
  const primaryAsset = onMac ? (target === "mac" ? "mac-arm" : target) : "win";

  if (target === "other") {
    // A platform we do not ship to gets the releases page, not somebody else's
    // installer.
    primary.textContent = dict["hero.download.any"];
    primary.href = GITHUB.releasesPage;
  } else {
    primary.textContent = dict[onMac ? "hero.download.mac" : "hero.download.win"];
    primary.href = urlFor(primaryAsset);
  }

  platformLabel.textContent = dict[onMac ? "alt.label.win" : target === "win" ? "alt.label.mac" : "alt.label.all"];

  // The menu lists what the primary button does not already offer.
  for (const item of platformItems) {
    item.hidden = item.dataset.platform === primaryAsset;
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
  target = detectPlatform({ userAgent: navigator.userAgent, platform, architecture });
}

async function loadRelease() {
  try {
    const response = await fetch(`${GITHUB.api}/repos/${GITHUB.repo}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) return;
    const release = await response.json();
    releaseAssets = release.assets ?? [];
  } catch {
    // Offline or rate-limited: the placeholder links already point somewhere useful.
  }
  applyLanguage();
}

async function loadStars() {
  try {
    const response = await fetch(`${GITHUB.api}/repos/${GITHUB.repo}`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) return;
    const repo = await response.json();
    const label = formatStars(repo.stargazers_count);
    if (!label) return;
    starCount.textContent = label;
    starMeta.hidden = false;
  } catch {
    // The badge stays hidden — a missing number beats a wrong one.
  }
}

for (const option of langOptions) {
  option.addEventListener("click", () => {
    lang = option.dataset.lang;
    localStorage.setItem(STORAGE_KEY, lang);
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
  if (event.key === "Escape") {
    setMenuOpen(false);
    platformToggle.focus();
  }
});

applyLanguage();
applyTheme();
darkQuery.addEventListener("change", applyTheme);
resolvePlatform().then(() => {
  renderDownloadCopy();
  loadRelease();
});
loadStars();
