'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import { ArrowRight, DatabaseZap } from 'lucide-react';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export interface FieldMigrations {
  renames?: { from: string; to: string }[];
  convert?: string[];
  drop?: string[];
}

interface Step { kind: 'rename' | 'convert' | 'drop'; field: string; from?: string; fromType?: string; toType?: string; entries: number; lost: number }
interface Retyped { field: string; fromType: string; toType: string; convertible: boolean }
export interface SchemaImpact { entryCount: number; steps: Step[]; retyped: Retyped[]; removedNested?: string[] }

/**
 * Field keys renamed and removed between the saved schema and the edited one.
 * `original` maps each edited field to the key it was loaded with.
 */
export function detectFieldChanges(saved: string[], edited: { key: string; original?: string }[]) {
  const keys = new Set(edited.map((f) => f.key));
  const renames = edited
    .filter((f) => f.original && f.original !== f.key && !keys.has(f.original) && !saved.includes(f.key))
    .map((f) => ({ from: f.original!, to: f.key }));
  const renamed = new Set(renames.map((r) => r.from));
  const removed = saved.filter((k) => !keys.has(k) && !renamed.has(k));
  return { renames, removed };
}

/**
 * Asks the server what a schema change does to existing entries and, when it
 * touches any, which data to migrate. Resolves with the fieldMigrations to save
 * with, or null when cancelled.
 */
export function useSchemaChangeCheck(contentTypeId: string | number) {
  const [state, setState] = useState<{ impact: SchemaImpact; renames: FieldMigrations['renames']; resolve: (m: FieldMigrations | null) => void } | null>(null);

  const check = async (schema: unknown[], renames: NonNullable<FieldMigrations['renames']>, removed: string[]): Promise<FieldMigrations | null> => {
    const first = (await api.post(`/content-types/${contentTypeId}/schema-impact`, { schema, fieldMigrations: { renames } })).data as SchemaImpact;
    // The server also finds fields removed from inside groups, repeaters and layouts.
    const drop = [...removed, ...(first.removedNested ?? [])];
    if (first.entryCount === 0 || (!first.retyped.length && !drop.length && !renames.length)) return { renames };
    const convert = first.retyped.filter((r) => r.convertible).map((r) => r.field);
    const impact = (await api.post(`/content-types/${contentTypeId}/schema-impact`, {
      schema, fieldMigrations: { renames, convert, drop },
    })).data as SchemaImpact;
    return new Promise((resolve) => setState({ impact, renames, resolve }));
  };

  const dialog = state && (
    <SchemaChangeDialog
      impact={state.impact}
      onClose={(m) => { state.resolve(m ? { ...m, renames: state.renames } : null); setState(null); }}
    />
  );
  return { check, dialog };
}

function SchemaChangeDialog({ impact, onClose }: { impact: SchemaImpact; onClose: (m: FieldMigrations | null) => void }) {
  const tct = useTranslations('contentTypes');
  const converts = impact.steps.filter((s) => s.kind === 'convert');
  const drops = impact.steps.filter((s) => s.kind === 'drop' && s.entries > 0);
  const renames = impact.steps.filter((s) => s.kind === 'rename');
  const notConvertible = impact.retyped.filter((r) => !r.convertible);
  // Converting is what the editor almost always wants; deleting stored data never is the default.
  const [convert, setConvert] = useState<Set<string>>(new Set(converts.map((s) => s.field)));
  const [drop, setDrop] = useState<Set<string>>(new Set());
  useEffect(() => setConvert(new Set(converts.map((s) => s.field))), [impact]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (set: Set<string>, update: (s: Set<string>) => void, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key); else next.add(key);
    update(next);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose(null)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><DatabaseZap className="h-4 w-4" />{tct('migration.title')}</DialogTitle>
          <DialogDescription>{tct('migration.description', { count: impact.entryCount })}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {renames.length > 0 && (
            <section className="space-y-1.5">
              <h4 className="font-medium">{tct('migration.renames')}</h4>
              {renames.map((s) => (
                <p key={s.field} className="flex items-center gap-1.5 text-muted-foreground">
                  <code className="font-mono text-xs">{s.from}</code><ArrowRight className="h-3 w-3" /><code className="font-mono text-xs">{s.field}</code>
                  <span className="ml-auto text-xs">{tct('migration.entries', { count: s.entries })}</span>
                </p>
              ))}
            </section>
          )}

          {(converts.length > 0 || notConvertible.length > 0) && (
            <section className="space-y-1.5">
              <h4 className="font-medium">{tct('migration.converts')}</h4>
              {converts.map((s) => (
                <label key={s.field} className="flex items-start gap-2 cursor-pointer">
                  <Checkbox className="mt-0.5" checked={convert.has(s.field)} onCheckedChange={() => toggle(convert, setConvert, s.field)} />
                  <span className="flex-1">
                    <code className="font-mono text-xs">{s.field}</code>{' '}
                    <span className="text-muted-foreground">{tct('migration.convertTo', { from: s.fromType ?? '', to: s.toType ?? '' })}</span>
                    <span className="block text-xs text-muted-foreground">
                      {tct('migration.entries', { count: s.entries })}
                      {s.lost > 0 && <span className="text-destructive"> · {tct('migration.lost', { count: s.lost })}</span>}
                    </span>
                  </span>
                </label>
              ))}
              {notConvertible.map((r) => (
                <p key={r.field} className="text-xs text-amber-600 dark:text-amber-400">
                  {tct('migration.notConvertible', { field: r.field, from: r.fromType, to: r.toType })}
                </p>
              ))}
            </section>
          )}

          {drops.length > 0 && (
            <section className="space-y-1.5">
              <h4 className="font-medium">{tct('migration.removed')}</h4>
              <p className="text-xs text-muted-foreground">{tct('migration.removedHint')}</p>
              {drops.map((s) => (
                <label key={s.field} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={drop.has(s.field)} onCheckedChange={() => toggle(drop, setDrop, s.field)} />
                  <span className="flex-1">{tct('migration.deleteValues', { field: s.field })}</span>
                  <span className="text-xs text-muted-foreground">{tct('migration.entries', { count: s.entries })}</span>
                </label>
              ))}
            </section>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(null)}>{tct('migration.cancel')}</Button>
          <Button onClick={() => onClose({ convert: [...convert], drop: [...drop] })}>{tct('migration.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
