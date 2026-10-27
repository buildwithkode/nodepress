'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Pencil, Trash2, Blocks, ArrowUp, ArrowDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'use-intl';
import api from '@/lib/axios';
import { useAuth } from '@/context/AuthContext';
import { canEdit } from '@/lib/access';
import { optionsForEditor, optionsForSave } from '@/lib/field-options';
import { nestedRenames, withLoadedKeys, withoutLoadedKeys } from '@/lib/schema-editor-keys';
import { NestedFields, NestedLayouts, defaultOptionsFor } from '@/components/NestedFieldsEditor';
import { SelectChoicesSource } from '@/components/ChoiceListField';
import { ctLabel, humanizeName } from '@/lib/utils';
import type { ReusableComponent } from '@/components/ComponentFieldControls';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

// A component's fields sit inside a group, repeater or layout where they're used, so
// they may be repeaters, groups or flexible fields too — nesting up to MAX_NESTING
// levels (see NestedFieldsEditor) — but can't use other components.
const FIELD_TYPES = ['text', 'textarea', 'richtext', 'number', 'boolean', 'select', 'image', 'color', 'date', 'datetime', 'json', 'relation', 'repeater', 'group', 'flexible'];

// inline: `field` is the first inserted field and `fields` all of them; layout: `field` is the flexible field.
interface Usage {
  contentTypeId: number; contentType: string; displayName: string | null;
  field: string; type: 'group' | 'repeater' | 'inline' | 'layout'; layout?: string; fields?: string[];
}
type Component = ReusableComponent & { usage: Usage[] };

// `_key`: the key a saved field was loaded with — a different key on save is a rename.
interface DraftField { label: string; type: string; required: boolean; options?: any; _key?: string }
interface Draft { id?: number; displayName: string; name: string; description: string; fields: DraftField[] }

const toSnakeCase = (s: string) => s.trim().toLowerCase().replace(/[\s-]+/g, '_');
const emptyDraft = (): Draft => ({ displayName: '', name: '', description: '', fields: [{ label: '', type: 'text', required: false }] });

const toDraft = (c: Component): Draft => ({
  id: c.id,
  displayName: c.displayName ?? '',
  name: c.name,
  description: c.description ?? '',
  fields: c.fields.map((f) => ({ label: f.label ?? humanizeName(f.name), type: f.type, required: !!f.required, options: withLoadedKeys(optionsForEditor(f.options)), _key: f.name })),
});

const fieldForSave = (f: DraftField) => ({
  name: toSnakeCase(f.label),
  label: f.label.trim(),
  type: f.type,
  required: f.required,
  ...(f.options ? { options: optionsForSave(withoutLoadedKeys(f.options)) } : {}),
});

