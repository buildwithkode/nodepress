'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useLocale, useTranslations } from 'use-intl';
import { AlertTriangle, ArrowLeft, CalendarClock, Loader2, Rocket, Trash2, X } from 'lucide-react';
import api from '@/lib/axios';
import { useAuth } from '@/context/AuthContext';
import { canEdit as canEditModule } from '@/lib/access';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { firstTextField } from '@/components/RelationPicker';
import { EDITABLE_STATUSES, RELEASE_STATUS_STYLES, Release } from '@/lib/releases';

export default function ReleasePage() {
  const params = useParams() ?? {};
  const id = String(params.id ?? '');
  const router = useRouter();
  const t = useTranslations('releases');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { user } = useAuth();
  const canEdit = canEditModule(user, 'releases');
  const [release, setRelease] = useState<Release | null>(null);
  const [when, setWhen] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get(`/releases/${id}`)
      .then((r) => { setRelease(r.data); setWhen(r.data.scheduledAt ?? ''); })
      .catch(() => { toast.error(t('detail.notFound')); router.push('/releases'); });
  }, [id, router]);
  useEffect(load, [load]);

  const run = async (key: string, fn: () => Promise<any>, ok?: string) => {
    setBusy(key);
    try {
      const res = await fn();
      if (res?.data?.items) setRelease(res.data);
      else load();
      if (ok) toast.success(ok);
    } catch (err: any) {
      toast.error(err.response?.data?.message || tc('somethingWentWrong'));
      load();
    } finally {
      setBusy(null);
    }
  };

  if (!release) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  const editable = canEdit && EDITABLE_STATUSES.includes(release.status);
  const live = release.items.filter((i) => !i.entry.deletedAt);

  return (
    <div className="space-y-6 max-w-4xl">
      <Link href="/releases" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" />{t('list.title')}
      </Link>

      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            {release.name}
            <span className={cn('text-[11px] px-2 py-0.5 rounded-full capitalize font-normal', RELEASE_STATUS_STYLES[release.status])}>
              {t(`statuses.${release.status}`)}
            </span>
          </h1>
          {release.description && <p className="text-sm text-muted-foreground mt-1">{release.description}</p>}
          {release.publishedAt && (
            <p className="text-sm text-muted-foreground mt-1">{t('detail.publishedAt', { date: new Date(release.publishedAt).toLocaleString(locale) })}</p>
          )}
        </div>
        {editable && (
          <div className="flex gap-2">
            <AlertDialog>
              <AlertDialogTrigger render={<Button disabled={!!busy || live.length === 0} />}>
                {busy === 'publish' ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Rocket className="h-4 w-4 mr-1.5" />}
                {t('detail.publishNow')}
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('detail.publishConfirmTitle', { name: release.name })}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('detail.publishConfirmDescription', { count: live.length })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => run('publish', () => api.post(`/releases/${id}/publish`), t('detail.publishedToast'))}>
                    {t('detail.publish')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      {release.status === 'failed' && release.error && (
        <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{t('detail.publishFailed', { error: release.error })}</span>
        </div>
      )}

      {editable && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><CalendarClock className="h-4 w-4" />{t('detail.schedule')}</CardTitle>
            <CardDescription>
              {release.status === 'scheduled' && release.scheduledAt
                ? t('detail.scheduledFor', { date: new Date(release.scheduledAt).toLocaleString(locale) })
                : t('detail.scheduleHint')}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <DateTimePicker value={when} onChange={setWhen} className="w-64" />
            <Button
              variant="outline"
              disabled={!when || !!busy}
              onClick={() => run('schedule', () => api.put(`/releases/${id}/schedule`, { scheduledAt: new Date(when).toISOString() }), t('detail.scheduledToast'))}
            >
              {busy === 'schedule' && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}{t('detail.schedule')}
            </Button>
            {release.status === 'scheduled' && (
              <Button variant="ghost" disabled={!!busy} onClick={() => run('unschedule', () => api.put(`/releases/${id}/schedule`, { scheduledAt: null }), t('detail.unscheduledToast'))}>
                {t('detail.unschedule')}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('detail.entriesTitle', { count: release.items.length })}</CardTitle>
          <CardDescription>
            {t.rich('detail.entriesDescription', {
              link: (chunks) => <Link href="/entries" className="underline">{chunks}</Link>,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {release.items.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">{t('detail.noEntries')}</p>
          ) : (
            <div className="divide-y border-t">
              {release.items.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center gap-3 px-6 py-3">
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-muted w-20 text-center">{t(`actions.${item.action}`)}</span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/entries/${item.entry.id}/edit`} className={cn('font-medium hover:underline', item.entry.deletedAt && 'line-through text-muted-foreground')}>
                      {firstTextField(item.entry.data ?? {}) || item.entry.slug}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {item.entry.contentType.displayName || item.entry.contentType.name} · {item.entry.slug} · {item.entry.locale} · {t('detail.currentStatus', { status: tc(`statuses.${item.entry.status}`) })}
                      {item.entry.deletedAt && ` · ${t('detail.deletedSkipped')}`}
                    </div>
                    {item.conflicts.length > 0 && (
                      <div className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-0.5">
                        <AlertTriangle className="h-3 w-3" />
                        {t('detail.conflicts', {
                          releases: item.conflicts.map((c) => t('detail.conflictItem', { name: c.name, action: t(`actions.${c.action}`).toLowerCase() })).join(', '),
                        })}
                      </div>
                    )}
                  </div>
                  {editable && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      title={t('detail.removeItem')}
                      disabled={!!busy}
                      onClick={() => run(`rm-${item.id}`, () => api.delete(`/releases/${id}/items/${item.id}`))}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {canEdit && release.status !== 'publishing' && (
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="ghost" className="text-destructive hover:text-destructive" />}>
            <Trash2 className="h-4 w-4 mr-1.5" />{t('detail.deleteRelease')}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('detail.deleteConfirmTitle', { name: release.name })}</AlertDialogTitle>
              <AlertDialogDescription>{t('detail.deleteConfirmDescription')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={async () => {
                  try {
                    await api.delete(`/releases/${id}`);
                    router.push('/releases');
                  } catch (err: any) {
                    toast.error(err.response?.data?.message || t('detail.deleteFailed'));
                  }
                }}
              >
                {tc('delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
