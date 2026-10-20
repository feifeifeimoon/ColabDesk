import { describe, expect, it } from "vitest";

import { detectPlatform, pickReleaseAsset } from "./platform.js";

const WINDOWS_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const LINUX_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

describe("detectPlatform", () => {
  it("reads Windows from either the UA or userAgentData", () => {
    expect(detectPlatform({ userAgent: WINDOWS_UA })).toBe("win");
    expect(detectPlatform({ platform: "Windows", userAgent: WINDOWS_UA })).toBe("win");
  });

  it("splits a Mac by architecture", () => {
    expect(detectPlatform({ userAgent: MAC_UA, platform: "macOS", architecture: "arm" })).toBe("mac-arm");
    expect(detectPlatform({ userAgent: MAC_UA, platform: "MacIntel", architecture: "x86" })).toBe("mac-x64");
  });

  it("defaults a Mac of unknown architecture to Apple silicon", () => {
    expect(detectPlatform({ userAgent: MAC_UA, platform: "MacIntel" })).toBe("mac");
  });

  it("treats everything else as other", () => {
    expect(detectPlatform({ userAgent: LINUX_UA, platform: "Linux x86_64" })).toBe("other");
    expect(detectPlatform({})).toBe("other");
  });
});

const ASSETS = [
  { name: "colabdesk-setup-0.3.0-x64.exe", browser_download_url: "https://example.test/setup.exe" },
  { name: "colabdesk-0.3.0-arm64.dmg", browser_download_url: "https://example.test/arm64.dmg" },
  { name: "colabdesk-0.3.0-x64.dmg", browser_download_url: "https://example.test/x64.dmg" },
];

describe("pickReleaseAsset", () => {
  it("picks the installer for each target", () => {
    expect(pickReleaseAsset("win", ASSETS)?.name).toBe("colabdesk-setup-0.3.0-x64.exe");
    expect(pickReleaseAsset("mac-arm", ASSETS)?.name).toBe("colabdesk-0.3.0-arm64.dmg");
    expect(pickReleaseAsset("mac-x64", ASSETS)?.name).toBe("colabdesk-0.3.0-x64.dmg");
  });

  it("prefers Apple silicon when the architecture is unknown", () => {
    expect(pickReleaseAsset("mac", ASSETS)?.name).toBe("colabdesk-0.3.0-arm64.dmg");
  });

  it("falls back to Intel when only the Intel image ships", () => {
    const onlyIntel = ASSETS.filter((asset) => !asset.name.includes("arm64"));
    expect(pickReleaseAsset("mac", onlyIntel)?.name).toBe("colabdesk-0.3.0-x64.dmg");
  });

  it("returns null rather than guessing when the asset is missing", () => {
    expect(pickReleaseAsset("win", ASSETS.slice(1))).toBeNull();
    expect(pickReleaseAsset("other", ASSETS)).toBeNull();
    expect(pickReleaseAsset("win", [])).toBeNull();
  });
});
