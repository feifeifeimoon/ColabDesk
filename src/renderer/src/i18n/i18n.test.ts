import { describe, expect, it } from "vitest";
import { i18n, setRendererUiLanguage, translate } from "./i18n";
import { resolveUiLocale } from "./supported-languages";
import { normalizeUiLanguage, UI_LANGUAGE_CHINESE, UI_LANGUAGE_ENGLISH, UI_LANGUAGE_SYSTEM } from "@shared/ui-language";
import en from "./locales/en.json";
import zh from "./locales/zh.json";

function getLeafKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      keys.push(...getLeafKeys(v as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys.sort();
}

describe("i18n catalogs", () => {
  it("en and zh catalogs have 100% key parity", () => {
    const zhKeys = getLeafKeys(zh);
    const enKeys = getLeafKeys(en);

    expect(zhKeys).toEqual(enKeys);
  });
});

describe("i18n resolution and translation", () => {
  it("normalizes languages safely", () => {
    expect(normalizeUiLanguage("zh")).toBe("zh");
    expect(normalizeUiLanguage("en")).toBe("en");
    expect(normalizeUiLanguage("system")).toBe("system");
    expect(normalizeUiLanguage("invalid")).toBe("system");
    expect(normalizeUiLanguage(null)).toBe("system");
  });

  it("resolves locales correctly", () => {
    expect(resolveUiLocale(UI_LANGUAGE_CHINESE)).toBe("zh");
    expect(resolveUiLocale(UI_LANGUAGE_ENGLISH)).toBe("en");
    expect(resolveUiLocale(UI_LANGUAGE_SYSTEM)).toBe("zh");
  });

  it("translates Chinese and English dynamically", async () => {
    await setRendererUiLanguage("zh");
    expect(i18n.language).toBe("zh");
    expect(translate("topbar.brand")).toBe("ColabDesk");
    expect(translate("workbench.emptyTitle")).toBe("没有打开的终端");
    expect(translate("workbench.emptyNoShells", undefined, { name: "test-runtime" })).toBe("「test-runtime」还没有终端。");

    await setRendererUiLanguage("en");
    expect(i18n.language).toBe("en");
    expect(translate("topbar.brand")).toBe("ColabDesk");
    expect(translate("workbench.emptyTitle")).toBe("No open terminals");
    expect(translate("workbench.emptyNoShells", undefined, { name: "test-runtime" })).toBe('"test-runtime" has no active terminals.');

    // Reset back to zh
    await setRendererUiLanguage("zh");
  });

  it("falls back to default value when key does not exist", () => {
    expect(translate("non.existent.key", "回退文本")).toBe("回退文本");
  });
});
