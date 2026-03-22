import { en } from "./en";
import { ja } from "./ja";
import type { Locale, TranslationKey, Translations } from "./types";
import { Locales } from "./types";

const translationMap: Record<Locale, Translations> = {
  [Locales.JA]: ja,
  [Locales.EN]: en,
};

export function createT(locale: Locale) {
  const translations = translationMap[locale];

  return function t(
    key: TranslationKey,
    params?: Record<string, string | number>,
  ): string {
    let value = translations[key];
    if (!params) return value;

    for (const [param, replacement] of Object.entries(params)) {
      value = value.replaceAll(`{{${param}}}`, String(replacement));
    }

    return value;
  };
}
