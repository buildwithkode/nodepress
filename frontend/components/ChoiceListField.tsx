'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ExternalLink, ListChecks } from 'lucide-react';
import { useTranslations } from 'use-intl';
import api from '@/lib/axios';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface ChoiceListRow {
  id: number;
  name: string;
  label: string;
  description?: string | null;
  choices: { value: string; label?: string }[];
}

// One request per page load, shared by every select field editor on the page.
let cached: Promise<ChoiceListRow[]> | null = null;
const fetchLists = () => {
  cached ??= api.get('/choice-lists').then((r) => r.data as ChoiceListRow[]).catch(() => { cached = null; return []; });
  return cached;
};
/** Forget the cached lists (after the choice lists page changes them). */
export const invalidateChoiceLists = () => { cached = null; };

export function useChoiceLists() {
  const [lists, setLists] = useState<ChoiceListRow[] | null>(null);
  useEffect(() => {
    let live = true;
    fetchLists().then((l) => { if (live) setLists(l); });
    return () => { live = false; };
  }, []);
  return lists;
}

/** Select options that use `list` (the editor keeps choices as text; the server refills them on save). */
function withList(options: any, list: ChoiceListRow, asText: boolean) {
  const values = list.choices.map((c) => c.value);
  const labels = Object.fromEntries(list.choices.filter((c) => c.label && c.label !== c.value).map((c) => [c.value, c.label!]));
  const { choiceLabels: _old, ...rest } = options ?? {};
  return {
    ...rest,
    choiceList: list.name,
    choices: asText ? values.join(', ') : values,
    ...(Object.keys(labels).length ? { choiceLabels: labels } : {}),
  };
}

function ListPreview({ list }: { list: ChoiceListRow }) {
  const t = useTranslations('choiceLists');
  const shown = list.choices.slice(0, 40);
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2 space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {shown.map((c) => (
          <span key={c.value} className="rounded border bg-background px-1.5 py-0.5 text-xs">
            {c.label ?? c.value}
            {c.label && c.label !== c.value && <code className="ml-1 text-[10px] text-muted-foreground">{c.value}</code>}
          </span>
        ))}
        {list.choices.length > shown.length && (
          <span className="px-1.5 py-0.5 text-xs text-muted-foreground">{t('picker.more', { count: list.choices.length - shown.length })}</span>
        )}
      </div>
      <Link href={`/choice-lists?edit=${encodeURIComponent(list.name)}`} target="_blank" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
        {t('picker.editList')} <ExternalLink className="h-3 w-3" />
      </Link>
    </div>
  );
}

/**
 * Where a top-level select field's choices come from: typed in (`children`,
 * the page's own textarea) or a shared choice list — a picker plus a
 * read-only preview of the list.
 */
export function SelectChoicesSource({
  options, onChange, children, className,
}: { options: any; onChange: (options: any) => void; children: ReactNode; className?: string }) {
  const t = useTranslations('choiceLists');
  const lists = useChoiceLists();
  const [useList, setUseList] = useState<boolean>(!!options?.choiceList);
  useEffect(() => { if (options?.choiceList) setUseList(true); }, [options?.choiceList]);
  const current = lists?.find((l) => l.name === options?.choiceList);

  const typeThem = () => {
    setUseList(false);
    if (!options?.choiceList) return;
    const { choiceList: _l, choiceLabels: _c, ...rest } = options;
    onChange(rest); // keeps the list's values as the starting point
  };

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="inline-flex rounded-md border p-0.5 text-xs" role="radiogroup" aria-label={t('picker.source')}>
        {[
          { on: !useList, label: t('picker.typeThem'), click: typeThem },
          { on: useList, label: t('picker.useList'), click: () => setUseList(true) },
        ].map((b) => (
          <button
            key={b.label}
            type="button"
            role="radio"
            aria-checked={b.on}
            onClick={b.click}
            className={cn('rounded px-2 py-1 transition-colors', b.on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
          >
            {b.label}
          </button>
        ))}
      </div>
      {!useList ? children : (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t('picker.list')}</Label>
          {lists && lists.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t('picker.none')}{' '}
              <Link href="/choice-lists" target="_blank" className="text-primary hover:underline">{t('picker.create')}</Link>
            </p>
          ) : (
            <Select
              value={options?.choiceList ?? ''}
              onValueChange={(name) => {
                const list = lists?.find((l) => l.name === name);
                if (list) onChange(withList(options, list, true));
              }}
            >
              <SelectTrigger className="w-full sm:w-72"><SelectValue placeholder={t('picker.choose')} /></SelectTrigger>
              <SelectContent>
                {(lists ?? []).map((l) => (
                  <SelectItem key={l.name} value={l.name}>{l.label} ({l.choices.length})</SelectItem>
                ))}
                {options?.choiceList && lists && !current && (
                  <SelectItem value={options.choiceList} disabled>{options.choiceList}</SelectItem>
                )}
              </SelectContent>
            </Select>
          )}
          {current && <ListPreview list={current} />}
          {options?.choiceList && lists && !current && (
            <p className="text-xs text-destructive">{t('picker.missing', { name: options.choiceList })}</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Compact list picker for a select sub-field (repeater, group or flexible
 * layout), whose row has no room for a choices editor: the sub-field takes
 * its choices from the picked list.
 */
export function SubFieldChoiceList({ options, onChange }: { options: any; onChange: (options: any) => void }) {
  const t = useTranslations('choiceLists');
  const lists = useChoiceLists();
  const value = options?.choiceList ?? '';
  const typed = !value && Array.isArray(options?.choices) && options.choices.length > 0;
  return (
    <Select
      value={value}
      onValueChange={(name) => {
        const list = lists?.find((l) => l.name === name);
        if (list) onChange(withList(options, list, false));
      }}
    >
      <SelectTrigger className="w-40" title={t('picker.subFieldHint')}>
        <ListChecks className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <SelectValue placeholder={typed ? t('picker.typedChoices', { count: options.choices.length }) : t('picker.choose')} />
      </SelectTrigger>
      <SelectContent>
        {(lists ?? []).map((l) => (
          <SelectItem key={l.name} value={l.name}>{l.label}</SelectItem>
        ))}
        {value && lists && !lists.some((l) => l.name === value) && (
          <SelectItem value={value} disabled>{value}</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
