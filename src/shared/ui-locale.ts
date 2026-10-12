import {
  UI_LANGUAGE_CHINESE,
  UI_LANGUAGE_ENGLISH,
  UI_LANGUAGE_SYSTEM,
  type UiLanguage,
} from "./ui-language";

export const SUPPORTED_UI_LOCALES = ["zh", "en"] as const;
export type SupportedUiLocale = (typeof SUPPORTED_UI_LOCALES)[number];

export const DEFAULT_UI_LOCALE: SupportedUiLocale = "zh";

function normalizeLocaleTag(locale: string | undefined): string {
  return (locale ?? DEFAULT_UI_LOCALE).trim().toLowerCase().replace(/_/g, "-");
}

export function normalizeSupportedUiLocale(locale: string | undefined): SupportedUiLocale {
  const tag = normalizeLocaleTag(locale);
  const primary = tag.split("-")[0];
  if (primary === "zh") {
    return "zh";
  }
  if (primary === "en") {
    return "en";
  }
  return DEFAULT_UI_LOCALE;
}

export function getRendererSystemLocale(): string {
  if (typeof navigator !== "undefined" && navigator.language) {
    return navigator.language;
  }
  return DEFAULT_UI_LOCALE;
}

export function resolveUiLocale(
  language: UiLanguage,
  systemLocale: string | undefined = DEFAULT_UI_LOCALE,
): SupportedUiLocale {
  if (language === UI_LANGUAGE_CHINESE) {
    return "zh";
  }
  if (language === UI_LANGUAGE_ENGLISH) {
    return "en";
  }
  return normalizeSupportedUiLocale(systemLocale);
}

export function resolveRendererUiLocale(language: UiLanguage): SupportedUiLocale {
  return resolveUiLocale(
    language,
    language === UI_LANGUAGE_SYSTEM ? getRendererSystemLocale() : DEFAULT_UI_LOCALE,
  );
}
