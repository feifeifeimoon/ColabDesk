import i18next, { type i18n as I18nInstance, type TOptions } from "i18next";
import { initReactI18next } from "react-i18next";
import type { UiLanguage } from "@shared/ui-language";
import en from "./locales/en.json";
import zh from "./locales/zh.json";
import { DEFAULT_LOCALE, resolveUiLocale } from "./supported-languages";

export const i18n: I18nInstance = i18next;

void i18n
  .use(initReactI18next)
  .init({
    fallbackLng: DEFAULT_LOCALE,
    lng: DEFAULT_LOCALE,
    resources: {
      zh: { translation: zh },
      en: { translation: en },
    },
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

export function translate(key: string, fallback?: string, options?: TOptions): string {
  return i18n.t(key, { defaultValue: fallback ?? key, ...options });
}

export async function setRendererUiLanguage(language: UiLanguage): Promise<void> {
  const locale = resolveUiLocale(language);
  if (i18n.language !== locale) {
    await i18n.changeLanguage(locale);
  }
}
