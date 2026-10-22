'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'use-intl';
import { Languages, Loader2, Plus, Star, X } from 'lucide-react';
import AdminGuard from '@/components/AdminGuard';
import api from '@/lib/axios';
import { loadLocales, localeLabel, type LocalesConfig } from '@/lib/locales';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** Suggestions for the "add a language" box — any BCP 47 code is accepted. */
const COMMON = ['en', 'es', 'fr', 'de', 'it', 'pt', 'pt-BR', 'nl', 'sv', 'pl', 'tr', 'ru', 'ar', 'he', 'hi', 'bn', 'ta', 'te', 'mr', 'ur', 'id', 'ms', 'th', 'vi', 'zh', 'zh-Hant', 'ja', 'ko'];
const CODE_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/** Settings → Languages: which content languages editors can write in, and the default. */
export default function LanguagesPage() {
  const t = useTranslations('settings.languages');
  const tc = useTranslations('common');
  const [saved, setSaved] = useState<LocalesConfig | null>(null);
  const [locales, setLocales] = useState<string[]>([]);
  const [defaultLocale, setDefaultLocale] = useState('en');
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [newCode, setNewCode] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadLocales(true).then((c) => {
      setSaved(c);
      setLocales(c.locales);
      setDefaultLocale(c.defaultLocale);
    });
    api.get('/locales/usage').then((r) => setUsage(r.data)).catch(() => {});
  }, []);

  const dirty = useMemo(
    () => !!saved && (saved.defaultLocale !== defaultLocale || saved.locales.join() !== locales.join()),
    [saved, locales, defaultLocale],
  );
  // Languages that have entries but aren't enabled (e.g. created through the API).
  const orphaned = Object.keys(usage).filter((code) => !locales.includes(code));
  const candidate = newCode.trim();
  const candidateValid = CODE_RE.test(candidate) && !locales.includes(candidate);

  const add = (code: string) => {
    if (!CODE_RE.test(code) || locales.includes(code)) return;
    setLocales((l) => [...l, code]);
    setNewCode('');
  };

  const remove = (code: string) => setLocales((l) => l.filter((c) => c !== code));

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.put<LocalesConfig>('/locales', { locales, defaultLocale });
      setSaved(res.data);
      setLocales(res.data.locales);
      await loadLocales(true); // refresh the shared cache used by the editors
      toast.success(t('toasts.saved'));
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? t('toasts.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    'w-full rounded-md bg-background border border-border px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring';

  return (
    <AdminGuard>
      <div className="w-full space-y-6">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Languages className="h-5 w-5" /> {t('title')}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t.rich('subtitle', { code: () => <code className="text-xs">?fallback=true</code> })}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <Card>
            <CardHeader>
              <CardTitle>{t('enabled.title')}</CardTitle>
              <CardDescription>{t('enabled.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!saved ? (
                <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> {tc('loading')}</div>
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {locales.map((code) => (
                    <li key={code} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{localeLabel(code)}</p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {code} · {t('enabled.entryCount', { count: usage[code] ?? 0 })}
                        </p>
                      </div>
                      {code === defaultLocale ? (
                        <span className="inline-flex items-center gap-1 text-xs text-primary font-medium">
                          <Star className="h-3.5 w-3.5 fill-current" /> {t('enabled.default')}
                        </span>
                      ) : (
                        <>
                          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDefaultLocale(code)}>
                            {t('enabled.makeDefault')}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            title={usage[code] ? t('enabled.removeWithEntries', { count: usage[code] }) : tc('remove')}
                            aria-label={t('enabled.removeLabel', { language: localeLabel(code) })}
                            onClick={() => remove(code)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {orphaned.length > 0 && (
                <p className="text-xs text-amber-500">
                  {t('enabled.orphaned')}{' '}
                  {orphaned.map((c, i) => (
                    <span key={c}>
                      {i > 0 && ', '}
                      <button type="button" className="underline" onClick={() => add(c)}>
                        {localeLabel(c)} ({c}, {usage[c]})
                      </button>
                    </span>
                  ))}
                  {t('enabled.orphanedHint')}
                </p>
              )}

              <div className="flex justify-end">
                <Button type="button" onClick={save} disabled={!dirty || saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                  {t('saveChanges')}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('add.title')}</CardTitle>
              <CardDescription>{t.rich('add.description', { code: (chunks) => <code>{chunks}</code> })}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form
                className="flex gap-2"
                onSubmit={(e) => { e.preventDefault(); if (candidateValid) add(candidate); }}
              >
                <input
                  className={inputCls + ' font-mono'}
                  placeholder={t('add.placeholder', { example: 'fr' })}
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  list="language-suggestions"
                  aria-label={t('add.codeLabel')}
                />
                <datalist id="language-suggestions">
                  {COMMON.filter((c) => !locales.includes(c)).map((c) => (
                    <option key={c} value={c}>{localeLabel(c)}</option>
                  ))}
                </datalist>
                <Button type="submit" variant="outline" disabled={!candidateValid}>
                  <Plus className="h-4 w-4 mr-1" /> {tc('add')}
                </Button>
              </form>
              <p className="text-xs text-muted-foreground min-h-4">
                {candidate && (candidateValid ? t('add.willAdd', { language: localeLabel(candidate) }) : locales.includes(candidate) ? t('add.alreadyEnabled') : t('add.invalidCode'))}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {COMMON.filter((c) => !locales.includes(c)).slice(0, 14).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => add(c)}
                    className="text-xs rounded border border-border px-2 py-1 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  >
                    {localeLabel(c)}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminGuard>
  );
}
