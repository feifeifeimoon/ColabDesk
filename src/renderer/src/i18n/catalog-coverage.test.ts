/**
 * The catalog and the code, checked against each other.
 *
 * Two failures this catches that the parity test cannot. A key the code asks for
 * but the catalogs do not have: i18next answers with the *fallback*, so the
 * string renders — in the wrong language — and nothing complains. (This is how
 * the language picker shipped "跟随系统" to English readers.) And a key the
 * catalogs have but nothing asks for: copy that stopped being copy.
 *
 * The rule is deliberately blunt: **every dotted string literal in the renderer
 * is a catalog key.** The only exceptions are the `colabdesk.*` storage keys,
 * which are namespaced localStorage identifiers rather than copy. Blunt is what
 * makes it complete — `t("a.b")`, `labelKey: "a.b"` and a `[key, fallback]` row
 * in a data table are all just literals, and two of those three have already
 * hidden a fallback that only showed up in translation.
 *
 * The sources arrive through `import.meta.glob` rather than `fs`: this file is
 * part of the renderer project, which has no Node types — and a check that reads
 * the same bundle the app is built from cannot disagree with it about which
 * files exist.
 */

import { describe, expect, it } from "vitest";
import en from "./locales/en.json";
import zh from "./locales/zh.json";

const SOURCES = import.meta.glob(["../**/*.{ts,tsx}", "!../**/*.test.{ts,tsx}", "!../locales/**"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** Storage identifiers, not copy: `colabdesk.<what>`. */
const STORAGE_KEY_PREFIX = "colabdesk.";
const DOTTED_LITERAL = /["'`]([a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+)["'`]/g;

/** Prose is not a reference: a dotted name in a comment is not asked for. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const leafKeys = (value: unknown, prefix = "", keys = new Set<string>()): Set<string> => {
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object") leafKeys(child, full, keys);
    else keys.add(full);
  }
  return keys;
};

const referenced = (): Set<string> => {
  const keys = new Set<string>();
  for (const source of Object.values(SOURCES)) {
    for (const match of stripComments(source).matchAll(DOTTED_LITERAL)) keys.add(match[1]);
  }
  return keys;
};

const enKeys = leafKeys(en);
const zhKeys = leafKeys(zh);
const used = referenced();

describe("the catalog and the source agree", () => {
  it("every key the source asks for exists in both catalogs", () => {
    const missing = [...used]
      .filter((key) => !key.startsWith(STORAGE_KEY_PREFIX))
      .filter((key) => !enKeys.has(key) || !zhKeys.has(key))
      .sort();

    expect(missing, "these render their fallback instead of a translation").toEqual([]);
  });

  it("every key in the catalog is asked for by the source", () => {
    const orphans = [...enKeys].filter((key) => !used.has(key)).sort();

    expect(orphans, "catalog entries nothing references").toEqual([]);
  });
});
