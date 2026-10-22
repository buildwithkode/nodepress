'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Blocks, Lock, Trash2 } from 'lucide-react';
import { useTranslations } from 'use-intl';
import api from '@/lib/axios';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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

/** A flexible layout whose fields come from a component. */
export interface ComponentLayoutDraft { name: string; label: string; component: string; fields: ComponentField[] }

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
 */
export function AddComponentButton({ onAdd, onAddInline, disabled }: {
  onAdd: (field: ComponentFieldDraft) => void;
  onAddInline: (fields: InlineComponentField[]) => void;
  disabled?: boolean;
}) {
  const tcm = useTranslations('components');
  const [open, setOpen] = useState(false);
  const components = useComponentList(open);
  const [selected, setSelected] = useState('');
  const [kind, setKind] = useState<'group' | 'repeater' | 'inline'>('group');
  const [fieldName, setFieldName] = useState('');

  const component = components?.find((c) => c.name === selected);

  const pick = (name: string) => {
    setSelected(name);
    const c = components?.find((x) => x.name === name);
    setFieldName(c?.displayName || c?.name || '');
  };

  const add = () => {
    if (!component) return;
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
                <p className="text-xs text-muted-foreground">{tcm('add.inlineNote')}</p>
              ) : (
                <div className="space-y-1.5">
                  <Label>{tcm('add.fieldName')}</Label>
                  <Input value={fieldName} onChange={(e) => setFieldName(e.target.value)} />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{tcm('cancel')}</Button>
            <Button type="button" onClick={add} disabled={!component || (kind !== 'inline' && !fieldName.trim())}>{tcm('add.confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** "Add layout from component" for a flexible field's layouts. */
export function AddComponentLayoutButton({ onAdd, disabled }: { onAdd: (layout: ComponentLayoutDraft) => void; disabled?: boolean }) {
  const tcm = useTranslations('components');
  const [open, setOpen] = useState(false);
  const components = useComponentList(open);
  const [selected, setSelected] = useState('');
  const component = components?.find((c) => c.name === selected);

  const add = () => {
    if (!component) return;
    onAdd({
      name: component.name,
      label: component.displayName || component.name,
      component: component.name,
      fields: component.fields.map((f) => ({ ...f })),
    });
    setOpen(false);
    setSelected('');
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
            <ComponentPicker components={components} value={selected} onChange={setSelected} />
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{tcm('cancel')}</Button>
            <Button type="button" onClick={add} disabled={!component}>{tcm('add.confirm')}</Button>
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
export function InlineComponentBlock({ fields, index, onRemove, removeDisabled, dragHandle }: {
  fields: Array<{ component?: string; inline?: InlineComponentField }>;
  index: number;
  onRemove: () => void;
  removeDisabled?: boolean;
  dragHandle?: ReactNode;
}) {
  const tcm = useTranslations('components');
  const tft = useTranslations('contentTypes');
  const component = fields[index]?.component;
  if (!component || continuesInlineRun(fields, index)) return null;
  const [s, e] = runAt(fields, index);
  const run = fields.slice(s, e).map((f) => f.inline).filter((f): f is InlineComponentField => !!f);
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
        {run.map((f) => (
          <div key={f.name} className="flex items-center gap-2 rounded border bg-background/60 px-2 py-1 text-sm">
            <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="flex-1 truncate">{f.label || f.name}</span>
            <code className="text-xs text-muted-foreground font-mono">{f.name}</code>
            <span className="text-xs text-muted-foreground w-24 text-right">{tft(`fieldTypes.${f.type}`)}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{tcm('inline.note')}</p>
    </div>
  );
}

/** Read-only sub-fields of a group/repeater field (or flexible layout) that uses a component. */
export function ComponentSubFields({ component, subFields, className = 'pl-7' }: { component: string; subFields: ComponentField[]; className?: string }) {
  const tcm = useTranslations('components');
  const tft = useTranslations('contentTypes');
  return (
    <div className={className}>
      <div className="border-l-2 border-emerald-400 pl-3 space-y-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Blocks className="h-3.5 w-3.5" />
          {tcm('readOnly.usesComponent')} <code className="rounded bg-muted px-1 py-0.5 font-mono">{component}</code>
        </p>
        <div className="space-y-1">
          {subFields.map((sf) => (
            <div key={sf.name} className="flex items-center gap-2 rounded border bg-background/60 px-2 py-1 text-sm">
              <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="flex-1 truncate">{sf.label || sf.name}</span>
              <code className="text-xs text-muted-foreground font-mono">{sf.name}</code>
              <span className="text-xs text-muted-foreground w-24 text-right">{tft(`fieldTypes.${sf.type}`)}</span>
            </div>
          ))}
        </div>
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
