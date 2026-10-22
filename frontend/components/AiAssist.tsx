'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import { toast } from 'sonner';
import { Loader2, Sparkles } from 'lucide-react';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

let statusCache: Promise<boolean> | null = null;

/** Whether the server has AI help configured (GET /api/ai/status), fetched once per page load. */
export function useAiEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    statusCache ??= api.get('/ai/status').then((r) => !!r.data?.enabled).catch(() => false);
    let live = true;
    statusCache.then((v) => live && setEnabled(v));
    return () => { live = false; };
  }, []);
  return enabled;
}

function AiPrompt({
  placeholder,
  action,
  busyLabel,
  run,
}: {
  placeholder: string;
  action: string;
  busyLabel: string;
  run: (prompt: string) => Promise<void>;
}) {
  const tc = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Sparkles className="h-3.5 w-3.5 text-violet-500" />
        {action}
      </Button>
    );
  }
  return (
    <div className="space-y-2 rounded-lg border border-violet-500/30 bg-violet-500/5 p-3">
      <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={placeholder} rows={3} autoFocus maxLength={4000} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>{tc('cancel')}</Button>
        <Button
          type="button"
          size="sm"
          disabled={busy || !prompt.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              await run(prompt.trim());
              setOpen(false);
              setPrompt('');
            } catch (err: any) {
              toast.error(err?.response?.data?.message || tc('somethingWentWrong'));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
          {busy ? busyLabel : action}
        </Button>
      </div>
    </div>
  );
}

/** "Generate with AI" on the new content type page — fills the name and fields (not saved). */
export function AiContentModelButton({
  onSuggested,
}: {
  onSuggested: (ct: { name: string; displayName: string; schema: any[] }) => void;
}) {
  const tct = useTranslations('contentTypes');
  if (!useAiEnabled()) return null;
  return (
    <AiPrompt
      action={tct('ai.generate')}
      busyLabel={tct('ai.generating')}
      placeholder={tct('ai.placeholder')}
      run={async (prompt) => {
        const res = await api.post('/ai/content-model', { prompt });
        onSuggested(res.data);
        toast.success(tct('ai.suggested', { count: res.data.schema.length }));
      }}
    />
  );
}

/** "Draft with AI" in the entry editor — fills field values (not saved). */
export function AiDraftButton({
  contentTypeId,
  current,
  onDraft,
}: {
  contentTypeId: number;
  current?: () => Record<string, unknown>;
  onDraft: (data: Record<string, unknown>) => void;
}) {
  const te = useTranslations('entryEditor');
  if (!useAiEnabled()) return null;
  return (
    <AiPrompt
      action={te('ai.draft')}
      busyLabel={te('ai.drafting')}
      placeholder={te('ai.placeholder')}
      run={async (prompt) => {
        const res = await api.post('/ai/draft', { contentTypeId, prompt, current: current?.() });
        onDraft(res.data.data);
        toast.success(te('ai.drafted', { count: Object.keys(res.data.data).length }));
      }}
    />
  );
}
