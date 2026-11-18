'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { get, useFormState } from 'react-hook-form';
import { ChevronDown, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OPEN_ROW_EVENT } from '@/components/OpenRows';
import { FoldPanel, FOLD_MS } from '@/components/FoldPanel';
import { AnimatedRow } from '@/components/AnimatedRow';
import { cn } from '@/lib/utils';

/** The value shown on a closed row: its title-like text field, or else its first text field. */
export function rowPreview(fields: { name: string; type: string }[] | undefined, row: any): string {
  const texts = (fields ?? []).filter((f) => {
    const v = row?.[f.name];
    return (f.type === 'text' || f.type === 'textarea') && typeof v === 'string' && v.trim();
  });
  const best = texts.find((f) => /title|heading|name|label/i.test(f.name)) ?? texts[0];
  return best ? String(row[best.name]).trim() : '';
}

interface Props {
  /** Form path of the row: `sections.0`, `sections.0.details.1`. */
  path: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  control: any;
  errors: any;
  /** Left border colour. */
  className?: string;
  dragHandle?: ReactNode;
  title: ReactNode;
  preview?: string;
  removeLabel: string;
  onRemove: () => void;
  /** Just added by the editor: slide in. */
  appear?: boolean;
  children: ReactNode;
}

/**
 * One repeater row or flexible section, folding down to its header. A closed row's fields stay
 * mounted (only hidden), because React Hook Form skips validation of unmounted inputs, so they
 * are still validated and saved. A failed save opens the rows it failed in.
 */
export function CollapsibleRow({ path, open, onOpenChange, control, errors, className, dragHandle, title, preview, removeLabel, onRemove, appear, children }: Props) {
  const rowRef = useRef<HTMLDivElement>(null);
  const hasError = !!get(errors, path);
  const { submitCount } = useFormState({ control });

  useEffect(() => {
    if (!hasError || open) return;
    onOpenChange(true);
    // React Hook Form tried to focus the error while it was hidden, so bring the first one into view
    // once the row has slid open (rows above it may be opening too, which moves it).
    setTimeout(() => {
      const shown = [...(rowRef.current?.closest('form')?.querySelectorAll<HTMLElement>('p.text-destructive, [aria-invalid="true"]') ?? [])];
      shown.find((el) => el.offsetParent !== null && !el.closest('[inert]'))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, FOLD_MS);
    // Only when a save fails or an error appears: a row closed by hand while typing stays closed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasError, submitCount]);

  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const openRow = () => onOpenChangeRef.current(true);
    row.addEventListener(OPEN_ROW_EVENT, openRow);
    return () => row.removeEventListener(OPEN_ROW_EVENT, openRow);
  }, []);

  // The latest onRemove: a row slides out first, and its index may have changed by then.
  const onRemoveRef = useRef(onRemove);
  onRemoveRef.current = onRemove;

  return (
    <AnimatedRow appear={appear}>
    {(leave) => (
    <div ref={rowRef} data-np-row={path} className={cn('rounded-md border border-l-4 bg-muted/30 p-3', className)}>
      <div className="flex items-center gap-2">
        {dragHandle}
        <button
          type="button"
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className={cn('flex shrink-0 items-center gap-2 text-sm font-medium text-muted-foreground', hasError && 'text-destructive')}>{title}</span>
          {preview && <span className="min-w-0 truncate text-xs text-muted-foreground/80">· {preview}</span>}
          <ChevronDown className={cn('ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => leave(() => onRemoveRef.current())}
          title={removeLabel}
          aria-label={removeLabel}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <FoldPanel open={open} className="pt-3">{children}</FoldPanel>
    </div>
    )}
    </AnimatedRow>
  );
}
