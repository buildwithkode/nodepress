'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Blocks, ChevronDown, ChevronRight, Lock, Trash2 } from 'lucide-react';
import { useTranslations } from 'use-intl';
import api from '@/lib/axios';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { freeFieldName, toFieldKey } from '@/lib/field-keys';

export interface ComponentField { name: string; type: string; label?: string; required?: boolean; options?: any }
export interface ReusableComponent {
  id: number;
  name: string;
  displayName?: string | null;
  description?: string | null;
  fields: ComponentField[];
}

/** The field the content type editors insert: a group (one) or repeater (many) using the component. */
export interface ComponentFieldDraft {
  name: string;
  type: 'group' | 'repeater';
  required: boolean;
  options: { component: string; subFields: ComponentField[] };
}

/** A top-level field inserted inline from a component — sent to the server tagged with `component`. */
export type InlineComponentField = ComponentField & { component: string; condition?: any };

/**
 * A flexible layout made from a component: its fields are the component's
 * (inline, `component` set), or one group / repeater field using it.
 */
export interface ComponentLayoutDraft { name: string; label: string; component?: string; fields: ComponentField[] }

/** Editor state for an inline field: its key as the name, the saved object kept as-is in `inline`. */
export const inlineEditorField = (f: InlineComponentField) => ({
  name: f.name, type: f.type, required: !!f.required, component: f.component, inline: f,
});

type Tagged = { component?: string };
/** Index range [start, end) of the inline run containing `i` (just `i` for an ordinary field). */
function runAt(list: Tagged[], i: number): [number, number] {
  const c = list[i]?.component;
  if (!c) return [i, i + 1];
  let s = i;
  while (s > 0 && list[s - 1].component === c) s--;
  let e = i + 1;
  while (e < list.length && list[e].component === c) e++;
  return [s, e];
}

/** True for the 2nd, 3rd… field of an inline run — the editors show the run once, at its first field. */
export const continuesInlineRun = (list: Tagged[], i: number) =>
  i > 0 && !!list[i].component && list[i - 1].component === list[i].component;

/** Remove the whole inline run containing field `i`. */
export function removeInlineRun<T extends Tagged>(list: T[], i: number): T[] {
  const [s, e] = runAt(list, i);
  return [...list.slice(0, s), ...list.slice(e)];
}

/** Move field `from` to where field `to` is, carrying inline runs as one block. */
export function moveWithInlineRuns<T extends Tagged>(list: T[], from: number, to: number): T[] {
  const [s, e] = runAt(list, from);
  const block = list.slice(s, e);
  const rest = [...list.slice(0, s), ...list.slice(e)];
  const [ts, te] = runAt(list, to);
  const at = to > from ? te - block.length : ts;
  return [...rest.slice(0, at), ...block, ...rest.slice(at)];
}

function useComponentList(open: boolean) {
  const [components, setComponents] = useState<ReusableComponent[] | null>(null);
  useEffect(() => {
    if (!open || components) return;
    api.get('/components').then((r) => setComponents(r.data ?? [])).catch(() => setComponents([]));
  }, [open, components]);
  return components;
}