export default function ComponentsPage() {
  const t = useTranslations('components');
  const tct = useTranslations('contentTypes');
  const { user } = useAuth();
  const canEditModel = canEdit(user, 'content_model');
  const [components, setComponents] = useState<Component[]>([]);
  const [contentTypes, setContentTypes] = useState<{ id: number; name: string; displayName?: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [nameTouched, setNameTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Component | null>(null);

  const load = async () => {
    try {
      const res = await api.get('/components');
      setComponents(res.data ?? []);
      return res.data as Component[];
    } catch {
      toast.error(t('loadFailed'));
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().then((list) => {
      // ?edit=<name> — the content type editors link here from a component field.
      const edit = new URLSearchParams(window.location.search).get('edit');
      const c = edit ? list.find((x) => x.name === edit) : undefined;
      if (c && canEditModel) openEdit(c);
    });
    api.get('/content-types').then((r) => setContentTypes(r.data ?? [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => { setDraft(emptyDraft()); setNameTouched(false); };
  const openEdit = (c: Component) => { setDraft(toDraft(c)); setNameTouched(true); };

  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const patchField = (i: number, p: Partial<DraftField>) =>
    setDraft((d) => d ? { ...d, fields: d.fields.map((f, idx) => (idx === i ? { ...f, ...p } : f)) } : d);
  const setType = (i: number, type: string) => patchField(i, { type, options: defaultOptionsFor(type) });
  const moveField = (i: number, by: number) => setDraft((d) => {
    if (!d) return d;
    const fields = [...d.fields];
    const j = i + by;
    if (j < 0 || j >= fields.length) return d;
    [fields[i], fields[j]] = [fields[j], fields[i]];
    return { ...d, fields };
  });

  const save = async () => {
    if (!draft) return;
    const name = toSnakeCase(draft.name || draft.displayName);
    const fields = draft.fields.filter((f) => f.label.trim()).map(fieldForSave);
    if (!name) { toast.error(t('editor.nameRequired')); return; }
    if (!fields.length) { toast.error(t('editor.atLeastOneField')); return; }
    // Renamed fields: existing entries in every content type using the component follow.
    const keys = new Set(fields.map((f) => f.name));
    const loaded = new Set(draft.fields.map((f) => f._key).filter(Boolean));
    const renames = draft.fields
      .filter((f) => f._key && f.label.trim() && toSnakeCase(f.label) !== f._key && !keys.has(f._key) && !loaded.has(toSnakeCase(f.label)))
      .map((f) => ({ from: f._key!, to: toSnakeCase(f.label) }))
      // …and renames inside the component's repeaters, groups and layouts, as paths within it.
      .concat(nestedRenames(draft.fields.filter((f) => f.label.trim()).map((f) => ({ name: f.label, type: f.type, options: f.options }))));
    const body = {
      name, displayName: draft.displayName.trim(), description: draft.description.trim(), fields,
      ...(draft.id && renames.length ? { fieldMigrations: { renames } } : {}),
    };
    setSaving(true);
    try {
      if (draft.id) {
        const res = await api.put(`/components/${draft.id}`, body);
        const updated: { name: string }[] = res.data.updatedContentTypes ?? [];
        toast.success(t('editor.updated', { count: updated.length }));
        if (res.data.propagationErrors?.length) toast.error(res.data.propagationErrors.join('; '));
      } else {
        await api.post('/components', body);
        toast.success(t('editor.created'));
      }
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
      await api.delete(`/components/${deleting.id}`);
      toast.success(t('deleted'));
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('deleteFailed'));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2"><Blocks className="h-5 w-5" /> {t('title')}</CardTitle>
              <CardDescription>{t('description')}</CardDescription>
            </div>
            {canEditModel && (
              <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" /> {t('new')}</Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('columns.name')}</TableHead>
                <TableHead>{t('columns.fields')}</TableHead>
                <TableHead>{t('columns.usedBy')}</TableHead>
                {canEditModel && <TableHead className="text-right">{t('columns.actions')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    {canEditModel && <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>}
                  </TableRow>
                ))
              ) : components.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canEditModel ? 4 : 3} className="py-12 text-center text-muted-foreground">{t('empty')}</TableCell>
                </TableRow>
              ) : components.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="align-top py-3">
                    <div className="font-medium">{c.displayName || humanizeName(c.name)}</div>
                    <code className="text-xs text-muted-foreground font-mono">{c.name}</code>
                    {c.description && <p className="text-xs text-muted-foreground mt-1">{c.description}</p>}
                  </TableCell>
                  <TableCell className="align-top py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.fields.map((f) => (
                        <Badge key={f.name} variant="outline" className="font-mono text-[11px]">
                          {f.name}<span className="text-muted-foreground ml-1">{tct(`fieldTypes.${f.type}`)}</span>
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="align-top py-3 text-sm">
                    {c.usage.length === 0 ? (
                      <span className="text-muted-foreground">{t('unused')}</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {c.usage.map((u) => (
                          <li key={`${u.contentTypeId}.${u.type}.${u.field}.${u.layout ?? ''}`}>
                            <Link href={`/content-types/${u.contentTypeId}/edit`} className="hover:underline">
                              {ctLabel({ name: u.contentType, displayName: u.displayName })}
                            </Link>
                            <span className="text-muted-foreground">
                              {' · '}
                              {u.type === 'inline' ? (u.fields ?? [u.field]).join(', ') : u.type === 'layout' ? `${u.field} › ${u.layout}` : u.field}
                              {' ('}
                              {u.type === 'group' ? t('kind.one') : u.type === 'repeater' ? t('kind.many') : u.type === 'inline' ? t('kind.inline') : t('kind.layout')}
                              {')'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </TableCell>
                  {canEditModel && (
                    <TableCell className="align-top py-3 text-right whitespace-nowrap">
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(c)} title={t('edit')}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon-sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        disabled={c.usage.length > 0}
                        title={c.usage.length > 0 ? t('inUse') : t('delete')}
                        onClick={() => setDeleting(c)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create / edit */}
      <Dialog open={!!draft} onOpenChange={(o) => { if (!o) setDraft(null); }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? t('editor.editTitle') : t('editor.newTitle')}</DialogTitle>
            <DialogDescription>{t('editor.hint')}</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{t('editor.displayName')}</Label>
                  <Input
                    value={draft.displayName}
                    placeholder={t('editor.displayNamePlaceholder')}
                    onChange={(e) => patch({ displayName: e.target.value, ...(nameTouched ? {} : { name: toSnakeCase(e.target.value) }) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('editor.name')}</Label>
                  <Input
                    value={draft.name}
                    className="font-mono"
                    onChange={(e) => { setNameTouched(true); patch({ name: e.target.value }); }}
                  />
                  {draft.id && <p className="text-xs text-muted-foreground">{t('editor.renameHint')}</p>}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t('editor.descriptionLabel')}</Label>
                <Textarea rows={2} className="resize-none" value={draft.description} onChange={(e) => patch({ description: e.target.value })} />
              </div>

              <div className="space-y-2">
                <Label>{t('editor.fields')}</Label>
                {draft.fields.map((f, i) => (
                  <div key={i} className="rounded-md border bg-muted/30 p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 space-y-1">
                        <Input placeholder={t('editor.fieldNamePlaceholder')} value={f.label} onChange={(e) => patchField(i, { label: e.target.value })} />
                        {f.label.trim() && (
                          <p className="text-xs text-muted-foreground px-0.5">
                            {t('editor.fieldKey')} <code className="rounded bg-muted px-1 py-0.5 font-mono">{toSnakeCase(f.label)}</code>
                          </p>
                        )}
                      </div>
                      <Select value={f.type} onValueChange={(v) => setType(i, String(v))}>
                        <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FIELD_TYPES.map((ft) => <SelectItem key={ft} value={ft}>{tct(`fieldTypes.${ft}`)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap cursor-pointer select-none pt-2">
                        <Checkbox checked={f.required} onCheckedChange={(c) => patchField(i, { required: c === true })} />
                        {t('editor.required')}
                      </label>
                      <Button variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => moveField(i, -1)} title={t('editor.moveUp')}>
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" disabled={i === draft.fields.length - 1} onClick={() => moveField(i, 1)} title={t('editor.moveDown')}>
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon-sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        disabled={draft.fields.length === 1}
                        onClick={() => patch({ fields: draft.fields.filter((_, idx) => idx !== i) })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {(f.type === 'repeater' || f.type === 'group') && (
                      <NestedFields
                        kind={f.type}
                        fields={f.options?.subFields ?? []}
                        depth={2}
                        onChange={(subFields) => patchField(i, { options: { ...f.options, subFields } })}
                      />
                    )}
                    {f.type === 'flexible' && (
                      <NestedLayouts
                        layouts={f.options?.layouts ?? []}
                        depth={2}
                        onChange={(layouts) => patchField(i, { options: { ...f.options, layouts } })}
                      />
                    )}

                    {f.type === 'select' && (
                      <SelectChoicesSource options={f.options} onChange={(o) => patchField(i, { options: o })}>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">{t('editor.choices')}</Label>
                          <Textarea
                            rows={2} className="resize-none" placeholder={t('editor.choicesPlaceholder')}
                            value={f.options?.choices ?? ''}
                            onChange={(e) => patchField(i, { options: { ...f.options, choices: e.target.value } })}
                          />
                        </div>
                      </SelectChoicesSource>
                    )}

                    {f.type === 'relation' && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">{t('editor.relatedType')}</Label>
                          <Select
                            value={f.options?.relatedContentType ?? ''}
                            onValueChange={(v) => patchField(i, { options: { ...f.options, relatedContentType: String(v) } })}
                          >
                            <SelectTrigger className="w-full"><SelectValue placeholder={t('editor.chooseType')} /></SelectTrigger>
                            <SelectContent>
                              {contentTypes.map((ct) => <SelectItem key={ct.name} value={ct.name}>{ctLabel(ct)}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">{t('editor.cardinality')}</Label>
                          <Select
                            value={f.options?.cardinality ?? 'one'}
                            onValueChange={(v) => patchField(i, { options: { ...f.options, cardinality: String(v) } })}
                          >
                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="one">{t('kind.one')}</SelectItem>
                              <SelectItem value="many">{t('kind.many')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                <Button variant="outline" onClick={() => patch({ fields: [...draft.fields, { label: '', type: 'text', required: false }] })}>
                  <Plus className="h-4 w-4 mr-1.5" /> {t('editor.addField')}
                </Button>
              </div>

              {draft.id && (() => {
                const usage = components.find((c) => c.id === draft.id)?.usage ?? [];
                return usage.length > 0 ? (
                  <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                    {t('editor.propagates', { count: new Set(usage.map((u) => u.contentTypeId)).size })}
                  </p>
                ) : null;
              })()}
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
            <AlertDialogTitle>{t('deleteTitle', { name: deleting?.displayName || deleting?.name || '' })}</AlertDialogTitle>
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
