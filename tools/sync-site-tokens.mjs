import { copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The landing page has no build step, so it carries a copy of the app's tokens. */
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "src", "renderer", "src", "assets", "tokens.css");
const to = join(root, "site", "tokens.css");

copyFileSync(from, to);
console.log(`site/tokens.css ← src/renderer/src/assets/tokens.css`);
