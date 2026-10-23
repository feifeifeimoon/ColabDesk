/**
 * The site's one server-side hop: resolve the latest release on GitHub.
 *
 * The page used to call api.github.com from the browser. A visitor whose
 * network cannot reach that host — or whose shared IP has spent the 60/hour
 * allowance — got the releases page instead of an installer, even though the
 * assets were there. This Worker asks github.com for the `/releases/latest`
 * redirect (the same page the button already fell back to) and builds the
 * asset URLs from the tag. The names are the ones the release workflow asserts
 * before it publishes anything.
 *
 * The star count is still the browser's own call: it is cosmetic, and moving it
 * here would put it behind a shared egress IP for no benefit.
 *
 * The cache is per-colo and short: a release is published once, and the page
 * can wait five minutes for a new version to appear.
 */

import { GITHUB } from "./github.js";

const USER_AGENT = "ColabDesk-site";
const CACHE_SECONDS = 300;
const UPSTREAM_TIMEOUT_MS = 5000;

/** The installers a tag's release is required to carry, at their public URLs. */
export function assetsForTag(tag) {
  const match = /^v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/.exec(tag ?? "");
  if (!match) return [];
  const version = match[1];
  const base = `${GITHUB.origin}/${GITHUB.repo}/releases/download/${tag}`;
  return [
    `colabdesk-setup-${version}-x64.exe`,
    `colabdesk-${version}-arm64.dmg`,
    `colabdesk-${version}-x64.dmg`,
  ].map((name) => ({ name, browser_download_url: `${base}/${name}` }));
}

/** The tag behind github.com's `/releases/latest` redirect, or null. */
export async function latestTag(signal) {
  const response = await fetch(`${GITHUB.origin}/${GITHUB.repo}/releases/latest`, {
    redirect: "manual",
    headers: { "User-Agent": USER_AGENT },
    signal,
  });
  if (response.status < 300 || response.status >= 400) return null;
  const location = response.headers.get("location") ?? "";
  const match = /\/releases\/tag\/([^/?#]+)$/.exec(location);
  return match ? decodeURIComponent(match[1]) : null;
}

/** What `/api/github` answers: the direct installers. */
export async function githubPayload() {
  const signal = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);
  const tag = await latestTag(signal).catch(() => null);
  return { assets: tag ? assetsForTag(tag) : [] };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/github") return env.ASSETS.fetch(request);

    const cache = caches.default;
    const key = new Request(url.toString(), { method: "GET" });
    const cached = await cache.match(key);
    if (cached) return cached;

    const payload = await githubPayload();
    const response = new Response(JSON.stringify(payload), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": payload.assets.length > 0 ? `public, max-age=${CACHE_SECONDS}` : "no-store",
      },
    });
    if (payload.assets.length > 0) {
      ctx.waitUntil(cache.put(key, response.clone()).catch(() => {}));
    }
    return response;
  },
};
