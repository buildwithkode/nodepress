'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, ArrowLeft, Upload, Braces, Copy, Check, PanelRight, WrapText } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'use-intl';
import api from '@/lib/axios';
import { highlightCode } from '@/lib/highlight';
import { STICKY_HEADER, STICKY_PANE_ROW, MAIN_PANE, SIDE_PANE, SIDE_PANE_BODY, paneWidth, isNarrowScreen } from '@/components/SidePane';
import { useStickyHeader } from '@/lib/use-sticky-header';
import { ExpandCollapseAll, useOpenRows } from '@/components/OpenRows';
import { FieldCardRow } from '@/components/FieldCardRow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
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
import { NestedFields, NestedLayouts, defaultOptionsFor } from '@/components/NestedFieldsEditor';
import { FieldWidthSelect, type FieldWidth } from '@/components/FieldWidth';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableItem, useDragSensors } from '@/components/SortableItem';
import { AddComponentButton, AddComponentLayoutButton, ComponentFieldCard, ComponentsSection, InlineComponentBlock, continuesInlineRun, inlineEditorField, moveWithInlineRuns, removeInlineRun } from '@/components/ComponentFieldControls';
import { duplicateKeys, editorFieldKey, isComponentField, nestedDuplicates, takenKeys, toFieldKey } from '@/lib/field-keys';
import { AiContentModelButton } from '@/components/AiAssist';
import { PreviewUrlSetting } from '@/components/LivePreviewPane';
import { FieldConditionEditor } from '@/components/FieldConditionEditor';
import type { FieldCondition } from '@/lib/field-condition';

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
  /** The editor's own row id, never saved. */
  _id:      string;
  name:     string;
  type:     string;
  required: boolean;
  indexed?: boolean;
  options?: { subFields?: SubField[]; layouts?: Layout[]; choices?: string; relatedContentType?: string; cardinality?: string; mappedBy?: string; component?: string };
  condition?: FieldCondition;
  width?: FieldWidth;
  /** Inline component field: the component's name, and the field as saved (read-only here). */
  component?: string;
  inline?: any;
}

let _counter = 0;
const uid = () => `f-${Date.now()}-${_counter++}`;

const toSnakeCase = (name: string) =>
  name.trim().toLowerCase().replace(/[\s-]+/g, '_');

// Turn an editor field into the saved schema object: `name` is the snake_case
// field key, `label` preserves the human wording the user typed.
const buildSchemaField = (f: { name: string; type: string; required: boolean; indexed?: boolean; options?: any; condition?: FieldCondition; width?: string; inline?: any }) => f.inline ?? ({
  name: toSnakeCase(f.name),
  type: f.type,
  label: f.name.trim(),
  required: f.required,
  ...(f.indexed && INDEXABLE_FIELD_TYPES.has(f.type) ? { indexed: true } : {}),
  ...(f.options ? { options: optionsForSave(f.options) } : {}),
  ...(f.condition ? { condition: f.condition } : {}),
  ...(f.width ? { width: f.width } : {}),
});

/** Choices of a select field as typed in the editor (comma separated). */
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

