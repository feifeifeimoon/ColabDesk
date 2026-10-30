import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

/** The config lives in `config/`, so paths are resolved from the project root. */
const root = resolve(import.meta.dirname, "..");

export default defineConfig({
  root,
  resolve: {
    alias: {
      "@shared": resolve(root, "src/shared"),
    },
  },
  test: {
    // `.tsx` too: a component rendered with `renderToStaticMarkup` needs no DOM,
    // so the design rules that live in markup are testable right here.
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      // Build tooling keeps its tests as plain ESM next to the tool, because
      // these files run under bare `node` and must not need a TS build step.
      "config/**/*.test.mjs",
      "tools/**/*.test.mjs",
      // The landing page is plain static HTML with no build step, so its pure
      // modules (i18n, platform detection) and its copy are asserted here too.
      "site/**/*.test.mjs",
    ],
    environment: "node",
    // Some stylesheets are also data files: the terminal's palettes and the
    // token contrast floor are asserted against the CSS itself, which needs it
    // processed rather than stubbed out. Scoped to those files, so no other
    // test pays for it.
    css: { include: [/terminal-themes\.css/, /tokens\.css/] },
  },
});
