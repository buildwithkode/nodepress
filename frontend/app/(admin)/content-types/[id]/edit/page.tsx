'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Plus, Trash2, ArrowLeft, GripVertical, ArrowUpDown, Download, Braces, Copy, Check, PanelRight, WrapText, Shield, FileText, Lock } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { toast } from 'sonner';
import { useTranslations } from 'use-intl';
import api from '@/lib/axios';
import { highlightCode } from '@/lib/highlight';
import { cn, humanizeName } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { INDEXABLE_FIELD_TYPES } from '@/lib/indexable-fields';
import { RelationFieldOptions } from '@/components/RelationFieldOptions';
import { optionsForEditor, optionsForSave } from '@/lib/field-options';
import { SelectChoicesSource } from '@/components/ChoiceListField';
import {
  AddComponentButton, AddComponentLayoutButton, ComponentFieldCard, ComponentsSection, InlineComponentBlock,
  continuesInlineRun, inlineEditorField, moveWithInlineRuns, removeInlineRun,
} from '@/components/ComponentFieldControls';
import { duplicateKeys, editorFieldKey, isComponentField, nestedDuplicates, takenKeys, toFieldKey } from '@/lib/field-keys';
import { PreviewUrlSetting } from '@/components/LivePreviewPane';
import { FieldConditionEditor } from '@/components/FieldConditionEditor';
import { detectFieldChanges, useSchemaChangeCheck, FieldMigrations } from '@/components/SchemaChangeDialog';
import type { FieldCondition } from '@/lib/field-condition';
import { nestedRenames, withLoadedKeys, withoutLoadedKeys } from '@/lib/schema-editor-keys';
import { NestedFields, NestedLayouts, defaultOptionsFor } from '@/components/NestedFieldsEditor';

// Labels come from contentTypes.fieldTypes.<value>.
const FIELD_TYPES = [
  { value: 'text' },
  { value: 'textarea' },
  { value: 'richtext' },
  { value: 'number' },
  { value: 'boolean' },
  { value: 'select' },
  { value: 'image' },
  { value: 'color' },
  { value: 'date' },
  { value: 'datetime' },
  { value: 'json' },
  { value: 'relation' },
  { value: 'repeater' },
  { value: 'flexible' },
  { value: 'group' },
];

interface SubField { name: string; type: string }
interface Layout   { name: string; label: string; fields: SubField[]; component?: string }
interface Field {
  _id:         string;
  name:        string;
  label?:      string;
  type:        string;
  required:    boolean;
  indexed?:    boolean;
  readRoles?:  string[];
  writeRoles?: string[];
  options?:    { subFields?: SubField[]; layouts?: Layout[]; choices?: string; relatedContentType?: string; cardinality?: string; mappedBy?: string; component?: string };
  condition?:  FieldCondition;
  /** The key the field was loaded with — a different key on save is a rename. */
  _key?:       string;
  /** Inline component field: the component's name, and the field as saved (read-only here). */
  component?:  string;
  inline?:     any;
}

let _counter = 0;
function uid() { return `f-${Date.now()}-${_counter++}`; }

const toSnakeCase = (name: string) =>
  name.trim().toLowerCase().replace(/[\s-]+/g, '_');

// Turn an editor field into the saved schema object: `name` is the snake_case
// field key, `label` preserves the human wording the user typed.
const buildSchemaField = (f: { name: string; type: string; required: boolean; indexed?: boolean; readRoles?: string[]; writeRoles?: string[]; options?: any; condition?: FieldCondition; inline?: any }) => f.inline ?? ({
  name: toSnakeCase(f.name),
  type: f.type,
  label: f.name.trim(),
  required: f.required,
  ...(f.indexed && INDEXABLE_FIELD_TYPES.has(f.type) ? { indexed: true } : {}),
  ...(f.readRoles ? { readRoles: f.readRoles } : {}),
  ...(f.writeRoles ? { writeRoles: f.writeRoles } : {}),
  ...(f.options ? { options: optionsForSave(withoutLoadedKeys(f.options)) } : {}),
  ...(f.condition ? { condition: f.condition } : {}),
});

/** Choices of a select field as typed in the editor (one per line or comma separated). */
const choiceList = (choices?: string) => (choices ?? '').split(/[\n,]/).map((c) => c.trim()).filter(Boolean);

