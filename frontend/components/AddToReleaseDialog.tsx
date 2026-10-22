'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Package } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'use-intl';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EDITABLE_STATUSES, RELEASE_ACTIONS, ReleaseAction, ReleaseSummary } from '@/lib/releases';

const NEW = '__new__';

/** Add entries to an existing (or new) release with one action for all of them. */
export function AddToReleaseDialog({
  entryIds,
  open,
  onOpenChange,
  onAdded,
}: {
  entryIds: number[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded?: () => void;
}) {
  const t = useTranslations('releases');
  const tc = useTranslations('common');
  const [releases, setReleases] = useState<ReleaseSummary[] | null>(null);
  const [target, setTarget] = useState<string>(NEW);
  const [name, setName] = useState('');
  const [action, setAction] = useState<ReleaseAction>('publish');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.get('/releases')
      .then((r) => {
        const editable = (r.data as ReleaseSummary[]).filter((x) => EDITABLE_STATUSES.includes(x.status));
        setReleases(editable);
        setTarget(editable[0] ? String(editable[0].id) : NEW);
      })
      .catch(() => setReleases([]));
  }, [open]);

  const submit = async () => {
    setSaving(true);
    try {
      let id = Number(target);
      if (target === NEW) {
        if (!name.trim()) { toast.error(t('addDialog.nameRequired')); setSaving(false); return; }
        id = (await api.post('/releases', { name: name.trim() })).data.id;
      }
      await api.post(`/releases/${id}/items`, { entryIds, action });
      toast.success(
        <span>
          {t.rich('addDialog.added', {
            count: entryIds.length,
            link: (chunks) => <Link className="underline" href={`/releases/${id}`}>{chunks}</Link>,
          })}
        </span>,
      );
      onAdded?.();
      onOpenChange(false);
      setName('');
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('addDialog.addFailed'));
    } finally {
      setSaving(false);
    }
  };

  const items = {
    [NEW]: t('addDialog.newRelease'),
    ...Object.fromEntries((releases ?? []).map((r) => [String(r.id), r.name])),
  };

  const actionItems = Object.fromEntries(
    RELEASE_ACTIONS.map((a) => [a, t(`addDialog.actionOption.${a}`, { count: entryIds.length })]),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Package className="h-4 w-4" />{t('addDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('addDialog.description')}
          </DialogDescription>
        </DialogHeader>
        {releases === null ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">{t('addDialog.release')}</Label>
              <Select value={target} onValueChange={(v) => setTarget(v ?? NEW)} items={items}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(items).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {target === NEW && (
              <div className="space-y-1">
                <Label className="text-xs">{tc('name')}</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('addDialog.namePlaceholder')} autoFocus />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">{t('addDialog.whenGoesOut')}</Label>
              <Select value={action} onValueChange={(v) => setAction((v as ReleaseAction) ?? 'publish')} items={actionItems}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RELEASE_ACTIONS.map((a) => (
                    <SelectItem key={a} value={a}>{actionItems[a]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{tc('cancel')}</Button>
          <Button onClick={submit} disabled={saving || releases === null}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}{tc('add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
