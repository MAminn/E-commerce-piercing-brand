import { createContext, useContext, useState, useCallback, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { translations, type Locale } from "./translations";
import type { TranslationOverrides } from "#root/shared/types/layout-settings";

interface MinimalI18nContextType {
  locale: Locale;
  dir: "ltr" | "rtl";
  t: (key: string) => string;
  toggleLocale: () => void;
  setLocale: (locale: Locale) => void;
}

const LOCALE_STORAGE_KEY = "minimal-template-locale";
const LOCALE_COOKIE_NAME = "minimal-locale";

const MinimalI18nContext = createContext<MinimalI18nContextType>({
  locale: "en",
  dir: "ltr",
  t: (key) => (translations.en as Record<string, string>)[key] ?? key,
  toggleLocale: () => {},
  setLocale: () => {},
});

function readStoredLocale(ssrLocale?: Locale): Locale {
  // During SSR use the cookie-derived locale passed from the server
  if (typeof window === "undefined") return ssrLocale ?? "en";
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === "ar" || stored === "en") return stored;
  } catch {}
  return ssrLocale ?? "en";
}

function persistLocale(locale: Locale) {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {}
  // Also set a cookie so the server can read it on SSR
  try {
    document.cookie = `${LOCALE_COOKIE_NAME}=${locale};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
  } catch {}
}

export function MinimalI18nProvider({
  children,
  overrides,
  ssrLocale,
}: {
  children: ReactNode;
  overrides?: TranslationOverrides;
  ssrLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(() => readStoredLocale(ssrLocale));

  const dir = locale === "ar" ? "rtl" : "ltr";

  // Merge static translations with CMS overrides (CMS wins)
  const merged = useMemo(() => {
    const en = { ...translations.en, ...overrides?.en };
    const ar = { ...translations.ar, ...overrides?.ar };
    return { en, ar };
  }, [overrides]);

  const t = useCallback(
    (key: string): string => merged[locale][key] ?? key,
    [locale, merged],
  );

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    persistLocale(newLocale);
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(locale === "en" ? "ar" : "en");
  }, [locale, setLocale]);

  // Sync document dir attribute for the whole page when minimal template is active
  useEffect(() => {
    document.documentElement.setAttribute("dir", dir);
    document.documentElement.setAttribute("lang", locale);
    // Ensure cookie is in sync (bootstrapping from localStorage on first load)
    persistLocale(locale);
    return () => {
      // Reset when unmounted (template switch)
      document.documentElement.setAttribute("dir", "ltr");
      document.documentElement.setAttribute("lang", "en");
    };
  }, [dir, locale]);

  return (
    <MinimalI18nContext.Provider value={{ locale, dir, t, toggleLocale, setLocale }}>
      {children}
    </MinimalI18nContext.Provider>
  );
}

export function useMinimalI18n() {
  return useContext(MinimalI18nContext);
}
