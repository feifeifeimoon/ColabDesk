import { afterEach, describe, expect, it, vi } from "vitest";

import worker, { assetsForTag, githubPayload, latestTag } from "./worker.js";

const TAG = "v0.3.0";
const TAG_URL = `https://github.com/feifeifeimoon/ColabDesk/releases/tag/${TAG}`;

afterEach(() => {
  vi.unstubAllGlobals();
});

function redirectTo(location) {
  return new Response(null, { status: 302, headers: { location } });
}

function stubGitHub() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith("/releases/latest")) return redirectTo(TAG_URL);
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
}

describe("the site's release endpoint", () => {
  it("builds the installers from the tag the release workflow publishes", () => {
    expect(assetsForTag(TAG)).toEqual([
      {
        name: "colabdesk-setup-0.3.0-x64.exe",
        browser_download_url: "https://github.com/feifeifeimoon/ColabDesk/releases/download/v0.3.0/colabdesk-setup-0.3.0-x64.exe",
      },
      {
        name: "colabdesk-0.3.0-arm64.dmg",
        browser_download_url: "https://github.com/feifeifeimoon/ColabDesk/releases/download/v0.3.0/colabdesk-0.3.0-arm64.dmg",
      },
      {
        name: "colabdesk-0.3.0-x64.dmg",
        browser_download_url: "https://github.com/feifeifeimoon/ColabDesk/releases/download/v0.3.0/colabdesk-0.3.0-x64.dmg",
      },
    ]);
  });

  it("keeps a prerelease's version in the names and rejects a non-release tag", () => {
    expect(assetsForTag("v0.4.0-beta.1")[0]?.name).toBe("colabdesk-setup-0.4.0-beta.1-x64.exe");
    expect(assetsForTag("nightly")).toEqual([]);
    expect(assetsForTag("")).toEqual([]);
  });

  it("reads the tag from github.com's redirect instead of the API", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => redirectTo(TAG_URL)));
    await expect(latestTag()).resolves.toBe(TAG);

    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
    await expect(latestTag()).resolves.toBeNull();
  });

  it("serves the direct installers from the redirect", async () => {
    stubGitHub();
    const payload = await githubPayload();
    expect(payload.assets.map((asset) => asset.name)).toEqual([
      "colabdesk-setup-0.3.0-x64.exe",
      "colabdesk-0.3.0-arm64.dmg",
      "colabdesk-0.3.0-x64.dmg",
    ]);
  });

  it("answers /api/github and leaves every other path to the assets", async () => {
    stubGitHub();
    const cache = { match: vi.fn(async () => undefined), put: vi.fn(async () => {}) };
    vi.stubGlobal("caches", { default: cache });
    const assets = { fetch: vi.fn(async () => new Response("asset")) };
    const ctx = { waitUntil: vi.fn() };

    const response = await worker.fetch(new Request("https://colabdesk.dev/api/github"), { ASSETS: assets }, ctx);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.assets).toHaveLength(3);
    expect(body.assets[0].name).toBe("colabdesk-setup-0.3.0-x64.exe");
    expect(ctx.waitUntil).toHaveBeenCalledTimes(1);

    const other = await worker.fetch(new Request("https://colabdesk.dev/index.html"), { ASSETS: assets }, ctx);
    expect(await other.text()).toBe("asset");
    expect(assets.fetch).toHaveBeenCalledTimes(1);
  });
});
