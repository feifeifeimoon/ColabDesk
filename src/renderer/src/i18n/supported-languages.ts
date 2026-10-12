import { DEFAULT_UI_LOCALE, resolveRendererUiLocale, type SupportedUiLocale } from "@shared/ui-locale";
import {
  UI_LANGUAGE_CHINESE,
  UI_LANGUAGE_ENGLISH,
  UI_LANGUAGE_SYSTEM,
  type BuiltInUiLanguage,
  type UiLanguage,
} from "@shared/ui-language";

export const DEFAULT_LOCALE = DEFAULT_UI_LOCALE;

export interface UiLanguageChoice {
  value: BuiltInUiLanguage;
  labelKey: string;
  fallback: string;
}

export const UI_LANGUAGE_CHOICES: UiLanguageChoice[] = [
  { value: UI_LANGUAGE_SYSTEM, labelKey: "settings.appearance.language.system", fallback: "跟随系统" },
  { value: UI_LANGUAGE_CHINESE, labelKey: "settings.appearance.language.chinese", fallback: "中文（简体）" },
  { value: UI_LANGUAGE_ENGLISH, labelKey: "settings.appearance.language.english", fallback: "English" },
];

export function resolveUiLocale(language: UiLanguage): SupportedUiLocale {
  return resolveRendererUiLocale(language);
}
