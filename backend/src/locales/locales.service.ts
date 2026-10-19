import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppCacheService } from '../cache/app-cache.service';

const SINGLETON_ID = 1;
const CACHE_KEY = 'locales:config';
const CACHE_TTL = 60_000;
const MAX_LOCALES = 50;
/** BCP 47-ish: "en", "pt-BR", "zh-Hant", "es-419". */
export const LOCALE_PATTERN = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

export interface LocalesConfig {
  defaultLocale: string;
  locales: string[];
}

export function validateLocales(input: { defaultLocale?: unknown; locales?: unknown }): LocalesConfig {
  if (!Array.isArray(input.locales) || input.locales.length === 0) {
    throw new BadRequestException('locales must be a non-empty array of language codes');
  }
  // Canonical BCP 47 casing ("pt-br" → "pt-BR") so codes match stored entries.
  const canon = (l: unknown) => {
    try { return Intl.getCanonicalLocales(String(l).trim())[0] ?? String(l).trim(); } catch { return String(l).trim(); }
  };
  const locales = [...new Set(input.locales.map(canon))];
  if (locales.length > MAX_LOCALES) throw new BadRequestException(`At most ${MAX_LOCALES} languages`);
  const bad = locales.filter((l) => !LOCALE_PATTERN.test(l));
  if (bad.length) throw new BadRequestException(`Invalid language code(s): ${bad.join(', ')} — use codes like en, fr, pt-BR`);
  const defaultLocale = input.defaultLocale === undefined ? locales[0] : canon(input.defaultLocale);
  if (!locales.includes(defaultLocale)) throw new BadRequestException('The default language must be one of the enabled languages');
  // Default first, the rest in the order given.
  return { defaultLocale, locales: [defaultLocale, ...locales.filter((l) => l !== defaultLocale)] };
}

/** Enabled content languages + the default (Setting row id=1). */
@Injectable()
export class LocalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AppCacheService,
  ) {}

  async get(): Promise<LocalesConfig> {
    const cached = await this.cache.get<LocalesConfig>(CACHE_KEY);
    if (cached) return cached;
    const row = await this.prisma.setting.findUnique({ where: { id: SINGLETON_ID }, select: { locales: true, defaultLocale: true } });
    const config: LocalesConfig = {
      defaultLocale: row?.defaultLocale ?? 'en',
      locales: Array.isArray(row?.locales) && (row!.locales as unknown[]).length ? (row!.locales as string[]) : ['en'],
    };
    await this.cache.set(CACHE_KEY, config, CACHE_TTL);
    return config;
  }

  async update(input: { defaultLocale?: unknown; locales?: unknown }): Promise<LocalesConfig> {
    const config = validateLocales(input);
    await this.prisma.setting.upsert({
      where: { id: SINGLETON_ID },
      update: { locales: config.locales, defaultLocale: config.defaultLocale },
      create: { id: SINGLETON_ID, locales: config.locales, defaultLocale: config.defaultLocale },
    });
    await this.cache.del(CACHE_KEY);
    return config;
  }

  /** How many (non-deleted) entries exist per locale — shown before a language is removed. */
  async usage(): Promise<Record<string, number>> {
    const rows = await this.prisma.entry.groupBy({ by: ['locale'], where: { deletedAt: null }, _count: { _all: true } });
    return Object.fromEntries(rows.map((r) => [r.locale, r._count._all]));
  }
}
