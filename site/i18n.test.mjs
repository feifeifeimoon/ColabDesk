import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { I18N, FALLBACK_LANG, initialLanguage, readStoredLanguage, saveLanguage } from "./i18n.js";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "index.html"), "utf8");

/** Keys the script supplies that never appear in the markup. */
const USED_BY_SCRIPT = new Set([
  "meta.title",
  "lang.group",
  "nav.star",
  "hero.download.win",
  "hero.download.mac",
  "hero.download.any",
  "alt.label.mac",
  "alt.label.win",
  "alt.label.all",
  "alt.label.other",
]);

function keysIn(attribute) {
  const pattern = new RegExp(`${attribute}="([^"]+)"`, "g");
  return new Set(Array.from(html.matchAll(pattern), (match) => match[1]));
}

describe("i18n dictionaries", () => {
  it("have exactly the same keys, so neither language is half-translated", () => {
    expect(Object.keys(I18N.zh).sort()).toEqual(Object.keys(I18N.en).sort());
  });

  it("have no empty string", () => {
    for (const [lang, dict] of Object.entries(I18N)) {
      for (const [key, value] of Object.entries(dict)) {
        expect(typeof value, `${lang}.${key}`).toBe("string");
        expect(value.trim(), `${lang}.${key}`).not.toBe("");
      }
    }
  });

  it("cover every key the markup asks for", () => {
    const used = new Set([
      ...keysIn("data-i18n"),
      ...keysIn("data-i18n-aria"),
      ...keysIn("data-i18n-alt"),
    ]);
    for (const key of used) {
      expect(I18N.en[key], `en.${key}`).toBeTypeOf("string");
      expect(I18N.zh[key], `zh.${key}`).toBeTypeOf("string");
    }
  });

  it("contain no key that neither the markup nor the script uses", () => {
    const used = new Set([
      ...keysIn("data-i18n"),
      ...keysIn("data-i18n-aria"),
      ...keysIn("data-i18n-alt"),
      ...USED_BY_SCRIPT,
    ]);
    for (const key of Object.keys(I18N.en)) {
      expect(used.has(key), `unused key: ${key}`).toBe(true);
    }
  });
});

describe("initialLanguage", () => {
  it("prefers a stored choice over the browser", () => {
    expect(initialLanguage("en-US", "zh")).toBe("zh");
    expect(initialLanguage("zh-CN", "en")).toBe("en");
  });

  it("reads a Chinese browser as Chinese and anything else as English", () => {
    expect(initialLanguage("zh-CN", null)).toBe("zh");
    expect(initialLanguage("zh-TW", null)).toBe("zh");
    expect(initialLanguage("en-GB", null)).toBe("en");
    expect(initialLanguage("de-DE", null)).toBe("en");
    expect(initialLanguage(undefined, null)).toBe(FALLBACK_LANG);
  });

  it("ignores a stored value it does not know", () => {
    expect(initialLanguage("en-US", "fr")).toBe("en");
  });
});

describe("language storage", () => {
  it("reads and writes the saved choice", () => {
    const values = new Map();
    const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
    expect(readStoredLanguage(storage)).toBeNull();
    saveLanguage(storage, "zh");
    expect(readStoredLanguage(storage)).toBe("zh");
  });

  it("survives storage that throws, which must not cost the page", () => {
    const blocked = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    };
    expect(readStoredLanguage(blocked)).toBeNull();
    expect(() => saveLanguage(blocked, "zh")).not.toThrow();
    expect(readStoredLanguage(null)).toBeNull();
    expect(() => saveLanguage(null, "en")).not.toThrow();
  });
});

describe("the static fallback", () => {
  it("offers a neutral download and menu label before the script runs", () => {
    expect(html).toMatch(/id="download-primary"[\s\S]*?>\s*Download\s*</);
    expect(html).toMatch(/id="platform-label">All platforms</);
  });
});
