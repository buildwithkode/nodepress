'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { IntlProvider, IntlErrorCode, type IntlError } from 'use-intl';
import {
  ADMIN_LOCALE_COOKIE, AdminLocale, DEFAULT_ADMIN_LOCALE, isAdminLocale, matchAdminLocale,
} from '@/lib/i18n/config';
import { englishFallback, englishMessages, loadMessages, type Messages } from '@/lib/i18n/messages';

interface AdminLocaleContextValue {
  locale: AdminLocale;
  setLocale: (locale: AdminLocale) => void;
}

const AdminLocaleContext = createContext<AdminLocaleContextValue>({
  locale: DEFAULT_ADMIN_LOCALE,
  setLocale: () => {},
});

export const useAdminLocale = () => useContext(AdminLocaleContext);

function storedLocale(): AdminLocale | null {
  try {
    const fromStorage = localStorage.getItem(ADMIN_LOCALE_COOKIE);
    if (isAdminLocale(fromStorage)) return fromStorage;
  } catch {
    // storage blocked — fall through
  }
  const fromCookie = document.cookie.match(new RegExp(`(?:^|; )${ADMIN_LOCALE_COOKIE}=([^;]+)`))?.[1];
  return isAdminLocale(fromCookie) ? fromCookie : null;
}

/**
 * The admin panel's language. Server rendering is always English (so public
 * pages stay static); the browser then switches to the saved choice, or the
 * browser language when nothing is saved.
 */
export function AdminIntlProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<AdminLocale>(DEFAULT_ADMIN_LOCALE);
  const [messages, setMessages] = useState<Messages>(englishMessages);

  const apply = useCallback(async (next: AdminLocale) => {
    try {
      const loaded = await loadMessages(next);
      setMessages(loaded);
      setLocaleState(next);
      document.documentElement.lang = next;
    } catch {
      // A failed chunk load leaves the admin in its current language.
    }
  }, []);

  useEffect(() => {
    const initial = storedLocale() ?? matchAdminLocale(navigator.languages ?? [navigator.language]);
    if (initial !== DEFAULT_ADMIN_LOCALE) void apply(initial);
  }, [apply]);

  const setLocale = useCallback((next: AdminLocale) => {
    try {
      localStorage.setItem(ADMIN_LOCALE_COOKIE, next);
    } catch {
      // storage blocked — the cookie still remembers it
    }
    document.cookie = `${ADMIN_LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    void apply(next);
  }, [apply]);

  return (
    <AdminLocaleContext.Provider value={{ locale, setLocale }}>
      <IntlProvider
        locale={locale}
        messages={messages}
        timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
        onError={(error: IntlError) => {
          if (error.code === IntlErrorCode.MISSING_MESSAGE && locale !== DEFAULT_ADMIN_LOCALE) return;
          if (process.env.NODE_ENV !== 'production') console.warn(`[i18n] ${error.message}`);
        }}
        getMessageFallback={({ namespace, key }) => englishFallback(namespace, key)}
      >
        {children}
      </IntlProvider>
    </AdminLocaleContext.Provider>
  );
}
