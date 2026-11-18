'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import { toast } from 'sonner';
import { Copy, Link2, Share2, Trash2 } from 'lucide-react';
import api from '@/lib/axios';
import { copyText } from '@/lib/copy-text';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface ShareLink { id: number; expiresAt: string; createdAt: string; createdBy: string | null }

const DAYS = [1, 7, 30] as const;

/**
 * "Share" in the entry editor: a link that shows this entry to someone without
 * an admin login (a client approving a page) until it expires. The link itself
 * is only shown when made; the list below lets you revoke the ones still working.
 */
export function ShareEntryDialog({ entryId }: { entryId: number }) {
  const t = useTranslations('entries');
  const tc = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<number>(7);
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [made, setMade] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get<ShareLink[]>(`/entries/${entryId}/share-links`).then((r) => setLinks(r.data)).catch(() => {});
  }, [entryId]);
  useEffect(() => { if (open) load(); else setMade(null); }, [open, load]);

  const create = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ token: string }>(`/entries/${entryId}/share-links`, { days });
      const url = `${window.location.origin}/share/${res.data.token}`;
      setMade(url);
      load();
      toast.success((await copyText(url)) ? t('share.copied') : t('share.created'));
    } catch (err: any) {
      toast.error(err.response?.data?.message || tc('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (link: ShareLink) => {
    try {
      await api.delete(`/entries/${entryId}/share-links/${link.id}`);
      setLinks((l) => l.filter((x) => x.id !== link.id));
      toast.success(t('share.revoked'));
    } catch (err: any) {
      toast.error(err.response?.data?.message || tc('somethingWentWrong'));
    }
  };

  const date = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setOpen(true)} title={t('share.buttonTitle')}>
        <Share2 className="h-3.5 w-3.5" />
        {t('share.button')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('share.title')}</DialogTitle>
            <DialogDescription>{t('share.description')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t('share.expiresIn')}</p>
              <div role="radiogroup" aria-label={t('share.expiresIn')} className="inline-flex rounded-md border border-border/80 bg-muted/40 p-0.5">
                {DAYS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={days === d}
                    onClick={() => setDays(d)}
                    className={cn(
                      'rounded px-3 py-1 text-xs font-medium transition-colors',
                      days === d ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {t('share.days', { count: d })}
                  </button>
                ))}
              </div>
            </div>

            <Button type="button" className="w-full gap-1.5" disabled={busy} onClick={create}>
              <Link2 className="h-4 w-4" />
              {t('share.create')}
            </Button>

            {made && (
              <div className="space-y-1.5">
                <div className="flex gap-2">
                  <Input readOnly value={made} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" aria-label={t('share.linkLabel')} />
                  <Button
                    type="button" variant="outline" size="icon" aria-label={t('share.copy')} title={t('share.copy')}
                    onClick={async () => { if (await copyText(made)) toast.success(t('share.copied')); else toast.error(t('share.copyFailed')); }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{t('share.onlyNow')}</p>
              </div>
            )}

            {links.length > 0 && (
              <div className="border-t border-border/60 pt-3">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t('share.active', { count: links.length })}</p>
                <ul className="space-y-1">
                  {links.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">
                        {t('share.expires', { date: date(l.expiresAt) })}
                        {l.createdBy && <span className="text-muted-foreground"> · {l.createdBy}</span>}
                      </span>
                      <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs text-destructive hover:text-destructive" onClick={() => revoke(l)}>
                        <Trash2 className="h-3.5 w-3.5" />
                        {t('share.revoke')}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
