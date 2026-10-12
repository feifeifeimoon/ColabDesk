export const UI_LANGUAGE_SYSTEM = "system";
export const UI_LANGUAGE_CHINESE = "zh";
export const UI_LANGUAGE_ENGLISH = "en";

export type BuiltInUiLanguage =
  | typeof UI_LANGUAGE_SYSTEM
  | typeof UI_LANGUAGE_CHINESE
  | typeof UI_LANGUAGE_ENGLISH;

export type UiLanguage = BuiltInUiLanguage;

const UI_LANGUAGE_VALUES = new Set<BuiltInUiLanguage>([
  UI_LANGUAGE_SYSTEM,
  UI_LANGUAGE_CHINESE,
  UI_LANGUAGE_ENGLISH,
]);

export function normalizeUiLanguage(value: unknown): UiLanguage {
  return UI_LANGUAGE_VALUES.has(value as BuiltInUiLanguage)
    ? (value as BuiltInUiLanguage)
    : UI_LANGUAGE_SYSTEM;
}
