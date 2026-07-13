"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, Locale } from "./locale";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
});

/**
 * Client-only locale switch (no /en URL routing) — the whole app is one
 * locale-agnostic route tree, and every page reads its copy from a
 * dictionary keyed by this context's locale. Starts at DEFAULT_LOCALE on
 * every render (server and first client render) and only reads
 * localStorage after mount, so hydration always matches; the UI flips to
 * the remembered locale immediately after.
 */
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === "ja" || stored === "en") {
      // Syncing initial React state from an external system (localStorage)
      // on mount — the documented exception to "don't setState in an
      // effect". Doing it in useState's initializer instead would read
      // localStorage during SSR and mismatch hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocaleState(stored);
    }
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale: (next: Locale) => {
        setLocaleState(next);
        window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
      },
    }),
    [locale]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}

/** Picks the current-locale slice out of a `{ ja, en }` dictionary object. */
export function useDict<T>(dictionary: Record<Locale, T>): T {
  const { locale } = useLocale();
  return dictionary[locale];
}
