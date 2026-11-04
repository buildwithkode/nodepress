'use client';

import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';

/** Sent to a row's element (`data-np-row`) to open it: see focusEntryField in LivePreviewPane. */
export const OPEN_ROW_EVENT = 'nodepress:open-row';

/**
 * Which rows of a list that folds are open. They start closed (or open, with `initiallyOpen`), and a
 * row the editor has just added starts open (and `isNew`): call `markAdding()` in the same event that adds it.
 */
export function useOpenRows(ids: string[], initiallyOpen = false) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(initiallyOpen ? ids : []));
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set(ids));
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<ReadonlySet<string>>(() => new Set());

  const fresh = ids.filter((id) => !seen.has(id));
  if (fresh.length > 0) {
    setSeen(new Set(ids));
    if (adding) {
      setAdding(false);
      setOpen(new Set([...open, ...fresh]));
      setAdded(new Set([...added, ...fresh]));
    }
  }

  return {
    isOpen: (id: string) => open.has(id) || (adding && fresh.includes(id)),
    setRowOpen: (id: string, value: boolean) => setOpen((current) => {
      const next = new Set(current);
      if (value) next.add(id); else next.delete(id);
      return next;
    }),
    setAllOpen: (value: boolean) => setOpen(new Set(value ? ids : [])),
    markAdding: () => setAdding(true),
    /** Added by the editor (via `markAdding`) rather than loaded: such a row slides in. */
    isNew: (id: string) => added.has(id) || (adding && fresh.includes(id)),
  };
}

/** Expand all / Collapse all, for a list of two or more rows. */
export function ExpandCollapseAll({ count, onChange }: { count: number; onChange: (open: boolean) => void }) {
  const t = useTranslations('entryEditor');
  if (count < 2) return null;
  return (
    <div className="flex justify-end gap-1">
      <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground" onClick={() => onChange(true)}>
        {t('rows.expandAll')}
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground" onClick={() => onChange(false)}>
        {t('rows.collapseAll')}
      </Button>
    </div>
  );
}
