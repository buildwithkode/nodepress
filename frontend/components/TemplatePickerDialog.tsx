'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import { toast } from 'sonner';
import { LayoutTemplate, Loader2 } from 'lucide-react';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface StarterTemplate {
  id: string;
  name: string;
  description: string;
  contentTypes: Array<{ name: string; displayName: string; fields: number }>;
  entries: number;
}

/** Content Types → Start from a template (GET /api/templates, POST /api/templates/:id/apply). */
export function TemplatePickerDialog({
  open,
  onOpenChange,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied: () => void;
}) {
  const t = useTranslations('contentTypes');
  const tc = useTranslations('common');
  const [templates, setTemplates] = useState<StarterTemplate[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [sample, setSample] = useState(true);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!open || templates) return;
    api.get('/templates').then((r) => {
      setTemplates(r.data);
      setPicked(r.data[0]?.id ?? null);
    }).catch(() => setTemplates([]));
  }, [open, templates]);

  const apply = async () => {
    if (!picked) return;
    setApplying(true);
    try {
      const res = await api.post(`/templates/${picked}/apply`, { sampleContent: sample });
      toast.success(t('templates.applied', { types: res.data.contentTypes.length, entries: res.data.entries }));
      onApplied();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.response?.data?.message || tc('somethingWentWrong'));
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><LayoutTemplate className="h-4 w-4" />{t('templates.title')}</DialogTitle>
          <DialogDescription>{t('templates.description')}</DialogDescription>
        </DialogHeader>
        {templates === null ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="space-y-2">
            {templates.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => setPicked(tpl.id)}
                className={cn(
                  'w-full rounded-lg border px-4 py-3 text-left transition-colors',
                  picked === tpl.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40',
                )}
              >
                <div className="font-medium text-sm">{t(`templates.names.${tpl.id}`)}</div>
                <div className="text-xs text-muted-foreground">{t(`templates.descriptions.${tpl.id}`)}</div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {tpl.contentTypes.map((ct) => (
                    <span key={ct.name} className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted border border-border/50">{ct.name}</span>
                  ))}
                </div>
              </button>
            ))}
            <label className="flex items-center gap-2 pt-1 text-sm">
              <Checkbox checked={sample} onCheckedChange={(v) => setSample(v === true)} />
              {t('templates.sampleContent')}
            </label>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applying}>{tc('cancel')}</Button>
          <Button onClick={apply} disabled={!picked || applying}>
            {applying && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {t('templates.apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
