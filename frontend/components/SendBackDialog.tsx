'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

/**
 * Asks for an optional note when a reviewer sends an entry in Pending Review
 * back to Draft (from the entries list or the editor's review banner). The
 * caller saves the note as a change request, then changes the status.
 */
export function SendBackDialog({ slug, open, onOpenChange, onConfirm }: {
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The trimmed note, or '' for none. */
  onConfirm: (note: string) => void;
}) {
  const t = useTranslations('entries');
  const tc = useTranslations('common');
  const [note, setNote] = useState('');
  useEffect(() => { if (open) setNote(''); }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('sendBack.title', { slug })}</DialogTitle>
          <DialogDescription>{t('sendBack.description')}</DialogDescription>
        </DialogHeader>
        <Textarea
          autoFocus
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('sendBack.placeholder')}
          aria-label={t('sendBack.noteLabel')}
          className="min-h-24"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tc('cancel')}</Button>
          <Button onClick={() => { onOpenChange(false); onConfirm(note.trim()); }}>
            {note.trim() ? t('sendBack.withNote') : t('sendBack.withoutNote')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
