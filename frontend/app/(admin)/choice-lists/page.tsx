'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Pencil, Trash2, ListOrdered, ArrowUp, ArrowDown, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'use-intl';
import api from '@/lib/axios';
import { ctLabel } from '@/lib/utils';
import { invalidateChoiceLists, type ChoiceListRow } from '@/components/ChoiceListField';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { useAccess } from '@/lib/use-access';

interface Usage {
  contentTypes: { contentTypeId: number; contentType: string; displayName: string | null; field: string }[];
  components: { componentId: number; component: string; field: string }[];
}
type ChoiceList = ChoiceListRow & { usage: Usage };

// `touched`: the value was typed by hand, so it no longer follows the label.
interface Row { value: string; label: string; touched: boolean }
interface Draft { id?: number; name: string; label: string; description: string; rows: Row[] }

const MAX_CHOICES = 1000;

const toSnakeCase = (s: string) => s.trim().toLowerCase().replace(/[\s-]+/g, '_');

/** A value suggested from a label: "New York" → "new_york" (the label itself when nothing ASCII is left). */
const suggestValue = (label: string) => {
  const ascii = label.trim().toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return ascii || label.trim();
};

const emptyRow = (): Row => ({ value: '', label: '', touched: false });
const emptyDraft = (): Draft => ({ name: '', label: '', description: '', rows: [emptyRow()] });
const toDraft = (l: ChoiceList): Draft => ({
  id: l.id, name: l.name, label: l.label, description: l.description ?? '',
  rows: l.choices.map((c) => ({ value: c.value, label: c.label ?? '', touched: true })),
});

const usageCount = (u: Usage) => u.contentTypes.length + u.components.length;