function ComponentPicker({ components, value, onChange }: { components: ReusableComponent[] | null; value: string; onChange: (name: string) => void }) {
  const tcm = useTranslations('components');
  const component = components?.find((c) => c.name === value);
  return (
    <div className="space-y-1.5">
      <Label>{tcm('add.component')}</Label>
      <Select value={value} onValueChange={(v) => onChange(String(v ?? ''))}>
        <SelectTrigger className="w-full"><SelectValue placeholder={tcm('add.choose')} /></SelectTrigger>
        <SelectContent>
          {(components ?? []).map((c) => (
            <SelectItem key={c.name} value={c.name}>{c.displayName || c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {component?.description && <p className="text-xs text-muted-foreground">{component.description}</p>}
    </div>
  );
}

/**
 * "Add component" for the content type editors: a group (one), a repeater
 * (many), or the component's fields inline. The server copies the component's
 * fields in on save; the copy here is only for display and the JSON preview.
 * `taken` holds the content type's field keys: the suggested field name avoids
 * them (`Testimonial 2`), and inline fields that would clash are refused.
 */
export function AddComponentButton({ onAdd, onAddInline, disabled, taken = new Set() }: {
  onAdd: (field: ComponentFieldDraft) => void;
  onAddInline: (fields: InlineComponentField[]) => void;
  disabled?: boolean;
  taken?: Set<string>;
}) {
  const tcm = useTranslations('components');
  const [open, setOpen] = useState(false);
  const components = useComponentList(open);
  const [selected, setSelected] = useState('');
  const [kind, setKind] = useState<'group' | 'repeater' | 'inline'>('group');
  const [fieldName, setFieldName] = useState('');

  const component = components?.find((c) => c.name === selected);
  const keyTaken = kind !== 'inline' && !!fieldName.trim() && taken.has(toFieldKey(fieldName));
  const inlineClashes = kind === 'inline' && component ? component.fields.map((f) => f.name).filter((n) => taken.has(n)) : [];

  const pick = (name: string) => {
    setSelected(name);
    const c = components?.find((x) => x.name === name);
    setFieldName(c ? freeFieldName(c.displayName || c.name, taken) : '');
  };

  const add = () => {
    if (!component || keyTaken || inlineClashes.length) return;
    if (kind === 'inline') {
      onAddInline(component.fields.map((f) => ({ ...f, component: component.name })));
    } else {
      if (!fieldName.trim()) return;
      onAdd({
        name: fieldName.trim(),
        type: kind,
        required: false,
        options: { component: component.name, subFields: component.fields.map((f) => ({ ...f })) },
      });
    }
    setOpen(false);
    setSelected('');
    setFieldName('');
    setKind('group');
  };

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)} disabled={disabled}>
        <Blocks className="h-4 w-4 mr-1.5" /> {tcm('add.button')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tcm('add.title')}</DialogTitle>
            <DialogDescription>{tcm('add.description')}</DialogDescription>
          </DialogHeader>
          {components && components.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {tcm.rich('add.none', { link: (chunks) => <Link href="/components" className="text-primary underline">{chunks}</Link> })}
            </p>
          ) : (
            <div className="space-y-4">
              <ComponentPicker components={components} value={selected} onChange={pick} />
              <div className="space-y-1.5">
                <Label>{tcm('add.kind')}</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(['group', 'repeater', 'inline'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKind(k)}
                      className={cn(
                        'rounded-md border px-3 py-2 text-left text-sm transition-colors',
                        kind === k ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
                      )}
                    >
                      <span className="font-medium">{tcm(`add.${k}`)}</span>
                      <span className="block text-xs text-muted-foreground">{tcm(`add.${k}Hint`)}</span>
                    </button>
                  ))}
                </div>
              </div>
              {kind === 'inline' ? (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{tcm('add.inlineNote')}</p>
                  {inlineClashes.length > 0 && (
                    <p className="text-xs text-destructive">{tcm('add.inlineKeysTaken', { keys: inlineClashes.join(', ') })}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>{tcm('add.fieldName')}</Label>
                  <Input value={fieldName} onChange={(e) => setFieldName(e.target.value)} aria-invalid={keyTaken} />
                  {keyTaken
                    ? <p className="text-xs text-destructive">{tcm('add.keyTaken', { key: toFieldKey(fieldName) })}</p>
                    : fieldName.trim() && <p className="text-xs text-muted-foreground">{tcm('add.fieldKey')} <code className="rounded bg-muted px-1 py-0.5 font-mono">{toFieldKey(fieldName)}</code></p>}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{tcm('cancel')}</Button>
            <Button type="button" onClick={add} disabled={!component || (kind !== 'inline' && !fieldName.trim()) || keyTaken || inlineClashes.length > 0}>{tcm('add.confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * "Add layout from component" for a flexible field's layouts. `taken` holds the
 * field's layout names: the suggested name avoids them (`testimonial_2`), so the
 * same component can be added twice, and a name already used is refused.
 */
export function AddComponentLayoutButton({ onAdd, disabled, taken = new Set() }: {
  onAdd: (layout: ComponentLayoutDraft) => void;
  disabled?: boolean;
  taken?: Set<string>;
}) {
  const tcm = useTranslations('components');
  const [open, setOpen] = useState(false);
  const components = useComponentList(open);
  const [selected, setSelected] = useState('');
  const [kind, setKind] = useState<'group' | 'repeater' | 'inline'>('inline');
  const [fieldName, setFieldName] = useState('');
  const [layoutName, setLayoutName] = useState('');
  const component = components?.find((c) => c.name === selected);
  const layoutKey = toFieldKey(layoutName);
  const layoutTaken = !!layoutKey && taken.has(layoutKey);
  const ready = !!component && !!layoutKey && !layoutTaken && (kind === 'inline' || !!fieldName.trim());

  const pick = (name: string) => {
    setSelected(name);
    const c = components?.find((x) => x.name === name);
    setFieldName(c ? c.displayName || c.name : '');
    setLayoutName(c ? toFieldKey(freeFieldName(c.name, taken)) : '');
  };

  const add = () => {
    if (!component || !ready) return;
    const fields = component.fields.map((f) => ({ ...f }));
    // A second copy of the same component gets a numbered label too (`Testimonial 2`).
    const base = component.displayName || component.name;
    const suffix = layoutKey.startsWith(`${component.name}_`) ? layoutKey.slice(component.name.length + 1) : '';
    const label = /^\d+$/.test(suffix) ? `${base} ${suffix}` : base;
    onAdd(kind === 'inline'
      ? { name: layoutKey, label, component: component.name, fields }
      : {
          name: layoutKey,
          label,
          // The layout holds one field: a group (one) or repeater (many) kept in sync with the component.
          fields: [{ name: toFieldKey(fieldName), label: fieldName.trim(), type: kind, options: { component: component.name, subFields: fields } }],
        });
    setOpen(false);
    setSelected('');
    setFieldName('');
    setLayoutName('');
    setKind('inline');
  };

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)} disabled={disabled}>
        <Blocks className="h-4 w-4 mr-1.5" /> {tcm('layout.button')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tcm('layout.title')}</DialogTitle>
            <DialogDescription>{tcm('layout.description')}</DialogDescription>
          </DialogHeader>
          {components && components.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {tcm.rich('add.none', { link: (chunks) => <Link href="/components" className="text-primary underline">{chunks}</Link> })}
            </p>
          ) : (
            <div className="space-y-4">
              <ComponentPicker components={components} value={selected} onChange={pick} />
              {component && (
                <div className="space-y-1.5">
                  <Label>{tcm('layout.name')}</Label>
                  <Input value={layoutName} onChange={(e) => setLayoutName(e.target.value)} aria-invalid={layoutTaken} />
                  {layoutTaken
                    ? <p className="text-xs text-destructive">{tcm('layout.nameTaken', { key: layoutKey })}</p>
                    : layoutName.trim() && layoutKey !== layoutName && <p className="text-xs text-muted-foreground">{tcm('add.fieldKey')} <code className="rounded bg-muted px-1 py-0.5 font-mono">{layoutKey}</code></p>}
                </div>
              )}
              <div className="space-y-1.5">
                <Label>{tcm('add.kind')}</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(['group', 'repeater', 'inline'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKind(k)}
                      className={cn(
                        'rounded-md border px-3 py-2 text-left text-sm transition-colors',
                        kind === k ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
                      )}
                    >
                      <span className="font-medium">{tcm(`add.${k}`)}</span>
                      <span className="block text-xs text-muted-foreground">{tcm(`layout.${k}Hint`)}</span>
                    </button>
                  ))}
                </div>
              </div>
              {kind !== 'inline' && (
                <div className="space-y-1.5">
                  <Label>{tcm('add.fieldName')}</Label>
                  <Input value={fieldName} onChange={(e) => setFieldName(e.target.value)} />
                  {fieldName.trim() && <p className="text-xs text-muted-foreground">{tcm('add.fieldKey')} <code className="rounded bg-muted px-1 py-0.5 font-mono">{toFieldKey(fieldName)}</code></p>}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{tcm('cancel')}</Button>
            <Button type="button" onClick={add} disabled={!ready}>{tcm('add.confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const componentHref = (component: string) => `/components?edit=${encodeURIComponent(component)}`;

/**
 * The fields of an inline component, shown once at the first field of the
 * run as a read-only block (nothing for the rest of the run).
 */
export function InlineComponentBlock({ fields, index, onRemove, removeDisabled, dragHandle, duplicates }: {
  fields: Array<{ component?: string; inline?: InlineComponentField }>;
  index: number;
  onRemove: () => void;
  removeDisabled?: boolean;
  dragHandle?: ReactNode;
  /** Keys used by more than one field in the content type — the run's clashes are listed. */
  duplicates?: Set<string>;
}) {
  const tcm = useTranslations('components');
  const component = fields[index]?.component;
  if (!component || continuesInlineRun(fields, index)) return null;
  const [s, e] = runAt(fields, index);
  const run = fields.slice(s, e).map((f) => f.inline).filter((f): f is InlineComponentField => !!f);
  const clashes = run.map((f) => f.name).filter((n) => duplicates?.has(n));
  return (
    <div className="rounded-md border border-emerald-400/50 bg-emerald-500/5 p-4 space-y-2">
      <div className="flex items-center gap-2">
        {dragHandle}
        <Blocks className="h-4 w-4 text-emerald-500 shrink-0" />
        <p className="flex-1 text-sm font-medium">
          {tcm('inline.from')} <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{component}</code>
        </p>
        <Link href={componentHref(component)} className="text-xs text-primary underline">{tcm('inline.open')}</Link>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
          disabled={removeDisabled}
          onClick={onRemove}
          title={tcm('inline.remove')}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="space-y-1">
        <ReadOnlyFields fields={run} />
      </div>
      <p className="text-xs text-muted-foreground">{tcm('inline.note')}</p>
      {clashes.length > 0 && <p className="text-xs text-destructive">{tcm('inline.keysTaken', { keys: clashes.join(', ') })}</p>}
    </div>
  );
}

/** A component's fields, read-only; repeaters, groups and layouts inside it are listed indented. */
function ReadOnlyFields({ fields }: { fields: ComponentField[] }) {
  const tft = useTranslations('contentTypes');
  return (
    <div className="space-y-1">
      {fields.map((f) => (
        <div key={f.name} className="space-y-1">
          <div className="flex items-center gap-2 rounded border bg-background/60 px-2 py-1 text-sm">
            <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="flex-1 truncate">{f.label || f.name}</span>
            <code className="text-xs text-muted-foreground font-mono">{f.name}</code>
            <span className="text-xs text-muted-foreground w-24 text-right">{tft(`fieldTypes.${f.type}`)}</span>
          </div>
          {Array.isArray(f.options?.subFields) && (
            <div className="pl-5"><ReadOnlyFields fields={f.options.subFields} /></div>
          )}
          {Array.isArray(f.options?.layouts) && f.options.layouts.map((l: any) => (
            <div key={l.name} className="pl-5 space-y-1">
              <p className="text-xs text-muted-foreground font-mono">{l.label || l.name}</p>
              <ReadOnlyFields fields={l.fields ?? []} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Read-only sub-fields of a group/repeater field (or flexible layout) that uses a component. */
export function ComponentSubFields({ component, subFields, className = 'pl-7' }: { component: string; subFields: ComponentField[]; className?: string }) {
  const tcm = useTranslations('components');
  return (
    <div className={className}>
      <div className="border-l-2 border-emerald-400 pl-3 space-y-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Blocks className="h-3.5 w-3.5" />
          {tcm('readOnly.usesComponent')} <code className="rounded bg-muted px-1 py-0.5 font-mono">{component}</code>
        </p>
        <ReadOnlyFields fields={subFields} />
        <p className="text-xs text-muted-foreground">
          {tcm.rich('readOnly.note', {
            link: (chunks) => (
              <Link href={componentHref(component)} className="text-primary underline">{chunks}</Link>
            ),
          })}
        </p>
      </div>
    </div>
  );
}

/**
 * The "Components" section of the content type editors: every field that comes
 * from a component, one card each, with "Add component". Display only — the
 * fields are saved as ordinary top-level fields under their own keys.
 */
export function ComponentsSection({ count, addButton, children }: { count: number; addButton: ReactNode; children: ReactNode }) {
  const tcm = useTranslations('components');
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Label>{tcm('section.title')}</Label>
          <p className="text-xs text-muted-foreground mt-1">{tcm('section.hint')}</p>
        </div>
        {addButton}
      </div>
      {count === 0
        ? <p className="rounded-md border border-dashed px-4 py-3 text-xs text-muted-foreground">{tcm('section.empty')}</p>
        : <div className="space-y-3">{children}</div>}
    </div>
  );
}

/**
 * A group (one) or repeater (many) field using a component, in the Components
 * section: its name (the JSON key) and Required are editable, the component's
 * fields are shown read-only and folded away until opened.
 */
export function ComponentFieldCard({ field, duplicate, onName, onRequired, onRemove, removeDisabled, dragHandle }: {
  field: { name: string; type: string; required?: boolean; options?: { component?: string; subFields?: ComponentField[] } };
  /** Another field already uses this field's key. */
  duplicate?: boolean;
  onName: (name: string) => void;
  onRequired: (required: boolean) => void;
  onRemove: () => void;
  removeDisabled?: boolean;
  dragHandle?: ReactNode;
}) {
  const tcm = useTranslations('components');
  const [open, setOpen] = useState(false);
  const component = field.options?.component ?? '';
  const key = toFieldKey(field.name);
  return (
    <div className="rounded-md border border-emerald-400/50 bg-emerald-500/5 p-4 space-y-2">
      <div className="flex items-start gap-2">
        {dragHandle && <div className="pt-2.5">{dragHandle}</div>}
        <Button type="button" variant="ghost" size="icon-sm" className="mt-1 shrink-0" onClick={() => setOpen((o) => !o)} title={tcm('card.toggle')}>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
        <div className="flex-1 space-y-1">
          <Input value={field.name} onChange={(e) => onName(e.target.value)} aria-invalid={duplicate} placeholder={tcm('add.fieldName')} />
          {duplicate
            ? <p className="text-xs text-destructive px-0.5">{tcm('card.duplicate', { key })}</p>
            : key && <p className="text-xs text-muted-foreground px-0.5">{tcm('add.fieldKey')} <code className="rounded bg-muted px-1 py-0.5 font-mono">{key}</code></p>}
        </div>
        <span className="mt-2 inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
          <Blocks className="h-3 w-3" /> {component} · {tcm(field.type === 'repeater' ? 'add.repeater' : 'add.group')}
        </span>
        <label className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap cursor-pointer select-none">
          <Checkbox checked={!!field.required} onCheckedChange={(c) => onRequired(c === true)} />
          {tcm('card.required')}
        </label>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="mt-1 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
          disabled={removeDisabled}
          onClick={onRemove}
          title={tcm('card.remove')}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      {open && <ComponentSubFields component={component} subFields={field.options?.subFields ?? []} className="pl-9" />}
    </div>
  );
}
