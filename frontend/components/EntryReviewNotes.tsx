'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import { toast } from 'sonner';
import { Check, ChevronDown, MessageSquare, RotateCcw, Send, Trash2 } from 'lucide-react';
import api from '@/lib/axios';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export interface EntryNote {
  id: number;
  kind: 'comment' | 'changes';
  body: string;
  createdAt: string;
  resolvedAt: string | null;
  author: { id: number; name: string | null } | null;
  resolvedBy: { id: number; name: string | null } | null;
}

const NOTE_MAX = 2000;

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * Review notes of one entry. Open change requests show as a callout at the top;
 * the full history folds below. While the entry waits in Pending Review, a
 * reviewer can send it back to Draft with a note (a change request), which
 * closes by itself when the entry goes back to review or is published.
 */
export function EntryReviewNotes({ entryId, status, canReview, onSentBack }: {
  entryId: number;
  status: string;
  /** May add and resolve notes (update or publish on the type). */
  canReview: boolean;
  /** The entry was moved back to Draft here. */
  onSentBack: () => void;
}) {
  const t = useTranslations('entries');
  const tc = useTranslations('common');
  const { user } = useAuth();
  const [notes, setNotes] = useState<EntryNote[]>([]);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get<EntryNote[]>(`/entries/${entryId}/notes`).then((r) => setNotes(r.data)).catch(() => {});
  }, [entryId]);
  // Again when the status changes: going to review or publishing resolves change requests
  useEffect(() => { load(); }, [load, status]);

  const openRequests = notes.filter((n) => n.kind === 'changes' && !n.resolvedAt);
  const inReview = status === 'pending_review';
  const name = (n: EntryNote['author']) => n?.name ?? t('notes.someone');

  const add = async (kind: 'comment' | 'changes') => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      const res = await api.post<EntryNote[]>(`/entries/${entryId}/notes`, { body, kind });
      setNotes(res.data);
      setText('');
      if (kind === 'changes' && inReview) {
        await api.put(`/entries/${entryId}`, { status: 'draft' });
        onSentBack();
        toast.success(t('notes.sentBack'));
      } else {
        toast.success(t('notes.added'));
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || tc('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  };

  const resolve = async (note: EntryNote, resolved: boolean) => {
    try {
      const res = await api.patch<EntryNote[]>(`/entries/${entryId}/notes/${note.id}`, { resolved });
      setNotes(res.data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || tc('somethingWentWrong'));
    }
  };

  const remove = async (note: EntryNote) => {
    try {
      const res = await api.delete<EntryNote[]>(`/entries/${entryId}/notes/${note.id}`);
      setNotes(res.data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || tc('somethingWentWrong'));
    }
  };

  return (
    <div className="mb-4 space-y-3">
      {openRequests.length > 0 && (
        <div role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-300">
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            {t('notes.requestedTitle', { count: openRequests.length })}
          </p>
          <ul className="space-y-2">
            {openRequests.map((n) => (
              <li key={n.id} className="flex items-start justify-between gap-3 rounded-lg bg-background/60 px-3 py-2">
                <div className="min-w-0">
                  <p className="whitespace-pre-wrap break-words text-sm">{n.body}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t('notes.byOn', { name: name(n.author), date: when(n.createdAt) })}</p>
                </div>
                {canReview && (
                  <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 gap-1 text-xs" onClick={() => resolve(n, true)}>
                    <Check className="h-3.5 w-3.5" />
                    {t('notes.markDone')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-border/80 bg-muted/20">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left"
        >
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <MessageSquare className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            {t('notes.title')}
            {notes.length > 0 && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] normal-case tracking-normal">{notes.length}</span>}
            {inReview && canReview && (
              <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-blue-500">
                {t('notes.waitingReview')}
              </span>
            )}
          </span>
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden="true" />
        </button>

        {open && (
          <div className="space-y-3 border-t border-border/60 px-3.5 py-3">
            {notes.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('notes.empty')}</p>
            ) : (
              <ul className="space-y-2.5">
                {notes.map((n) => {
                  const done = !!n.resolvedAt;
                  return (
                    <li key={n.id} className={cn('group text-sm', done && 'opacity-60')}>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{name(n.author)}</span>
                        <span>{when(n.createdAt)}</span>
                        {n.kind === 'changes' && (
                          <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium', done ? 'bg-muted' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300')}>
                            {done ? t('notes.done') : t('notes.changesBadge')}
                          </span>
                        )}
                        <span className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                          {canReview && n.kind === 'changes' && done && (
                            <Button type="button" variant="ghost" size="icon-sm" title={t('notes.reopen')} aria-label={t('notes.reopen')} onClick={() => resolve(n, false)}>
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {(n.author?.id === user?.id || user?.role === 'admin') && (
                            <Button type="button" variant="ghost" size="icon-sm" title={tc('delete')} aria-label={tc('delete')} onClick={() => remove(n)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </span>
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap break-words">{n.body}</p>
                    </li>
                  );
                })}
              </ul>
            )}

            {canReview && (
              <div className="space-y-2">
                <Textarea
                  value={text}
                  maxLength={NOTE_MAX}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={inReview ? t('notes.placeholderReview') : t('notes.placeholder')}
                  aria-label={t('notes.title')}
                  className="min-h-16 text-sm"
                />
                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="button" variant={inReview ? 'outline' : 'default'} size="sm" className="h-8 text-xs" disabled={busy || !text.trim()} onClick={() => add('comment')}>
                    {t('notes.add')}
                  </Button>
                  {inReview && (
                    <Button type="button" size="sm" className="h-8 gap-1.5 text-xs" disabled={busy || !text.trim()} onClick={() => add('changes')}>
                      <Send className="h-3.5 w-3.5" />
                      {t('notes.sendBack')}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