export default function ChoiceListsPage() {
  const t = useTranslations('choiceLists');
  const editable = useAccess().canEdit('content_model');
  const [lists, setLists] = useState<ChoiceList[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [nameTouched, setNameTouched] = useState(false);
  const [bulk, setBulk] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<ChoiceList | null>(null);

  const load = async () => {
    try {
      const res = await api.get('/choice-lists');
      setLists(res.data ?? []);
      return res.data as ChoiceList[];
    } catch {
      toast.error(t('loadFailed'));
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().then((all) => {
      // ?edit=<name> — the select field editors link here.
      const edit = new URLSearchParams(window.location.search).get('edit');
      const l = edit ? all.find((x) => x.name === edit) : undefined;
      if (l) openEdit(l);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => { setDraft(emptyDraft()); setNameTouched(false); setBulk(''); };
  const openEdit = (l: ChoiceList) => { setDraft(toDraft(l)); setNameTouched(true); setBulk(''); };

  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const patchRow = (i: number, p: Partial<Row>) => setDraft((d) => d ? {
    ...d,
    rows: d.rows.map((r, idx) => {
      if (idx !== i) return r;
      const next = { ...r, ...p };
      // The value follows the label until it is edited by hand.
      if (p.label !== undefined && !r.touched) next.value = suggestValue(p.label);
      return next;
    }),
  } : d);
  const moveRow = (i: number, by: number) => setDraft((d) => {
    if (!d) return d;
    const rows = [...d.rows];
    const j = i + by;
    if (j < 0 || j >= rows.length) return d;
    [rows[i], rows[j]] = [rows[j], rows[i]];
    return { ...d, rows };
  });

  /** Paste one choice per line ("Label", or "value | Label") — appended, duplicates skipped. */
  const addBulk = () => {
    if (!draft) return;
    const have = new Set(draft.rows.map((r) => r.value.trim()).filter(Boolean));
    const added: Row[] = [];
    for (const line of bulk.split('\n').map((l) => l.trim()).filter(Boolean)) {
      const [a, b] = line.split('|').map((s) => s.trim());
      const row = b !== undefined
        ? { value: a, label: b, touched: true }
        : { value: suggestValue(a), label: a === suggestValue(a) ? '' : a, touched: false };
      if (!row.value || have.has(row.value)) continue;
      have.add(row.value);
      added.push(row);
    }
    const kept = draft.rows.filter((r) => r.value.trim() || r.label.trim());
    patch({ rows: [...kept, ...added] });
    setBulk('');
    toast.success(t('editor.bulkAdded', { count: added.length }));
  };

  const values = draft?.rows.map((r) => r.value.trim()) ?? [];
  const duplicate = (v: string) => !!v && values.filter((x) => x === v).length > 1;

  const save = async () => {
    if (!draft) return;
    const name = toSnakeCase(draft.name || draft.label);
    const choices = draft.rows
      .filter((r) => r.value.trim() || r.label.trim())
      .map((r) => ({ value: r.value.trim() || suggestValue(r.label), ...(r.label.trim() ? { label: r.label.trim() } : {}) }));
    if (!draft.label.trim()) { toast.error(t('editor.labelRequired')); return; }
    if (!name) { toast.error(t('editor.nameRequired')); return; }
    if (!choices.length) { toast.error(t('editor.atLeastOne')); return; }
    if (new Set(choices.map((c) => c.value)).size !== choices.length) { toast.error(t('editor.duplicates')); return; }
    const body = { name, label: draft.label.trim(), description: draft.description.trim(), choices };
    setSaving(true);
    try {
      if (draft.id) {
        const res = await api.put(`/choice-lists/${draft.id}`, body);
        toast.success(t('editor.updated', { count: res.data.updatedContentTypes?.length ?? 0 }));
        const inUse: { contentType: string; field: string; entries: number }[] = res.data.removedValuesInUse ?? [];
        if (inUse.length) {
          toast.warning(t('editor.removedInUse', {
            count: inUse.reduce((n, u) => n + u.entries, 0),
            where: inUse.map((u) => `${u.contentType}.${u.field} (${u.entries})`).join(', '),
          }), { duration: 15_000 });
        }
        if (res.data.propagationErrors?.length) toast.error(res.data.propagationErrors.join('; '));
      } else {
        await api.post('/choice-lists', body);
        toast.success(t('editor.created'));
      }
      invalidateChoiceLists();
      setDraft(null);
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.errors?.join('; ') || err.response?.data?.message || t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await api.delete(`/choice-lists/${deleting.id}`);
      toast.success(t('deleted'));
      invalidateChoiceLists();
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('deleteFailed'));
    } finally {
      setDeleting(null);
    }
  };

  const editing = draft?.id ? lists.find((l) => l.id === draft.id) : undefined;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2"><ListOrdered className="h-5 w-5" /> {t('title')}</CardTitle>
              <CardDescription>{t('description')}</CardDescription>
            </div>
            {editable && <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" /> {t('new')}</Button>}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('columns.name')}</TableHead>
                <TableHead>{t('columns.choices')}</TableHead>
                <TableHead>{t('columns.usedBy')}</TableHead>
                <TableHead className="text-right">{t('columns.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : lists.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-12 text-center text-muted-foreground">{t('empty')}</TableCell>
                </TableRow>
              ) : lists.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="align-top py-3">
                    <div className="font-medium">{l.label}</div>
                    <code className="text-xs text-muted-foreground font-mono">{l.name}</code>
                    {l.description && <p className="text-xs text-muted-foreground mt-1">{l.description}</p>}
                  </TableCell>
                  <TableCell className="align-top py-3">
                    <div className="flex flex-wrap gap-1 max-w-md">
                      {l.choices.slice(0, 8).map((c) => (
                        <Badge key={c.value} variant="outline" className="text-[11px]">{c.label ?? c.value}</Badge>
                      ))}
                      {l.choices.length > 8 && (
                        <span className="text-xs text-muted-foreground self-center">{t('more', { count: l.choices.length - 8 })}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="align-top py-3 text-sm">
                    {usageCount(l.usage) === 0 ? (
                      <span className="text-muted-foreground">{t('unused')}</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {l.usage.contentTypes.map((u) => (
                          <li key={`ct.${u.contentTypeId}.${u.field}`}>
                            <Link href={`/content-types/${u.contentTypeId}/edit`} className="hover:underline">
                              {ctLabel({ name: u.contentType, displayName: u.displayName })}
                            </Link>
                            <span className="text-muted-foreground font-mono text-xs"> · {u.field}</span>
                          </li>
                        ))}
                        {l.usage.components.map((u) => (
                          <li key={`c.${u.componentId}.${u.field}`}>
                            <Link href={`/components?edit=${encodeURIComponent(u.component)}`} className="hover:underline">
                              {t('componentUsage', { name: u.component })}
                            </Link>
                            <span className="text-muted-foreground font-mono text-xs"> · {u.field}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </TableCell>
                  <TableCell className="align-top py-3 text-right whitespace-nowrap">
                    <Button variant="ghost" size="icon-sm" onClick={() => openEdit(l)} title={t('edit')} disabled={!editable}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon-sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      disabled={!editable || usageCount(l.usage) > 0}
                      title={usageCount(l.usage) > 0 ? t('inUse') : t('delete')}
                      onClick={() => setDeleting(l)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create / edit */}
      <Dialog open={!!draft} onOpenChange={(o) => { if (!o) setDraft(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? t('editor.editTitle') : t('editor.newTitle')}</DialogTitle>
            <DialogDescription>{t('editor.hint')}</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{t('editor.label')}</Label>
                  <Input
                    value={draft.label}
                    placeholder={t('editor.labelPlaceholder')}
                    onChange={(e) => patch({ label: e.target.value, ...(nameTouched ? {} : { name: toSnakeCase(e.target.value) }) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('editor.name')}</Label>
                  <Input
                    value={draft.name}
                    className="font-mono"
                    onChange={(e) => { setNameTouched(true); patch({ name: e.target.value }); }}
                  />
                  <p className="text-xs text-muted-foreground">{draft.id ? t('editor.renameHint') : t('editor.nameHint')}</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t('editor.descriptionLabel')}</Label>
                <Textarea rows={2} className="resize-none" value={draft.description} onChange={(e) => patch({ description: e.target.value })} />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{t('editor.choices', { count: draft.rows.length })}</Label>
                </div>
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2 px-0.5 text-xs text-muted-foreground">
                  <span>{t('editor.choiceLabel')}</span>
                  <span>{t('editor.choiceValue')}</span>
                  <span className="w-[6.5rem]" />
                </div>
                {draft.rows.map((r, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                    <Input
                      placeholder={t('editor.choiceLabelPlaceholder')}
                      value={r.label}
                      onChange={(e) => patchRow(i, { label: e.target.value })}
                    />
                    <Input
                      placeholder={r.label.trim() ? suggestValue(r.label) : t('editor.choiceValuePlaceholder')}
                      value={r.value}
                      maxLength={200}
                      className={duplicate(r.value.trim()) ? 'font-mono border-destructive' : 'font-mono'}
                      onChange={(e) => patchRow(i, { value: e.target.value, touched: true })}
                    />
                    <div className="flex">
                      <Button variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => moveRow(i, -1)} title={t('editor.moveUp')}>
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" disabled={i === draft.rows.length - 1} onClick={() => moveRow(i, 1)} title={t('editor.moveDown')}>
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon-sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        disabled={draft.rows.length === 1}
                        onClick={() => patch({ rows: draft.rows.filter((_, idx) => idx !== i) })}
                        title={t('editor.remove')}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
                <Button
                  variant="outline" size="sm"
                  disabled={draft.rows.length >= MAX_CHOICES}
                  onClick={() => patch({ rows: [...draft.rows, emptyRow()] })}
                >
                  <Plus className="h-4 w-4 mr-1.5" /> {t('editor.addChoice')}
                </Button>
              </div>

              <div className="space-y-1.5 rounded-md border bg-muted/30 p-3">
                <Label className="text-xs">{t('editor.bulkTitle')}</Label>
                <p className="text-xs text-muted-foreground">{t('editor.bulkHint')}</p>
                <Textarea rows={3} className="font-mono text-xs" value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={t('editor.bulkPlaceholder')} />
                <Button variant="outline" size="sm" disabled={!bulk.trim()} onClick={addBulk}>{t('editor.bulkAdd')}</Button>
              </div>

              {editing && usageCount(editing.usage) > 0 && (
                <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                  {t('editor.propagates', { count: new Set(editing.usage.contentTypes.map((u) => u.contentTypeId)).size })}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>{t('cancel')}</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {draft?.id ? t('editor.save') : t('editor.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteTitle', { name: deleting?.label || deleting?.name || '' })}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>{t('delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
