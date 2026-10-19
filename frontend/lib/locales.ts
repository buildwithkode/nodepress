'use client';

import { useEffect, useState } from 'react';
import api from './axios';

export interface LocalesConfig {
  defaultLocale: string;
  locales: string[];
}

const FALLBACK: LocalesConfig = { defaultLocale: 'en', locales: ['en'] };
let cached: LocalesConfig | null = null;
let inflight: Promise<LocalesConfig> | null = null;

/** Fetch the enabled content languages once per page load (GET /api/locales). */
export function loadLocales(force = false): Promise<LocalesConfig> {
  if (cached && !force) return Promise.resolve(cached);
  if (!inflight || force) {
    inflight = api
      .get<LocalesConfig>('/locales')
      .then((res) => (cached = res.data))
      .catch(() => FALLBACK)
      .finally(() => { inflight = null; });
  }
  return inflight;
}

/** Enabled content languages (Settings → Languages). `null` until loaded. */
export function useLocales(): LocalesConfig | null {
  const [config, setConfig] = useState<LocalesConfig | null>(cached);
  useEffect(() => {
    let alive = true;
    loadLocales().then((c) => alive && setConfig(c));
    return () => { alive = false; };
  }, []);
  return config;
}

/** Human name for a locale code, e.g. "fr" → "French", "pt-BR" → "Brazilian Portuguese". */
export function localeLabel(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}
