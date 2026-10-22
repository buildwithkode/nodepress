'use client';

import { Controller } from 'react-hook-form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

/** A select field's options as the API stores them (choices may still be editor text). */
export interface ChoiceOptions {
  choices?: string[] | string;
  /** value → label, only where they differ (filled in from a choice list) */
  choiceLabels?: Record<string, string>;
  multiple?: boolean;
  choiceList?: string;
}

/** The values a select offers. */
export function choiceValues(options?: ChoiceOptions): string[] {
  const raw = options?.choices ?? [];
  return (Array.isArray(raw) ? raw : String(raw).split(','))
    .map((c) => String(c).trim())
    .filter(Boolean);
}

/** What the admin shows for a stored value: its list label, else the value. */
export function choiceLabel(options: ChoiceOptions | undefined, value: string): string {
  return options?.choiceLabels?.[value] ?? value;
}

interface Props {
  control: any;
  /** react-hook-form path of the value */
  name: string;
  options?: ChoiceOptions;
  placeholder?: string;
  invalid?: boolean;
}

/**
 * The entry editor's select input — top-level fields and the sub-fields of
 * repeaters, groups and flexible layouts. Shows `choiceLabels[value] ?? value`
 * and stores the value; `multiple` selects store an array (checkbox list).
 */
export function ChoiceSelect({ control, name, options, placeholder, invalid }: Props) {
  const values = choiceValues(options);
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: f }) => {
        if (options?.multiple) {
          const selected: string[] = Array.isArray(f.value) ? f.value : f.value ? [String(f.value)] : [];
          const toggle = (v: string, on: boolean) =>
            f.onChange(on ? values.filter((x) => x === v || selected.includes(x)) : selected.filter((x) => x !== v));
          return (
            <div className={cn('flex flex-wrap gap-x-4 gap-y-2 rounded-md border border-input px-3 py-2', invalid && 'border-destructive')}>
              {values.map((v) => (
                <label key={v} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={selected.includes(v)} onCheckedChange={(on) => toggle(v, !!on)} />
                  {choiceLabel(options, v)}
                </label>
              ))}
              {/* Values no longer offered (removed from the list) stay visible so they can be unticked. */}
              {selected.filter((v) => !values.includes(v)).map((v) => (
                <label key={v} className="flex cursor-pointer items-center gap-2 text-sm text-destructive line-through">
                  <Checkbox checked onCheckedChange={() => toggle(v, false)} />
                  {v}
                </label>
              ))}
            </div>
          );
        }
        const current = typeof f.value === 'string' ? f.value : '';
        const stale = current && !values.includes(current);
        return (
          <Select value={current} onValueChange={f.onChange}>
            <SelectTrigger className={cn('w-full', invalid && 'border-destructive focus:ring-destructive')}>
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {stale && (
                <SelectItem value={current} disabled>
                  {current}
                </SelectItem>
              )}
              {values.map((v) => (
                <SelectItem key={v} value={v}>
                  {choiceLabel(options, v)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }}
    />
  );
}
