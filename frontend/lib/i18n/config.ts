/**
 * Admin interface languages. This is the language of the admin panel itself —
 * content languages are separate (Settings → Languages, lib/locales.ts).
 *
 * Messages live in messages/<locale>/<namespace>.json, one namespace per area
 * of the admin, and messages/<locale>/index.ts collects them. English is the
 * source: a key missing in another language shows the English text.
 */
export const ADMIN_LOCALES = ['en', 'fr', 'de', 'es', 'pt', 'it', 'nl', 'ja', 'zh'] as const;
export type AdminLocale = (typeof ADMIN_LOCALES)[number];
export const DEFAULT_ADMIN_LOCALE: AdminLocale = 'en';

/** Each language's own name, for the switcher. */
export const ADMIN_LOCALE_NAMES: Record<AdminLocale, string> = {
  en: 'English',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  pt: 'Português',
  it: 'Italiano',
  nl: 'Nederlands',
  ja: '日本語',
  zh: '简体中文',
};

/** Cookie (readable by the server later) + localStorage key holding the choice. */
export const ADMIN_LOCALE_COOKIE = 'np_admin_locale';

export function isAdminLocale(value: unknown): value is AdminLocale {
  return typeof value === 'string' && (ADMIN_LOCALES as readonly string[]).includes(value);
}

/** The best supported language for a list like navigator.languages. */
export function matchAdminLocale(preferred: readonly string[] = []): AdminLocale {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0];
    if (isAdminLocale(base)) return base;
  }
  return DEFAULT_ADMIN_LOCALE;
}
