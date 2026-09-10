'use client';

import { useState, useRef, useCallback } from 'react';
import { UploadCloud, ImageIcon, Crop, Trash2, FolderOpen, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import Cookies from 'js-cookie';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { MediaPickerModal, ImageValue } from '@/components/MediaPickerModal';
import { ImageCropModal } from '@/components/ImageCropModal';

interface Props {
  value: ImageValue | string | null;
  onChange: (val: ImageValue | null) => void;
  label?: string;
  className?: string;
}

export function MediaDropzone({ value, onChange, label, className }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Normalize value
  const imageUrl = typeof value === 'string' ? value : value?.url || '';
  const imageAlt = typeof value === 'string' ? '' : value?.alt || '';

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please drop a valid image file (PNG, JPG, WebP, GIF)');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const token = Cookies.get('np_token') || '';
      const res = await fetch('/api/media/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      const targetUrl = data.url || data.webpUrl;
      onChange({ url: targetUrl, alt: imageAlt || file.name.replace(/\.[^/.]+$/, '') });
      toast.success('Image uploaded successfully');
    } catch {
      toast.error('Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleUpload(files[0]);
    }
  }, [imageAlt]);

  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <ImageIcon className="h-3.5 w-3.5 text-primary" />
          {label}
        </Label>
      )}

      {imageUrl ? (
        /* Populated State: Preview Card */
        <div className="group relative rounded-xl border border-border bg-card/60 p-3 shadow-sm transition-all hover:border-border/80">
          <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted/40 border border-border/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={imageAlt || 'Media preview'}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
            {uploading && (
              <div className="absolute inset-0 bg-background/70 backdrop-blur-sm flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}
          </div>

          {/* Alt text editor */}
          <div className="mt-2.5">
            <Input
              placeholder="Add image alt description (SEO)..."
              value={imageAlt}
              onChange={(e) => onChange({ url: imageUrl, alt: e.target.value })}
              className="h-8 text-xs bg-background/50"
            />
          </div>

          {/* Actions toolbar */}
          <div className="mt-2.5 flex items-center justify-between gap-1.5 pt-2 border-t border-border/50 text-xs">
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setMediaPickerOpen(true)}
              >
                <FolderOpen className="h-3 w-3" />
                Library
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1 text-indigo-400 hover:text-indigo-300"
                onClick={() => setCropModalOpen(true)}
              >
                <Crop className="h-3 w-3" />
                Crop / Zoom
              </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => onChange(null)}
            >
              <Trash2 className="h-3 w-3" />
              Remove
            </Button>
          </div>
        </div>
      ) : (
        /* Empty State: Tactile Dropzone */
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'group relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all duration-200',
            isDragging
              ? 'border-primary bg-primary/10 scale-[1.01]'
              : 'border-border/70 bg-card/40 hover:border-primary/50 hover:bg-accent/20',
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
          />

          <div className="mb-3 rounded-full bg-primary/10 p-3 text-primary transition-transform group-hover:scale-110">
            {uploading ? (
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            ) : (
              <UploadCloud className="h-6 w-6" />
            )}
          </div>

          <p className="text-xs font-semibold text-foreground">
            {uploading ? 'Uploading image...' : 'Drop image here or click to browse'}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            PNG, JPG, WebP, GIF up to 10 MB
          </p>

          <div className="mt-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 text-[11px] gap-1 px-2.5"
              onClick={() => setMediaPickerOpen(true)}
            >
              <FolderOpen className="h-3 w-3" />
              Choose from Media Library
            </Button>
          </div>
        </div>
      )}

      {/* Hidden Media Library Picker */}
      <MediaPickerModal
        value={imageUrl ? { url: imageUrl, alt: imageAlt } : null}
        onChange={(val) => {
          if (val) onChange(val);
          setMediaPickerOpen(false);
        }}
      />

      {/* Hidden Image Crop Modal */}
      {imageUrl && (
        <ImageCropModal
          open={cropModalOpen}
          onOpenChange={setCropModalOpen}
          imageUrl={imageUrl}
          altText={imageAlt}
          onCropComplete={(cropped) => {
            onChange({ url: cropped.url, alt: cropped.alt || imageAlt });
            setCropModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
