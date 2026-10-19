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
      toast.success(next ? 'Focal point saved' : 'Focal point cleared');
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Could not save the focal point');
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
            <Crosshair className="h-4 w-4 text-indigo-400" /> Focal point
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Click the most important part of <span className="font-semibold text-foreground">{file?.originalName || file?.filename}</span>.
            Cropped versions keep it in frame.
          </DialogDescription>
        </DialogHeader>

        {file && (
          <div className="space-y-4">
            <div
              className="relative w-full cursor-crosshair select-none rounded-md overflow-hidden border border-border bg-muted/40"
              onClick={pick}
              role="button"
              aria-label="Set focal point"
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
                { label: 'Square', w: 'w-20', h: 'h-20' },
                { label: 'Wide 16:9', w: 'w-36', h: 'h-20' },
                { label: 'Tall 3:4', w: 'w-16', h: 'h-20' },
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
                {point ? `x ${point.x} · y ${point.y}` : 'Not set — crops are centred'}
              </span>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {file?.focalX != null && (
            <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => save(null)}>
              Clear
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="button" size="sm" disabled={!point || saving} onClick={() => save(point)}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
