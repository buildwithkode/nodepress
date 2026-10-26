'use client';

import { Fragment, useState, type ReactNode } from 'react';
import { Blocks, ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslations } from 'use-intl';

interface SchemaField { name: string; label?: string; type: string; component?: string; options?: any }

type Part =
  | { field: SchemaField }
  | { key: string; title: string; component: string; kind?: string; fields: SchemaField[]; bare: boolean };

const toLabel = (name: string) => name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** A group/repeater using a component is one box; a run of inline fields from the same component is another. */
function split(schema: SchemaField[]): { fields: SchemaField[]; components: Exclude<Part, { field: SchemaField }>[] } {
  const fields: SchemaField[] = [];
  const components: Exclude<Part, { field: SchemaField }>[] = [];
  schema.forEach((f, i) => {
    if ((f.type === 'group' || f.type === 'repeater') && f.options?.component) {
      components.push({ key: f.name, title: f.label?.trim() || toLabel(f.name), component: f.options.component, kind: f.type, fields: [f], bare: true });
    } else if (f.component) {
      const last = components[components.length - 1];
      if (i > 0 && schema[i - 1].component === f.component && last && !last.bare) last.fields.push(f);
      else components.push({ key: `inline:${f.name}`, title: toLabel(f.component), component: f.component, fields: [f], bare: false });
    } else {
      fields.push(f);
    }
  });
  return { fields, components };
}

/**
 * The entry form's top-level fields, with the fields that come from components
 * collected under a "Components" heading — one collapsible box per component.
 * Display only: every value keeps its own top-level path in the entry data.
 */
export function SchemaFormFields({ schema, renderField }: {
  schema: SchemaField[];
  /** Renders one top-level field; `bare` leaves out a group's/repeater's own label row. */
  renderField: (field: SchemaField, bare: boolean) => ReactNode;
}) {
  const t = useTranslations('entryEditor');
  const { fields, components } = split(schema);
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  return (
    <>
      {fields.map((f) => <Fragment key={f.name}>{renderField(f, false)}</Fragment>)}
      {components.length > 0 && (
        <div className="mt-6 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Blocks className="h-4 w-4 text-emerald-500" /> {t('form.components')}
          </div>
          {components.map((c) => {
            const open = !closed[c.key];
            return (
              <div key={c.key} className="rounded-md border border-emerald-400/40 bg-emerald-500/5">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left"
                  onClick={() => setClosed((p) => ({ ...p, [c.key]: open }))}
                  aria-expanded={open}
                >
                  {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                  <span className="flex-1 text-sm font-medium">{c.title}</span>
                  <code className="text-[11px] text-muted-foreground font-mono">{c.component}</code>
                  {c.kind === 'repeater' && (
                    <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[11px] font-medium text-orange-600">repeater</span>
                  )}
                </button>
                {/* Kept mounted while folded so React Hook Form still validates and submits the fields. */}
                <div className={open ? 'border-t border-emerald-400/30 px-3 pt-4' : 'hidden'}>
                  {c.fields.map((f) => <Fragment key={f.name}>{renderField(f, c.bare)}</Fragment>)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
