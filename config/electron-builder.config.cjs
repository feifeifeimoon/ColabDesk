/**
 * electron-builder configuration.
 *
 * `files` starts from the default (everything) and excludes the sources, which
 * is what keeps `node_modules` — `ssh2` and `ws` are external in the main
 * bundle, so the packaged app needs them — while electron-builder prunes
 * devDependencies on its own.
 *
 * The one non-obvious piece is `extraResources`: a bundled Colab runtime
 * (`resources/cli`, produced by `npm run bundle:cli`) is copied into the app so
 * the CLI is found without the user installing Python. In a dev checkout that
 * directory does not exist and the build must still work.
 */

const { existsSync } = require("node:fs");

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: "com.colabdesk.app",
  productName: "ColabDesk",
  directories: { output: "dist", buildResources: "resources" },
  files: [
    "out/**",
    "package.json",
    "!src/**",
    "!config/**",
    "!docs/**",
    "!tools/**",
    "!smoke/**",
    "!resources/cli/**",
    "!**/*.map",
    "!tsconfig*.json",
    "!electron.vite.config.ts",
    "!npm.ps1",
  ],
  extraResources: existsSync("resources/cli") ? [{ from: "resources/cli", to: "cli" }] : [],
  // Build-time publishing. The owner/repo are written out rather than inferred
  // from package.json, because inference cannot fail — it just points somewhere
  // else and nobody notices.
  publish: [
    {
      provider: "github",
      owner: "feifeifeimoon",
      repo: "ColabDesk",
      releaseType: "release",
    },
  ],
  // ssh2's optional native helpers ship as .node binaries and cannot be read
  // from inside the asar archive.
  asarUnpack: ["**/*.node"],
  win: {
    // Per-user install: no administrator prompt, and the CLI keeps its state
    // under the user's own profile anyway.
    target: [{ target: "nsis", arch: ["x64"] }],
    artifactName: "colabdesk-setup-${version}-${arch}.${ext}",
    // Deliberately no `verifyUpdateCodeSignature: false`. It reads like a
    // prerequisite for unsigned builds and is not one: without a certificate
    // electron-builder resolves no publisher name either way, so the flag
    // changes nothing today. It would only start mattering once a certificate
    // exists — and then it would suppress the very publisher name that turns
    // update signature verification on. Confirmed by building with and without
    // it: the two app-update.yml files come out byte-identical.
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    // Block-map based updates. Turning this off silently makes every update a
    // full re-download of the installer, bundled runtime included.
    differentialPackage: true,
    // Uninstalling must not take the user's usage history and Colab credentials
    // with it — they live under userData, which this flag governs.
    deleteAppDataOnUninstall: false,
  },
  mac: {
    // dmg for a human, zip for Squirrel.Mac: electron-updater's MacUpdater
    // refuses to start without a zip in the release.
    target: [
      { target: "dmg", arch: ["x64", "arm64"] },
      { target: "zip", arch: ["x64", "arm64"] },
    ],
    artifactName: "colabdesk-${version}-${arch}.${ext}",
    category: "public.app-category.developer-tools",
  },
  linux: {
    target: ["AppImage"],
    artifactName: "colabdesk-${version}-${arch}.${ext}",
    category: "Development",
  },
};
