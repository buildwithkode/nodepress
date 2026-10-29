'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SubFieldChoiceList } from '@/components/ChoiceListField';
import { ComponentSubFields } from '@/components/ComponentFieldControls';
import { cn } from '@/lib/utils';
import { toFieldKey } from '@/lib/field-keys';

/** Mirrors MAX_NESTING in backend/src/fields/schema.validator.ts. */
export const MAX_NESTING = 3;

const FIELD_TYPES = [
  'text', 'textarea', 'richtext', 'number', 'boolean', 'select', 'image', 'color',
  'date', 'datetime', 'json', 'relation', 'repeater', 'flexible', 'group',
];
const CONTAINERS = new Set(['repeater', 'flexible', 'group']);

export interface NestedField { name: string; type: string; options?: any; [key: string]: any }
export interface NestedLayout { name: string; label: string; fields: NestedField[]; component?: string; [key: string]: any }

const blankField = (): NestedField => ({ name: '', type: 'text' });

/** Options a field starts with when its type is picked. */
export function defaultOptionsFor(type: string): any {
  if (type === 'repeater' || type === 'group') return { subFields: [blankField()] };
  if (type === 'flexible') return { layouts: [{ name: 'section', label: 'Section', fields: [blankField()] }] };
  if (type === 'relation') return { relatedContentType: '', cardinality: 'one' };
  return undefined;
}

/** Keys used by more than one named item — the server refuses them, so the editor flags them as they happen. */
function repeatedKeys(names: string[]): Set<string> {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const key of names.map(toFieldKey).filter(Boolean)) {
    if (seen.has(key)) dupes.add(key);
    seen.add(key);
  }
  return dupes;
}

const BORDER: Record<string, string> = { repeater: 'border-orange-400', group: 'border-violet-400', flexible: 'border-pink-400' };

