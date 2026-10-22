'use client';

import { Languages } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ADMIN_LOCALES, ADMIN_LOCALE_NAMES, AdminLocale } from '@/lib/i18n/config';
import { useAdminLocale } from '@/components/AdminIntlProvider';
import { cn } from '@/lib/utils';

/** Picks the admin panel's language (not the content's). */
export function AdminLanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useAdminLocale();
  const t = useTranslations('common');
  return (
    <Select value={locale} onValueChange={(v) => v && setLocale(v as AdminLocale)} items={ADMIN_LOCALE_NAMES}>
      <SelectTrigger size="sm" className={cn('h-8 gap-1.5 text-xs', className)} aria-label={t('interfaceLanguage')}>
        <Languages className="h-3.5 w-3.5 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ADMIN_LOCALES.map((l) => (
          <SelectItem key={l} value={l} className="text-xs">{ADMIN_LOCALE_NAMES[l]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
