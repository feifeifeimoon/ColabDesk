import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const siteTokens = readFileSync(join(here, "tokens.css"), "utf8");
const appTokens = readFileSync(join(here, "..", "src", "renderer", "src", "assets", "tokens.css"), "utf8");

describe("the landing page's token copy", () => {
  // The page has no build step, so it carries a copy. This is the assertion
  // that keeps the copy from becoming a second palette: change the app's
  // tokens and this goes red until `npm run site:tokens` re-copies them.
  it("is byte-identical to the app's tokens.css", () => {
    expect(siteTokens).toBe(appTokens);
  });
});