function TypeSelect({ value, onChange, depth }: { value: string; onChange: (v: string) => void; depth: number }) {
  const t = useTranslations('contentTypes');
  // A field `depth` containers down can itself be a container only while under the limit.
  const types = depth < MAX_NESTING ? FIELD_TYPES : FIELD_TYPES.filter((v) => !CONTAINERS.has(v));
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
      <SelectContent>
        {types.map((v) => <SelectItem key={v} value={v}>{t(`fieldTypes.${v}`)}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/**
 * The fields of a repeater or group (or of a flexible layout), any of which
 * may be a repeater, group or flexible field again — up to MAX_NESTING levels.
 * `depth` is how many containers these fields are inside.
 */
export function NestedFields({ fields, onChange, depth, kind = 'group', bordered = true }: {
  fields: NestedField[];
  onChange: (fields: NestedField[]) => void;
  depth: number;
  kind?: 'repeater' | 'group' | 'layout';
  bordered?: boolean;
}) {
  const t = useTranslations('contentTypes');
  const set = (i: number, patch: Partial<NestedField>) => onChange(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const setType = (i: number, type: string) => {
    const { options: _o, ...rest } = fields[i];
    const options = defaultOptionsFor(type);
    onChange(fields.map((f, idx) => (idx === i ? { ...rest, type, ...(options ? { options } : {}) } : f)));
  };
  const dupes = repeatedKeys(fields.map((f) => f.name));

  return (
    <div className={cn(bordered && 'border-l-2 pl-3', bordered && BORDER[kind === 'layout' ? 'flexible' : kind], 'space-y-2')}>
      {kind !== 'layout' && (
        <p className="text-xs font-medium text-muted-foreground">{kind === 'repeater' ? t('editor.subFields') : t('editor.fields')}</p>
      )}
      {fields.map((sf, i) => (
        <div key={i} className="space-y-2">
          <div className="flex items-center gap-2">
            <Input
              placeholder={kind === 'repeater' ? t('editor.subFieldPlaceholder') : t('editor.nestedFieldPlaceholder')}
              value={sf.name}
              onChange={(e) => set(i, { name: e.target.value })}
              aria-invalid={dupes.has(toFieldKey(sf.name))}
              className="flex-1"
            />
            {sf.options?.component
              ? <span className="w-32 text-xs text-muted-foreground">{t(`fieldTypes.${sf.type}`)}</span>
              : <TypeSelect value={sf.type} onChange={(v) => setType(i, v)} depth={depth} />}
            {sf.type === 'select' && <SubFieldChoiceList options={sf.options} onChange={(o) => set(i, { options: o })} />}
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
              disabled={fields.length === 1}
              onClick={() => onChange(fields.filter((_, idx) => idx !== i))}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          {dupes.has(toFieldKey(sf.name)) && (
            <p className="text-xs text-destructive px-0.5">{t('editor.duplicateKey', { key: toFieldKey(sf.name) })}</p>
          )}
          {(sf.type === 'repeater' || sf.type === 'group') && sf.options?.component && (
            <ComponentSubFields component={sf.options.component} subFields={sf.options.subFields ?? []} className="pl-4" />
          )}
          {(sf.type === 'repeater' || sf.type === 'group') && !sf.options?.component && (
            <div className="pl-4">
              <NestedFields
                kind={sf.type}
                fields={sf.options?.subFields ?? []}
                depth={depth + 1}
                onChange={(subFields) => set(i, { options: { ...sf.options, subFields } })}
              />
            </div>
          )}
          {sf.type === 'flexible' && (
            <div className="pl-4">
              <NestedLayouts
                layouts={sf.options?.layouts ?? []}
                depth={depth + 1}
                onChange={(layouts) => set(i, { options: { ...sf.options, layouts } })}
              />
            </div>
          )}
        </div>
      ))}
      <Button variant="outline" onClick={() => onChange([...fields, blankField()])}>
        <Plus className="h-4 w-4 mr-1.5" /> {kind === 'repeater' ? t('editor.addSubField') : t('editor.addField')}
      </Button>
    </div>
  );
}

/**
 * The layouts of a flexible field. `depth` is how many containers the layouts'
 * fields are inside (1 for a top-level flexible field). Component layouts are
 * shown read-only — they are edited on /components.
 */
export function NestedLayouts({ layouts, onChange, depth, actions }: {
  layouts: NestedLayout[];
  onChange: (layouts: NestedLayout[]) => void;
  depth: number;
  /** Extra buttons next to "Add layout" (e.g. add a component layout). */
  actions?: ReactNode;
}) {
  const t = useTranslations('contentTypes');
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const set = (i: number, patch: Partial<NestedLayout>) => onChange(layouts.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const dupes = repeatedKeys(layouts.map((l) => l.name));

  return (
    <div className="border-l-2 border-pink-400 pl-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{t('editor.layouts')}</p>
      {layouts.map((layout, li) => {
        const isOpen = open[li] ?? false;
        return (
          <div key={li} className="rounded border bg-background overflow-hidden">
            <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/50">
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setOpen((p) => ({ ...p, [li]: !isOpen }))} className="shrink-0 h-6 w-6">
                {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </Button>
              <Input
                placeholder={t('editor.layoutNamePlaceholder')}
                value={layout.name}
                onChange={(e) => set(li, { name: e.target.value })}
                aria-invalid={dupes.has(toFieldKey(layout.name))}
                className="w-32"
              />
              <Input
                placeholder={t('editor.layoutLabelPlaceholder')}
                value={layout.label}
                onChange={(e) => set(li, { label: e.target.value })}
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                disabled={layouts.length === 1}
                onClick={() => onChange(layouts.filter((_, idx) => idx !== li))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            {dupes.has(toFieldKey(layout.name)) && (
              <p className="px-3 py-1.5 border-t text-xs text-destructive">{t('editor.duplicateLayout', { name: toFieldKey(layout.name) })}</p>
            )}
            {isOpen && layout.component && (
              <ComponentSubFields component={layout.component} subFields={layout.fields} className="px-3 py-2 border-t" />
            )}
            {isOpen && !layout.component && (
              <div className="px-3 py-2 border-t">
                <NestedFields kind="layout" bordered={false} fields={layout.fields} depth={depth} onChange={(fields) => set(li, { fields })} />
              </div>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => onChange([...layouts, { name: '', label: '', fields: [blankField()] }])}>
          <Plus className="h-4 w-4 mr-1.5" /> {t('editor.addLayout')}
        </Button>
        {actions}
      </div>
    </div>
  );
}
