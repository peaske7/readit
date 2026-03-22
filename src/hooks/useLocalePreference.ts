import { useCallback, useState } from "react";
import { type Locale, Locales } from "../lib/i18n";

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

interface UseLocalePreferenceResult {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export function useLocalePreference(): UseLocalePreferenceResult {
  const [locale, setLocaleState] = useState<Locale>(getStoredLocale);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem(STORAGE_KEY, newLocale);
    } catch {
      // localStorage may be unavailable
    }
  }, []);

  return { locale, setLocale };
}
