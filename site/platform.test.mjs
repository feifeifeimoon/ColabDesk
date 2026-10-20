import { describe, expect, it } from "vitest";

import { detectPlatform, downloadPlan, pickReleaseAsset } from "./platform.js";

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
    expect(detectPlatform({ platform: "macOS", architecture: "arm64" })).toBe("mac-arm");
    expect(detectPlatform({ platform: "macOS", architecture: "amd64" })).toBe("mac-x64");
  });

  it("keeps a Mac of unknown architecture as an unknown", () => {
    expect(detectPlatform({ userAgent: MAC_UA, platform: "MacIntel" })).toBe("mac");
  });

  it("does not mistake an iPad in desktop mode for a Mac", () => {
    expect(detectPlatform({ userAgent: MAC_UA, platform: "MacIntel", maxTouchPoints: 5 })).toBe("other");
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

  it("returns null rather than guessing when the asset is missing", () => {
    expect(pickReleaseAsset("win", ASSETS.slice(1))).toBeNull();
    expect(pickReleaseAsset("other", ASSETS)).toBeNull();
    expect(pickReleaseAsset("win", [])).toBeNull();
  });
});

describe("downloadPlan", () => {
  it("names the visitor's platform and hides the menu row it duplicates", () => {
    expect(downloadPlan("win")).toMatchObject({
      asset: "win",
      hiddenAssets: ["win"],
      menuLabelKey: "alt.label.mac",
    });
    expect(downloadPlan("mac-arm")).toMatchObject({
      asset: "mac-arm",
      hiddenAssets: ["mac-arm"],
      menuLabelKey: "alt.label.win",
    });
    expect(downloadPlan("mac-x64")).toMatchObject({
      asset: "mac-x64",
      hiddenAssets: ["mac-x64"],
      menuLabelKey: "alt.label.win",
    });
  });

  it("keeps every build reachable when the Mac's architecture is unknown", () => {
    // The primary guesses Apple silicon, but hiding the Intel row would strand
    // Safari and Firefox readers on an Intel Mac.
    expect(downloadPlan("mac")).toMatchObject({
      asset: "mac-arm",
      hiddenAssets: [],
      menuLabelKey: "alt.label.other",
    });
  });

  it("offers the releases page without hiding a build for an unsupported platform", () => {
    expect(downloadPlan("other")).toMatchObject({
      asset: null,
      hiddenAssets: [],
      menuLabelKey: "alt.label.all",
    });
  });

  it("never hides more than the one row the primary already offers", () => {
    for (const target of ["win", "mac-arm", "mac-x64", "mac", "other"]) {
      expect(downloadPlan(target).hiddenAssets.length).toBeLessThanOrEqual(1);
    }
  });
});