export default function NewContentTypePage() {
  const t = useTranslations('contentTypes');
  const tc = useTranslations('common');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [fields, setFields] = useState<Field[]>([{ _id: uid(), name: '', type: 'text', required: false }]);
  const rows = useOpenRows(fields.filter((f) => !isComponentField(f)).map((f) => f._id), true);
  const [allowedMethods, setAllowedMethods] = useState(['list', 'read', 'create', 'update', 'delete']);
  const [previewUrl, setPreviewUrl] = useState('');
  const [jsonOpen, setJsonOpen] = useState(true);
  // Phones start with the side pane closed: the form comes first.
  useEffect(() => { if (isNarrowScreen()) setJsonOpen(false); }, []);
  const [jsonCopied, setJsonCopied] = useState(false);
  const [jsonWrap, setJsonWrap] = useState(true);
  const [leftPct, setLeftPct] = useState(58);
  const containerRef = useRef<HTMLDivElement>(null);
  const { stickyHeaderRef, paneRowStyle } = useStickyHeader();

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
  const importRef = useRef<HTMLInputElement>(null);

  const computedName = toSnakeCase(name);
  const dupes = duplicateKeys(fields);
  // Numbers shown on the field cards — fields only, components are listed separately.
  const fieldNumbers: number[] = [];
  fields.reduce((n, f, i) => (isComponentField(f) ? n : ((fieldNumbers[i] = n + 1), n + 1)), 0);
  const componentCount = fields.filter((f, i) => isComponentField(f) && !continuesInlineRun(fields, i)).length;

  const toggleMethod = (key: string) =>
    setAllowedMethods((prev) => prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        const ct = json.contentType;
        if (!ct || typeof ct.name !== 'string' || !Array.isArray(ct.schema)) {
          toast.error(t('editor.invalidImportFile'));
          return;
        }
        setName(ct.displayName || ct.name);
        setFields(
          ct.schema.length > 0
            ? ct.schema.map((f: any) => f.component ? { _id: uid(), ...inlineEditorField(f) } : ({ _id: uid(), name: f.label ?? f.name ?? '', type: f.type ?? 'text', required: f.required ?? false, indexed: f.indexed ?? false, width: f.width, options: optionsForEditor(f.options) }))
            : [{ _id: uid(), name: '', type: 'text', required: false }],
        );
        if (Array.isArray(ct.allowedMethods)) setAllowedMethods(ct.allowedMethods);
        if (typeof ct.previewUrl === 'string') setPreviewUrl(ct.previewUrl);
        toast.success(t('editor.imported', { name: ct.name }));
      } catch {
        toast.error(t('editor.parseFailed'));
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const addField = () => { rows.markAdding(); setFields([...fields, { _id: uid(), name: '', type: 'text', required: false }]); };
  const sensors = useDragSensors();
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setFields((prev) => {
      const from = prev.findIndex((f) => f._id === active.id);
      const to = prev.findIndex((f) => f._id === over.id);
      // Fields and components are reordered within their own section.
      if (isComponentField(prev[from]) !== isComponentField(prev[to])) return prev;
      // An inline component's fields move together.
      return prev.some((f) => f.component) ? moveWithInlineRuns(prev, from, to) : arrayMove(prev, from, to);
    });
  };
  const removeField = (i: number) => setFields(fields.filter((_, idx) => idx !== i));
  const updateField = (i: number, key: keyof Field, val: any) => {
    const u = [...fields];
    if (key === 'type') {
      u[i] = { ...u[i], type: val, options: defaultOptionsFor(val) };
    } else { (u[i] as any)[key] = val; }
    setFields(u);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setNameError(t('editor.nameRequired')); return; }
    setNameError('');
    if (dupes.size) { toast.error(t('editor.duplicateKeys', { keys: [...dupes].join(', ') })); return; }
    const nested = nestedDuplicates(fields);
    if (nested.length) {
      fields.forEach((f) => { if (nestedDuplicates([f]).length) rows.setRowOpen(f._id, true); });
      toast.error(t('editor.duplicateKeys', { keys: nested.join(', ') }));
      return;
    }
    // Keep the user's exact wording as the human label; the backend derives the
    // snake_case field key from `name`.
    const validFields = fields
      .filter((f) => f.name.trim())
      .map(buildSchemaField);
    if (validFields.length === 0) { toast.error(t('editor.atLeastOneField')); return; }
    setSubmitting(true);
    try {
      const res = await api.post('/content-types', { name: computedName, displayName: name.trim(), schema: validFields, allowedMethods, previewUrl: previewUrl.trim() || null });
      toast.success(t('editor.created'));
      router.push(`/content-types/${res.data.id}/edit`);
    } catch (err: any) {
      toast.error(err.response?.data?.errors?.join('; ') || err.response?.data?.message || tc('somethingWentWrong'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => router.push('/content-types')}>
          <ArrowLeft className="h-4 w-4" /> {t('editor.backToList')}
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => importRef.current?.click()}>
          <Upload className="h-4 w-4" /> {t('editor.importJson')}
        </Button>
        <input ref={importRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImport} />
      </div>

      <Card>
        <div ref={stickyHeaderRef} className={STICKY_HEADER}>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>{t('editor.newTitle')}</CardTitle>
              <CardDescription>{t('editor.newDescription')}</CardDescription>
            </div>
            <div className="flex items-start gap-2">
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
            <Button type="submit" form="ct-form" size="sm" className="h-7 text-xs shrink-0 mt-1" disabled={submitting || dupes.size > 0}>
              {submitting ? t('editor.creating') : tc('create')}
            </Button>
            </div>
          </div>
        </CardHeader>
        </div>

        {/* Columns stretch to the form's height, so the side pane has room to stay in view (sticky). */}
        <div ref={containerRef} className={STICKY_PANE_ROW} style={paneRowStyle}>
          {/* Left pane: form */}
          <div style={paneWidth(jsonOpen ? leftPct : 100)} className={MAIN_PANE}>
          <form id="ct-form" onSubmit={onSubmit} className="space-y-6">
            <AiContentModelButton
              onSuggested={(ct) => {
                setName(ct.displayName || ct.name);
                setFields(ct.schema.map((f: any) => ({ _id: uid(), name: f.label ?? f.name ?? '', type: f.type ?? 'text', required: f.required ?? false, indexed: f.indexed ?? false, width: f.width, options: optionsForEditor(f.options) })));
              }}
            />
            {/* Name */}
            <div className="space-y-1.5">
              <Label>{tc('name')} <span className="text-destructive">*</span></Label>
              <Input
                placeholder={t('editor.namePlaceholderNew')}
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
                    <code className="min-w-0 flex-1 break-all text-xs font-mono text-muted-foreground">
                      /api/{(computedName || ':type').replace(/_/g, '-')}{path}
                    </code>
                    <span className="text-xs text-foreground shrink-0">{t(`methods.${key}`)}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Fields */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <Label>{t('editor.fields')}</Label>
                <div className="flex items-center gap-2">
                  <ExpandCollapseAll count={fieldNumbers.filter(Boolean).length} onChange={rows.setAllOpen} />
                  <Button variant="outline" onClick={addField}>
                    <Plus className="h-4 w-4 mr-1.5" /> {t('editor.addField')}
                  </Button>
                </div>
              </div>

              <DndContext id="new-content-type-fields" sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={fields.filter((f) => !isComponentField(f)).map((f) => f._id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {fields.map((field, fi) => isComponentField(field) ? null : (
                  <SortableItem key={field._id} id={field._id}>
                  {(dragHandle) => (
                  <FieldCardRow
                      open={rows.isOpen(field._id)}
                      onOpenChange={(open) => rows.setRowOpen(field._id, open)}
                      dragHandle={dragHandle}
                      number={fieldNumbers[fi]}
                      name={field.name}
                      fieldKey={editorFieldKey(field)}
                      type={field.type}
                      required={field.required}
                      duplicate={dupes.has(editorFieldKey(field))}
                      removeDisabled={fields.length === 1}
                      onRemove={() => removeField(fi)}
                      appear={rows.isNew(field._id)}
                    >
                    <div className="flex flex-wrap items-start gap-2">
                      <div className="min-w-40 flex-1 space-y-1">
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
                      <FieldTypeSelect value={field.type} onChange={(val) => updateField(fi, 'type', val)} className="w-40" />
                      <FieldWidthSelect value={field.width} onChange={(w) => updateField(fi, 'width', w)} />
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap cursor-pointer select-none">
                        <Checkbox checked={!!field.required} onCheckedChange={(c) => updateField(fi, 'required', c === true)} />
                        {t('editor.required')}
                      </label>
                      {INDEXABLE_FIELD_TYPES.has(field.type) && (
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap cursor-pointer select-none" title={t('editor.indexedHint')}>
                          <Checkbox checked={!!field.indexed} onCheckedChange={(c) => updateField(fi, 'indexed', c === true)} />
                          {t('editor.indexed')}
                        </label>
                      )}
                    </div>

                    <div className="pl-7">
                      <FieldConditionEditor
                        condition={field.condition}
                        onChange={(c) => updateField(fi, 'condition', c)}
                        siblings={fields
                          .filter((o, oi) => oi !== fi && o.name.trim())
                          .map((o) => ({ key: toSnakeCase(o.name), label: o.name.trim(), type: o.type, choices: o.type === 'select' ? choiceList(o.options?.choices) : undefined }))}
                      />
                    </div>

                    {field.type === 'select' && (
                      <SelectChoicesSource className="pl-7" options={field.options} onChange={(o) => updateField(fi, 'options', o)}>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">{t('editor.choices')}</Label>
                          <Textarea placeholder={t('editor.choicesPlaceholder')} value={field.options?.choices ?? ''} onChange={(e) => updateField(fi, 'options', { ...field.options, choices: e.target.value })} rows={2} className="resize-none" />
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
                  </FieldCardRow>
                  )}
                  </SortableItem>
                ))}
              </div>
              </SortableContext>

              {/* Bottom control — duplicate of the header button, only once
                  the list is long enough that the header has scrolled away */}
              {fieldNumbers.filter(Boolean).length >= 4 && (
                <div className="flex items-center justify-end mt-3">
                  <Button variant="outline" onClick={addField}>
                    <Plus className="h-4 w-4 mr-1.5" /> {t('editor.addField')}
                  </Button>
                </div>
              )}

              {/* Fields from components — their own section */}
              <div className="mt-8">
                <ComponentsSection
                  count={componentCount}
                  addButton={
                    <AddComponentButton
                      taken={takenKeys(fields)}
                      onAdd={(f) => setFields([...fields, { _id: uid(), ...f }])}
                      onAddInline={(fs) => setFields([...fields, ...fs.map((f) => ({ _id: uid(), ...inlineEditorField(f) }))])}
                    />
                  }
                >
                  <SortableContext items={fields.filter((f, i) => isComponentField(f) && !continuesInlineRun(fields, i)).map((f) => f._id)} strategy={verticalListSortingStrategy}>
                    {fields.map((field, fi) => !isComponentField(field) || continuesInlineRun(fields, fi) ? null : (
                      <SortableItem key={field._id} id={field._id}>
                        {(dragHandle) => field.component ? (
                          <InlineComponentBlock fields={fields} index={fi} duplicates={dupes} dragHandle={dragHandle} onRemove={() => setFields(removeInlineRun(fields, fi))} />
                        ) : (
                          <ComponentFieldCard
                            field={field}
                            duplicate={dupes.has(editorFieldKey(field))}
                            dragHandle={dragHandle}
                            onName={(v) => updateField(fi, 'name', v)}
                            onRequired={(v) => updateField(fi, 'required', v)}
                            onRemove={() => removeField(fi)}
                            removeDisabled={fields.length === 1}
                          />
                        )}
                      </SortableItem>
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
              className="relative hidden w-px self-stretch shrink-0 cursor-col-resize lg:block group select-none bg-border hover:bg-primary/40 transition-colors"
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
              <div style={paneWidth(100 - leftPct)} className={SIDE_PANE}>
                {/* Stays in view just below the sticky top bar (h-14); the JSON scrolls inside. */}
                <div className={`${SIDE_PANE_BODY} flex flex-col gap-2 px-4 py-4`}>
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

        <CardFooter className="justify-end gap-2">
          <Button variant="outline" onClick={() => router.push('/content-types')}>{tc('cancel')}</Button>
          <Button type="submit" form="ct-form" disabled={submitting || dupes.size > 0}>
            {submitting ? t('editor.creating') : tc('create')}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
