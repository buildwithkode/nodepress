'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Crosshair, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import api from '@/lib/axios';
import { transformUrl } from '@/lib/media-url';
import { useTranslations } from 'use-intl';

export interface FocalTarget {
  filename: string;
  url: string;
  originalName?: string;
  focalX?: number | null;
  focalY?: number | null;
}

/**
 * Click the image to set its focal point. Cover crops (e.g. square thumbnails
 * from /api/media/:file/transform?fit=cover) keep that point in frame.
 */
export function FocalPointDialog({
  file,
  onClose,
  onSaved,
}: {
  file: FocalTarget | null;
  onClose: () => void;
  onSaved: (filename: string, focalX: number | null, focalY: number | null) => void;
}) {
  const t = useTranslations('media');
  const tc = useTranslations('common');
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPoint(file && file.focalX != null && file.focalY != null ? { x: file.focalX, y: file.focalY } : null);
  }, [file]);

  const save = async (next: { x: number; y: number } | null) => {
    if (!file) return;
    setSaving(true);
    try {
      const res = await api.put(`/media/${encodeURIComponent(file.filename)}/focal-point`, {
        x: next?.x ?? null,
        y: next?.y ?? null,
      });
      onSaved(file.filename, res.data.focalX, res.data.focalY);
      toast.success(next ? t('focal.saved') : t('focal.cleared'));
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? t('focal.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const pick = (e: React.MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const round = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;
    setPoint({ x: round((e.clientX - box.left) / box.width), y: round((e.clientY - box.top) / box.height) });
  };

  // Previews use the saved point until Save, so show what a crop around the
  // picked point looks like with a CSS object-position instead.
  const objectPosition = point ? `${point.x * 100}% ${point.y * 100}%` : '50% 50%';

  return (
    <Dialog open={file !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Crosshair className="h-4 w-4 text-indigo-400" /> {t('focal.title')}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {t.rich('focal.description', {
              name: file?.originalName || file?.filename || '',
              strong: (chunks) => <span className="font-semibold text-foreground">{chunks}</span>,
            })}
          </DialogDescription>
        </DialogHeader>

        {file && (
          <div className="space-y-4">
            <div
              className="relative w-full cursor-crosshair select-none rounded-md overflow-hidden border border-border bg-muted/40"
              onClick={pick}
              role="button"
              aria-label={t('library.setFocalPoint')}
            >
              <img src={transformUrl(file.filename, { w: 1200 })} alt="" className="block w-full h-auto" draggable={false} />
              {point && (
                <span
                  className="absolute h-6 w-6 -ml-3 -mt-3 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(0,0,0,0.6)] pointer-events-none"
                  style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
                />
              )}
            </div>

            <div className="flex flex-wrap gap-3 items-end">
              {[
                { label: t('focal.previewSquare'), w: 'w-20', h: 'h-20' },
                { label: t('focal.previewWide'), w: 'w-36', h: 'h-20' },
                { label: t('focal.previewTall'), w: 'w-16', h: 'h-20' },
              ].map((p) => (
                <div key={p.label} className="text-center">
                  <img
                    src={transformUrl(file.filename, { w: 384 })}
                    alt=""
                    className={`${p.w} ${p.h} object-cover rounded border border-border`}
                    style={{ objectPosition }}
                  />
                  <span className="text-[10px] text-muted-foreground">{p.label}</span>
                </div>
              ))}
              <span className="text-xs text-muted-foreground ml-auto">
                {point ? `x ${point.x} · y ${point.y}` : t('focal.notSet')}
              </span>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {file?.focalX != null && (
            <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => save(null)}>
              {t('focal.clear')}
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>{tc('cancel')}</Button>
          <Button type="button" size="sm" disabled={!point || saving} onClick={() => save(point)}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {tc('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
