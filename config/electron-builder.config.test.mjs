/**
 * Pins the packaging values that fail silently when they are wrong.
 *
 * The publish coordinates are the reason this file exists: electron-builder will
 * infer them from package.json's `repository` field, so a wrong or missing
 * literal does not error — it ships, and every install starts checking someone
 * else's repository for updates.
 */

import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const config = require("./electron-builder.config.cjs");

describe("electron-builder configuration", () => {
  it("publishes to ColabDesk, as a literal", () => {
    const [publish] = config.publish;
    expect(publish).toMatchObject({
      provider: "github",
      owner: "feifeifeimoon",
      repo: "ColabDesk",
      releaseType: "release",
    });
  });

  it("does not suppress update signature verification", () => {
    // This flag looks like something an unsigned build needs. It is not: with no
    // certificate, electron-builder resolves no publisher name either way, so it
    // changes nothing today. It would only bite later — by suppressing the
    // publisher name that enables verification once a certificate exists.
    expect(config.win.verifyUpdateCodeSignature).not.toBe(false);
  });

  it("ships a zip on macOS, which is what Squirrel.Mac installs from", () => {
    const targets = config.mac.target.flatMap((entry) => [entry.target]);
    expect(targets).toContain("zip");
    expect(targets).toContain("dmg");
  });

  it("keeps ${arch} in artifact names so the two Mac architectures cannot collide", () => {
    expect(config.win.artifactName).toContain("${arch}");
    expect(config.mac.artifactName).toContain("${arch}");
  });

  it("ships only the Electron locales the interface has catalogs for", () => {
    // Chromium's locale pak files are ~1 MB each and unrelated to the app's own
    // i18n. Adding a third interface language means adding it here too.
    expect(config.electronLanguages).toEqual(["zh-CN", "en-US"]);
  });

  it("keeps the NSIS options differential updates depend on", () => {
    // Changing any of these invalidates block maps for everyone already
    // installed, so they are a contract rather than a preference.
    expect(config.nsis).toMatchObject({
      oneClick: false,
      perMachine: false,
      allowToChangeInstallationDirectory: true,
      differentialPackage: true,
      deleteAppDataOnUninstall: false,
    });
  });
});
