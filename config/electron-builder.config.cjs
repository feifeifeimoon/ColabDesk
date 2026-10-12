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
  // ssh2's optional native helpers ship as .node binaries and cannot be read
  // from inside the asar archive.
  asarUnpack: ["**/*.node"],
  win: {
    // Per-user install: no administrator prompt, and the CLI keeps its state
    // under the user's own profile anyway.
    target: [{ target: "nsis", arch: ["x64"] }],
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
  },
  mac: {
    target: [{ target: "dmg", arch: ["x64", "arm64"] }],
    category: "public.app-category.developer-tools",
  },
  linux: {
    target: ["AppImage"],
    category: "Development",
  },
};
