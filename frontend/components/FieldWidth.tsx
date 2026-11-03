'use client';

import { useTranslations } from 'use-intl';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

/** Mirrors FIELD_WIDTHS in backend/src/fields/field.types.ts. A field without a width is full. */
export type FieldWidth = 'full' | 'half' | 'third';

/** The entry form's rows: six columns, so both halves and thirds fit. */
export const FIELD_GRID = 'grid grid-cols-6 items-start gap-x-4';

/** The cell of one field in FIELD_GRID. Stacks on small screens; empty (a hidden conditional field) takes no space. */
export const fieldCell = (width?: string) => cn(
  'col-span-6 min-w-0 empty:hidden',
  width === 'half' && 'md:col-span-3',
  width === 'third' && 'md:col-span-2',
);

/** Picks how much of a row a field takes in the entry form. Saved only when it isn't full. */
export function FieldWidthSelect({ value, onChange }: { value?: string; onChange: (width: FieldWidth | undefined) => void }) {
  const t = useTranslations('contentTypes');
  return (
    <Select value={value || 'full'} onValueChange={(v) => onChange(v === 'full' ? undefined : (v as FieldWidth))}>
      <SelectTrigger className="w-24 shrink-0" title={t('editor.widthHint')} aria-label={t('editor.widthHint')}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="full">{t('editor.widthFull')}</SelectItem>
        <SelectItem value="half">1/2</SelectItem>
        <SelectItem value="third">1/3</SelectItem>
      </SelectContent>
    </Select>
  );
}
