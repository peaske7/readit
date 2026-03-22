import { createContext, type ReactNode, use, useMemo } from "react";
import { useLocalePreference } from "../hooks/useLocalePreference";
import { createT, type Locale, type TranslationKey } from "../lib/i18n";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function useLocale(): LocaleContextValue {
  const value = use(LocaleContext);
  if (!value) {
    throw new Error("useLocale must be used within a LocaleProvider");
  }
  return value;
}

interface LocaleProviderProps {
  children: ReactNode;
}

export function LocaleProvider({ children }: LocaleProviderProps) {
  const { locale, setLocale } = useLocalePreference();
  const t = useMemo(() => createT(locale), [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return <LocaleContext value={value}>{children}</LocaleContext>;
}
