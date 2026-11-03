'use client';

import { useTranslations } from 'use-intl';
import { cn } from '@/lib/utils';

/** Mirrors FIELD_WIDTHS in backend/src/fields/field.types.ts. A field without a width is full. */
export type FieldWidth = 'full' | 'two_thirds' | 'half' | 'third';

/** The entry form's rows: six columns, so halves and thirds both fit. */
export const FIELD_GRID = 'grid grid-cols-6 items-start gap-x-4';

/** The cell of one field in FIELD_GRID. Stacks on small screens; empty (a hidden conditional field) takes no space. */
export const fieldCell = (width?: string) => cn(
  'col-span-6 min-w-0 empty:hidden',
  width === 'two_thirds' && 'md:col-span-4',
  width === 'half' && 'md:col-span-3',
  width === 'third' && 'md:col-span-2',
);

/** Picks how much of a row a field takes in the entry form. Saved only when it isn't full. */
export function FieldWidthSelect({ value, onChange }: { value?: string; onChange: (width: FieldWidth | undefined) => void }) {
  const t = useTranslations('contentTypes');
  const options: { value: FieldWidth; label: string }[] = [
    { value: 'full', label: t('editor.widthFull') },
    { value: 'two_thirds', label: '2/3' },
    { value: 'half', label: '1/2' },
    { value: 'third', label: '1/3' },
  ];
  const current = value || 'full';
  return (
    <div role="group" aria-label={t('editor.widthHint')} title={t('editor.widthHint')} className="inline-flex h-8 shrink-0 rounded-lg border border-input p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={current === o.value}
          onClick={() => onChange(o.value === 'full' ? undefined : o.value)}
          className={cn(
            'rounded-md px-2 text-xs whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            current === o.value ? 'bg-primary font-medium text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