function FieldTypeSelect({
  value, onChange, types = FIELD_TYPES, className,
}: {
  value: string; onChange: (v: string) => void;
  types?: typeof FIELD_TYPES; className?: string;
}) {
  const t = useTranslations('contentTypes');
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className}><SelectValue /></SelectTrigger>
      <SelectContent>
        {types.map((ft) => <SelectItem key={ft.value} value={ft.value}>{t(`fieldTypes.${ft.value}`)}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function SortableFieldCard({ id, disabled, children }: { id: string; disabled?: boolean; children: (dragHandle: React.ReactNode) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  const dragHandle = (
    <button
      type="button"
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground shrink-0 touch-none"
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
  return (
    <div ref={setNodeRef} style={style}>
      {children(dragHandle)}
    </div>
  );
}

const ALL_METHODS = [
  { key: 'list',   verb: 'GET',    path: '' },
  { key: 'read',   verb: 'GET',    path: '/:slug' },
  { key: 'create', verb: 'POST',   path: '' },
  { key: 'update', verb: 'PUT',    path: '/:slug' },
  { key: 'delete', verb: 'DELETE', path: '/:slug' },
];

const VERB_COLOR: Record<string, string> = {
  GET:    'text-blue-400',
  POST:   'text-green-400',
  PUT:    'text-orange-400',
  DELETE: 'text-red-400',
};

export default function EditContentTypePage() {
  const t = useTranslations('contentTypes');
  const tc = useTranslations('common');
  const router = useRouter();
  const params = useParams() ?? {};
  const id = (params.id ?? '') as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [fields, setFields] = useState<Field[]>([]);
  const [allowedMethods, setAllowedMethods] = useState<string[]>(['list', 'read', 'create', 'update', 'delete']);
  const [previewUrl, setPreviewUrl] = useState('');
  const [savedKeys, setSavedKeys] = useState<string[]>([]);
  const schemaCheck = useSchemaChangeCheck(id);
  const [reorderMode, setReorderMode] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(true);
  const [jsonCopied, setJsonCopied] = useState(false);
  const [jsonWrap, setJsonWrap] = useState(true);
  const [leftPct, setLeftPct] = useState(58);
  const containerRef = useRef<HTMLDivElement>(null);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setLeftPct(Math.min(Math.max(pct, 30), 75));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);
  const [allContentTypes, setAllContentTypes] = useState<{ id: number; name: string; schema?: any[] }[]>([]);

  useEffect(() => {
    api.get('/content-types').then((r) => setAllContentTypes(r.data ?? [])).catch(() => {});
  }, []);

  const toggleMethod = (key: string) =>
    setAllowedMethods((prev) => prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setFields((prev) => {
        const oldIndex = prev.findIndex((f) => f._id === active.id);
        const newIndex = prev.findIndex((f) => f._id === over.id);
        // Fields and components are reordered within their own section.
        if (isComponentField(prev[oldIndex]) !== isComponentField(prev[newIndex])) return prev;
        // An inline component's fields move together.
        return prev.some((f) => f.component) ? moveWithInlineRuns(prev, oldIndex, newIndex) : arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const computedName = name.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const dupes = duplicateKeys(fields);
  // Numbers shown on the field cards — fields only, components are listed separately.
  const fieldNumbers: number[] = [];
  fields.reduce((n, f, i) => (isComponentField(f) ? n : ((fieldNumbers[i] = n + 1), n + 1)), 0);
  const componentCount = fields.filter((f, i) => isComponentField(f) && !continuesInlineRun(fields, i)).length;

  useEffect(() => {
    api.get(`/content-types/${id}`)
      .then((res) => {
        const ct = res.data;
        setName(ct.displayName || humanizeName(ct.name));
        setAllowedMethods(ct.allowedMethods ?? ['list', 'read', 'create', 'update', 'delete']);
        setPreviewUrl(ct.previewUrl ?? '');
        setSavedKeys(ct.schema.map((f: any) => f.name));
        setFields(
          ct.schema.length > 0
            ? ct.schema.map((f: any) => f.component ? { _id: uid(), ...inlineEditorField(f), _key: f.name } : ({ _id: uid(), ...f, _key: f.name, name: f.label ?? humanizeName(f.name), required: f.required ?? false, options: withLoadedKeys(optionsForEditor(f.options)) }))
            : [{ _id: uid(), name: '', type: 'text', required: false }],
        );
      })
      .catch(() => { toast.error(t('editor.loadFailed')); router.push('/content-types'); })
      .finally(() => setLoading(false));
  }, [id]);

  /* ── Field mutations ─────────────────────────────────────────────────────── */
  const addField = () => setFields([...fields, { _id: uid(), name: '', type: 'text', required: false }]);
  const removeField = (i: number) => setFields(fields.filter((_, idx) => idx !== i));
  const updateField = (i: number, key: keyof Field, val: any) => {
    const u = [...fields];
    if (key === 'type') {
      u[i] = { ...u[i], type: val, options: defaultOptionsFor(val) };
    } else { (u[i] as any)[key] = val; }
    setFields(u);
  };

  /* ── Submit ──────────────────────────────────────────────────────────────── */
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setNameError(t('editor.nameRequired')); return; }
    setNameError('');
    if (dupes.size) { toast.error(t('editor.duplicateKeys', { keys: [...dupes].join(', ') })); return; }
    const nested = nestedDuplicates(fields);
    if (nested.length) { toast.error(t('editor.duplicateKeys', { keys: nested.join(', ') })); return; }
    const named = fields.filter((f) => f.name.trim());
    // Inline component fields are renamed on /components, never by hand here.
    const changes = detectFieldChanges(savedKeys, named.map((f) => ({ key: toSnakeCase(f.name), original: f.component ? undefined : f._key })));
    const { removed } = changes;
    const renames = [...changes.renames, ...nestedRenames(named)];
    // Conditions point at field keys: follow renames, drop ones whose field is gone.
    const renamedKey = new Map(renames.map((r) => [r.from, r.to]));
    const keys = new Set(named.map((f) => toSnakeCase(f.name)));
    const validFields = named.map((f) => {
      const field = renamedKey.get(f.condition?.field ?? '') ?? f.condition?.field;
      return buildSchemaField({ ...f, condition: f.condition && field && keys.has(field) ? { ...f.condition, field } : undefined });
    });
    if (validFields.length === 0) { toast.error(t('editor.atLeastOneField')); return; }
    setSubmitting(true);
    try {
      let fieldMigrations: FieldMigrations | null | undefined;
      if (renames.length || removed.length || named.some((f) => f._key)) {
        fieldMigrations = await schemaCheck.check(validFields, renames, removed);
        if (fieldMigrations === null) return; // cancelled
      }
      await api.put(`/content-types/${id}`, { name: computedName, displayName: name.trim(), schema: validFields, allowedMethods, previewUrl: previewUrl.trim() || null, ...(fieldMigrations ? { fieldMigrations } : {}) });
      toast.success(t('editor.updated'));
      router.push('/content-types');
    } catch (err: any) {
      toast.error(err.response?.data?.errors?.join('; ') || err.response?.data?.message || tc('somethingWentWrong'));
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Loading skeleton ────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72 mt-1" />
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-9 w-full" />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-8 w-24" />
              </div>
              <Skeleton className="h-11 w-full rounded-md" />
              <Skeleton className="h-11 w-full rounded-md" />
              <Skeleton className="h-11 w-full rounded-md" />
            </div>
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-28" />
          </CardFooter>
        </Card>
      </div>
    );
  }

  /* ── Page ────────────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => router.push('/content-types')}
        >
          <ArrowLeft className="h-4 w-4" /> {t('editor.backToList')}
        </Button>
        <div className="flex items-center gap-2">
          {!loading && (
            <>
              {computedName && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => router.push(`/entries?ct=${computedName}`)}
                    title={t('editor.viewEntriesTitle')}
                  >
                    <FileText className="h-4 w-4 text-blue-400" />
                    {t('editor.viewEntries')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => router.push(`/users/permissions?tab=fields&ct=${computedName}`)}
                    title={t('editor.fieldPermissionsTitle')}
                  >
                    <Shield className="h-4 w-4 text-amber-400" />
                    {t('editor.fieldPermissions')}
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  const payload = {
                    nodepress: '1.0',
                    exportedAt: new Date().toISOString(),
                    contentType: { name, displayName: name.trim(), schema: fields.filter((f) => f.name.trim()).map(buildSchemaField), allowedMethods, previewUrl: previewUrl.trim() || null },
                  };
                  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${name}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <Download className="h-4 w-4" /> {t('editor.exportJson')}
              </Button>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>{t('editor.editTitle')}</CardTitle>
              <CardDescription>
                {t('editor.editDescription')}
              </CardDescription>
            </div>
            <Button
              type="button"
              variant={jsonOpen ? 'secondary' : 'outline'}
              size="sm"
              className="h-7 gap-1.5 text-xs shrink-0 mt-1"
              onClick={() => setJsonOpen((v) => !v)}
            >
              <PanelRight className="h-3.5 w-3.5" />
              {jsonOpen ? t('editor.hideJson') : t('editor.showJson')}
            </Button>
          </div>
        </CardHeader>

        {/* Columns stretch to the form's height, so the side pane has room to stay in view (sticky). */}
        <div ref={containerRef} className="flex border-t border-border">
          {/* Left pane: form */}
          <div style={{ width: jsonOpen ? `${leftPct}%` : '100%' }} className="min-w-0 px-6 py-4">
          <form id="ct-form" onSubmit={onSubmit} className="space-y-6">
            {/* Name */}
            <div className="space-y-1.5">
              <Label>{tc('name')} <span className="text-destructive">*</span></Label>
              <Input
                placeholder={t('editor.namePlaceholderEdit')}
                value={name}
                onChange={(e) => { setName(e.target.value); setNameError(''); }}
              />
              {nameError
                ? <p className="text-xs text-destructive">{nameError}</p>
                : computedName && (
                  <p className="text-xs text-muted-foreground">
                    {t('editor.apiEndpoint')}{' '}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                      GET /api/<strong>{computedName.replace(/_/g, '-')}</strong>
                    </code>
                  </p>
                )}
            </div>

            {/* Live preview page */}
            <PreviewUrlSetting value={previewUrl} onChange={setPreviewUrl} />

            {/* API Endpoints */}
            <div className="space-y-2">
              <Label>{t('editor.apiEndpoints')}</Label>
              <p className="text-xs text-muted-foreground">{t('editor.apiEndpointsHint')}</p>
              <div className="rounded-md border bg-muted/20 divide-y divide-border">
                {ALL_METHODS.map(({ key, verb, path }) => (
                  <label key={key} className="flex items-center gap-3 px-3 py-2 cursor-pointer select-none hover:bg-muted/40">
                    <Checkbox
                      checked={allowedMethods.includes(key)}
                      onCheckedChange={() => toggleMethod(key)}
                    />
                    <span className={`text-xs font-mono font-semibold w-14 shrink-0 ${VERB_COLOR[verb]}`}>{verb}</span>
                    <code className="text-xs font-mono text-muted-foreground flex-1">
                      /api/{(computedName || ':type').replace(/_/g, '-')}{path}
                    </code>
                    <span className="text-xs text-foreground shrink-0">{t(`methods.${key}`)}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Fields */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <Label>{t('editor.fields')}</Label>
                <div className="flex items-center gap-2">
                  <Button
                    variant={reorderMode ? 'secondary' : 'outline'}
                    onClick={() => setReorderMode((v) => !v)}
                  >
                    <ArrowUpDown className="h-4 w-4 mr-1.5" />
                    {reorderMode ? t('editor.done') : t('editor.reorder')}
                  </Button>
                  <Button variant="outline" onClick={addField} disabled={reorderMode}>
                    <Plus className="h-4 w-4 mr-1.5" /> {t('editor.addField')}
                  </Button>
                </div>
              </div>

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={fields.filter((f) => !isComponentField(f)).map((f) => f._id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
              {fields.map((field, fi) => isComponentField(field) ? null : (
                <SortableFieldCard key={field._id} id={field._id} disabled={!reorderMode}>
                  {(dragHandle) => (
                  <div className="rounded-md border bg-muted/30 p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    {reorderMode && dragHandle}
                    {/* Field number */}
                    <span className="text-sm font-semibold text-foreground w-5 shrink-0 text-right select-none">
                      {fieldNumbers[fi]}
                    </span>
                    <div className="flex-1 space-y-1">
                      <Input
                        placeholder={t('editor.fieldNamePlaceholder')}
                        value={field.name}
                        onChange={(e) => updateField(fi, 'name', e.target.value)}
                        aria-invalid={dupes.has(editorFieldKey(field))}
                      />
                      {field.name.trim() && (dupes.has(editorFieldKey(field)) ? (
                        <p className="text-xs text-destructive px-0.5">{t('editor.duplicateKey', { key: editorFieldKey(field) })}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground px-0.5">
                          {t('editor.fieldKey')} <code className="rounded bg-muted px-1 py-0.5 font-mono">{field.name.trim().toLowerCase().replace(/[\s-]+/g, '_')}</code>
                        </p>
                      ))}
                    </div>
                    <FieldTypeSelect
                      value={field.type}
                      onChange={(val) => updateField(fi, 'type', val)}
                      className="w-40"
                    />
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap cursor-pointer select-none">
                      <Checkbox
                        checked={!!field.required}
                        onCheckedChange={(c) => updateField(fi, 'required', c === true)}
                      />
                      {t('editor.required')}
                    </label>
                    {INDEXABLE_FIELD_TYPES.has(field.type) && (
                      <label
                        className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap cursor-pointer select-none"
                        title={t('editor.indexedHint')}
                      >
                        <Checkbox
                          checked={!!field.indexed}
                          onCheckedChange={(c) => updateField(fi, 'indexed', c === true)}
                        />
                        {t('editor.indexed')}
                      </label>
                    )}
                    <div className="flex items-center gap-0.5 shrink-0">
                      {computedName && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className={cn(
                            'h-4 w-8',
                            (field.readRoles && field.readRoles.length > 0) || (field.writeRoles && field.writeRoles.length > 0)
                              ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                          title={t('editor.fieldAccessTitle')}
                          onClick={() => router.push(`/users/permissions?tab=fields&ct=${computedName}`)}
                        >
                          <Shield className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="h-4 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        disabled={fields.length === 1}
                        onClick={() => removeField(fi)}
                        title={t('editor.deleteField')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="pl-7">
                    <FieldConditionEditor
                      condition={field.condition}
                      onChange={(c) => updateField(fi, 'condition', c)}
                      siblings={fields
                        .filter((o) => o._id !== field._id && o.name.trim())
                        .map((o) => ({ key: toSnakeCase(o.name), label: o.name.trim(), type: o.type, choices: o.type === 'select' ? choiceList(o.options?.choices) : undefined }))}
                    />
                  </div>

                  {/* Select choices */}
                  {field.type === 'select' && (
                    <SelectChoicesSource className="pl-7" options={field.options} onChange={(o) => updateField(fi, 'options', o)}>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">{t('editor.choices')}</Label>
                        <Textarea
                          placeholder={t('editor.choicesPlaceholder')}
                          value={field.options?.choices ?? ''}
                          onChange={(e) => updateField(fi, 'options', { ...field.options, choices: e.target.value })}
                          rows={2}
                          className="resize-none"
                        />
                      </div>
                    </SelectChoicesSource>
                  )}

                  {field.type === 'relation' && (
                    <RelationFieldOptions
                      options={field.options}
                      onChange={(o) => updateField(fi, 'options', { ...field.options, ...o })}
                      contentTypes={allContentTypes}
                      currentType={computedName}
                    />
                  )}

                  {/* Repeater / group sub-fields and flexible layouts — they nest (see NestedFieldsEditor) */}
                  {(field.type === 'repeater' || field.type === 'group') && field.options?.subFields && !field.options.component && (
                    <div className="pl-7">
                      <NestedFields
                        kind={field.type}
                        fields={field.options.subFields}
                        depth={1}
                        onChange={(subFields) => updateField(fi, 'options', { ...field.options, subFields })}
                      />
                    </div>
                  )}

                  {field.type === 'flexible' && field.options?.layouts && (
                    <div className="pl-7">
                      <NestedLayouts
                        layouts={field.options.layouts}
                        depth={1}
                        onChange={(layouts) => updateField(fi, 'options', { ...field.options, layouts })}
                        actions={
                          <AddComponentLayoutButton
                            taken={new Set(field.options.layouts.map((l) => toFieldKey(l.name)).filter(Boolean))}
                            onAdd={(l) => updateField(fi, 'options', { ...field.options, layouts: [...field.options!.layouts!, l] })}
                          />
                        }
                      />
                    </div>
                  )}
                  </div>
                  )}
                </SortableFieldCard>
              ))}
                  </div>
                </SortableContext>

              {/* Bottom controls — duplicate of the header buttons, only once
                  the list is long enough that the header has scrolled away */}
              {fieldNumbers.filter(Boolean).length >= 4 && (
                <div className="flex items-center justify-end gap-2 mt-3">
                  <Button
                    variant={reorderMode ? 'secondary' : 'outline'}
                    onClick={() => setReorderMode((v) => !v)}
                  >
                    <ArrowUpDown className="h-4 w-4 mr-1.5" />
                    {reorderMode ? t('editor.done') : t('editor.reorder')}
                  </Button>
                  <Button variant="outline" onClick={addField} disabled={reorderMode}>
                    <Plus className="h-4 w-4 mr-1.5" /> {t('editor.addField')}
                  </Button>
                </div>
              )}

              {/* Fields from components — their own section, reordered among themselves */}
              <div className="mt-8">
                <ComponentsSection
                  count={componentCount}
                  addButton={
                    <AddComponentButton
                      taken={takenKeys(fields)}
                      onAdd={(f) => setFields([...fields, { _id: uid(), ...f }])}
                      onAddInline={(fs) => setFields([...fields, ...fs.map((f) => ({ _id: uid(), ...inlineEditorField(f) }))])}
                      disabled={reorderMode}
                    />
                  }
                >
                  <SortableContext items={fields.filter((f, i) => isComponentField(f) && !continuesInlineRun(fields, i)).map((f) => f._id)} strategy={verticalListSortingStrategy}>
                    {fields.map((field, fi) => !isComponentField(field) || continuesInlineRun(fields, fi) ? null : (
                      <SortableFieldCard key={field._id} id={field._id} disabled={!reorderMode}>
                        {(dragHandle) => field.component ? (
                          <InlineComponentBlock
                            fields={fields}
                            index={fi}
                            duplicates={dupes}
                            dragHandle={reorderMode ? dragHandle : undefined}
                            onRemove={() => setFields(removeInlineRun(fields, fi))}
                          />
                        ) : (
                          <ComponentFieldCard
                            field={field}
                            duplicate={dupes.has(editorFieldKey(field))}
                            dragHandle={reorderMode ? dragHandle : undefined}
                            onName={(v) => updateField(fi, 'name', v)}
                            onRequired={(v) => updateField(fi, 'required', v)}
                            onRemove={() => removeField(fi)}
                            removeDisabled={fields.length === 1}
                          />
                        )}
                      </SortableFieldCard>
                    ))}
                  </SortableContext>
                </ComponentsSection>
              </div>
              </DndContext>

            </div>
          </form>
          </div>

          {/* Drag handle */}
          {jsonOpen && (
            <div
              onMouseDown={onDragStart}
              className="relative w-px self-stretch shrink-0 cursor-col-resize group select-none bg-border hover:bg-primary/40 transition-colors"
            >
              <div className="absolute inset-y-0 -left-2 -right-2" />
            </div>
          )}

          {/* Right pane: JSON schema preview */}
          {jsonOpen && (() => {
            const liveJson = {
              name: computedName || '(unnamed)',
              displayName: name.trim() || '(unnamed)',
              schema: fields.filter((f) => f.name.trim()).map(buildSchemaField),
              allowedMethods,
            };
            const jsonStr = JSON.stringify(liveJson, null, 2);
            return (
              <div style={{ width: `${100 - leftPct}%` }} className="min-w-0 border-l border-border">
                {/* Stays in view just below the sticky top bar (h-14); the JSON scrolls inside. */}
                <div className="sticky top-14 max-h-[calc(100vh-3.5rem)] flex flex-col gap-2 px-4 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Braces className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium">{t('editor.jsonPreview')}</span>
                      <span className="text-[10px] bg-emerald-500/15 text-emerald-500 rounded px-1.5 py-0.5">{t('editor.live')}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setJsonWrap((w) => !w)}
                        className={`flex items-center gap-1 text-[11px] transition-colors ${jsonWrap ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                        title={jsonWrap ? t('editor.disableWrap') : t('editor.wrapLines')}
                      >
                        <WrapText className="h-3.5 w-3.5" />
                        {t('editor.wrap')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(jsonStr);
                          setJsonCopied(true);
                          setTimeout(() => setJsonCopied(false), 2000);
                        }}
                        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                        title={t('editor.copyJson')}
                      >
                        {jsonCopied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                        {jsonCopied ? tc('copied') : tc('copy')}
                      </button>
                    </div>
                  </div>
                  <pre className={`flex-1 min-h-0 overflow-auto p-3 rounded-md border border-border bg-muted/20 text-[11px] leading-relaxed text-foreground font-mono ${jsonWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'}`}><code dangerouslySetInnerHTML={{ __html: highlightCode(jsonStr, 'json') }} /></pre>
                </div>
              </div>
            );
          })()}
        </div>

        {schemaCheck.dialog}
        <CardFooter className="justify-end gap-2">
          <Button variant="outline" onClick={() => router.push('/content-types')}>{tc('cancel')}</Button>
          <Button type="submit" form="ct-form" disabled={submitting || dupes.size > 0}>
            {submitting ? tc('saving') : t('editor.saveChanges')}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
