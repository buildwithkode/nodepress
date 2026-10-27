'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useLocale, useTranslations } from 'use-intl';
import { CalendarClock, Loader2, Package, Plus } from 'lucide-react';
import api from '@/lib/axios';
import { useAuth } from '@/context/AuthContext';
import { canEdit as canEditModule } from '@/lib/access';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { RELEASE_STATUS_STYLES, ReleaseSummary } from '@/lib/releases';

/** Content releases — batches of entry changes that go live together. */
export default function ReleasesPage() {
  const router = useRouter();
  const t = useTranslations('releases');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { user } = useAuth();
  const canEdit = canEditModule(user, 'releases');
  const [releases, setReleases] = useState<ReleaseSummary[] | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api.get('/releases').then((r) => setReleases(r.data)).catch(() => { toast.error(t('list.loadFailed')); setReleases([]); });
  }, []);
  useEffect(load, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await api.post('/releases', { name: name.trim() });
      router.push(`/releases/${res.data.id}`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('list.createFailed'));
      setCreating(false);
    }
  };

  const pending = releases?.filter((r) => r.status !== 'published') ?? [];
  const done = releases?.filter((r) => r.status === 'published') ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Package className="h-6 w-6" />{t('list.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('list.description')}
        </p>
      </div>

      {canEdit && (
        <form onSubmit={create} className="flex gap-2 max-w-md">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('list.namePlaceholder')} />
          <Button type="submit" disabled={creating || !name.trim()}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}{tc('create')}
          </Button>
        </form>
      )}

      {releases === null ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : releases.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{t('list.empty')}</CardContent></Card>
      ) : (
        [{ title: t('list.upcoming'), list: pending }, { title: t('list.published'), list: done }].map(({ title, list }) =>
          list.length ? (
            <section key={title} className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
              <div className="rounded-lg border divide-y">
                {list.map((r) => (
                  <Link key={r.id} href={`/releases/${r.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{r.name}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                        {t('entryCount', { count: r.itemCount ?? 0 })}
                        {r.scheduledAt && r.status === 'scheduled' && (
                          <><CalendarClock className="h-3 w-3 ml-1" />{new Date(r.scheduledAt).toLocaleString(locale)}</>
                        )}
                        {r.publishedAt && <> · {t('list.publishedAt', { date: new Date(r.publishedAt).toLocaleString(locale) })}</>}
                      </div>
                    </div>
                    <span className={cn('text-[11px] px-2 py-0.5 rounded-full capitalize', RELEASE_STATUS_STYLES[r.status])}>{t(`statuses.${r.status}`)}</span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null,
        )
      )}
    </div>
  );
}
