import {
  createT,
  type Locale,
  Locales,
  type TranslationKey,
} from "../lib/i18n";

const STORAGE_KEY = "readit:locale";

function detectLocale(): Locale {
  const browserLang = navigator.language.slice(0, 2).toLowerCase();
  if (browserLang === "ja") return Locales.JA;
  return Locales.EN;
}

function getStoredLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === Locales.JA || stored === Locales.EN) {
      return stored;
    }
  } catch {
    // localStorage may be unavailable
  }
  return detectLocale();
}

export const localeState = $state({
  locale: getStoredLocale() as Locale,
});

export function setLocale(newLocale: Locale): void {
  localeState.locale = newLocale;
  try {
    localStorage.setItem(STORAGE_KEY, newLocale);
  } catch {
    // localStorage may be unavailable
  }
}

export function t(
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  return createT(localeState.locale)(key, params);
}
