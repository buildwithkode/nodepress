'use client';

import type { ReactNode } from 'react';
import { ChevronDown, Trash2 } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';
import { FoldPanel } from '@/components/FoldPanel';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dragHandle?: ReactNode;
  number: number;
  name: string;
  fieldKey: string;
  type: string;
  required?: boolean;
  /** Another field uses this key. A closed row shows it in red, because Save stays disabled until it's fixed. */
  duplicate?: boolean;
  removeDisabled?: boolean;
  onRemove: () => void;
  children: ReactNode;
}

/**
 * One field of a content type, folding down to its name, key and type. The controls stay mounted
 * when closed (only hidden), so a nested editor keeps its open layouts and row ids.
 */
export function FieldCardRow({ open, onOpenChange, dragHandle, number, name, fieldKey, type, required, duplicate, removeDisabled, onRemove, children }: Props) {
  const t = useTranslations('contentTypes');
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="flex items-center gap-2">
        {dragHandle}
        <button
          type="button"
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="w-5 shrink-0 text-right text-sm font-semibold text-foreground select-none">{number}</span>
          <span className={cn('min-w-0 truncate text-sm font-medium', !name.trim() && 'text-muted-foreground')}>
            {name.trim() || t('editor.fieldNamePlaceholder')}
          </span>
          {required && <span className="text-destructive" title={t('editor.required')}>*</span>}
          {fieldKey && (
            <code className={cn('hidden shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-xs sm:inline', duplicate ? 'text-destructive' : 'text-muted-foreground')}>
              {fieldKey}
            </code>
          )}
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">{t(`fieldTypes.${type}`)}</span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
          disabled={removeDisabled}
          onClick={onRemove}
          title={t('editor.deleteField')}
          aria-label={t('editor.deleteField')}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <FoldPanel open={open} className="space-y-3 pt-3">{children}</FoldPanel>
    </div>
  );
}
