import type { AdminLocale } from './config';
import en from '@/messages/en';

export type Messages = typeof en;

/** English ships with the bundle; other languages load on demand. */
const loaders: Record<AdminLocale, () => Promise<Messages>> = {
  en: async () => en,
  fr: () => import('@/messages/fr').then((m) => m.default as Messages),
  de: () => import('@/messages/de').then((m) => m.default as Messages),
  es: () => import('@/messages/es').then((m) => m.default as Messages),
  pt: () => import('@/messages/pt').then((m) => m.default as Messages),
  it: () => import('@/messages/it').then((m) => m.default as Messages),
  nl: () => import('@/messages/nl').then((m) => m.default as Messages),
  ja: () => import('@/messages/ja').then((m) => m.default as Messages),
  zh: () => import('@/messages/zh').then((m) => m.default as Messages),
};

export const englishMessages = en;

export function loadMessages(locale: AdminLocale): Promise<Messages> {
  return loaders[locale]();
}

/** English text for `namespace.key.path` — what a missing translation shows. */
export function englishFallback(namespace: string | undefined, key: string): string {
  const path = [...(namespace ? namespace.split('.') : []), ...key.split('.')];
  let node: any = en;
  for (const part of path) node = node?.[part];
  return typeof node === 'string' ? node : key;
}
