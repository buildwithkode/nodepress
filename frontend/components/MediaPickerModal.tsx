'use client';

import { useEffect, useRef, useState } from 'react';
import { Upload, ImageIcon, Check, Loader2, Crop, X } from 'lucide-react';
import { toast } from 'sonner';
import Cookies from 'js-cookie';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { ImageCropModal } from '@/components/ImageCropModal';

interface MediaFile {
  filename: string;
  url: string;
  originalName: string;
  mimetype: string;
}

export interface ImageValue {
  url: string;
  alt: string;
}

interface Props {
  value: ImageValue | null;
  onChange: (val: ImageValue | null) => void;
}

export function MediaPickerModal({ value, onChange }: Props) {
  const [open, setOpen]               = useState(false);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [files, setFiles]             = useState<MediaFile[]>([]);
  const [loading, setLoading]         = useState(false);
  const [selectedUrl, setSelectedUrl] = useState<string>(value?.url ?? '');
  const [alt, setAlt]                 = useState<string>(value?.alt ?? '');
  const [uploading, setUploading]     = useState(false);
  const [dragOver, setDragOver]       = useState(false);
  const [tab, setTab]                 = useState('browse');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const res = await api.get('/media?limit=100');
      setFiles(Array.isArray(res.data) ? res.data : (res.data.data ?? []));
    } catch {
      toast.error('Failed to load media');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setSelectedUrl(value?.url ?? '');
      setAlt(value?.alt ?? '');
      setTab('browse');
      fetchFiles();
    }
  }, [open]);

  const confirm = () => {
    if (selectedUrl) onChange({ url: selectedUrl, alt });
    setOpen(false);
  };

  const uploadFile = async (file: File) => {
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
      const uploaded = await res.json();
      toast.success(`${file.name} uploaded`);
      await fetchFiles();
      const targetUrl = uploaded.url || uploaded.webpUrl;
      setSelectedUrl(targetUrl);
      setAlt('');
      setTab('browse');
    } catch {
      toast.error(`${file.name} upload failed`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <div className="space-y-2">
        {/* Input-style trigger bar matching standard inputs */}
        <div
          onClick={() => setOpen(true)}
          className={cn(
            "group flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm shadow-xs transition-colors cursor-pointer hover:bg-muted/30 focus-within:ring-1 focus-within:ring-ring",
            value?.url ? "border-primary/40 bg-primary/[0.02]" : "text-muted-foreground"
          )}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {value?.url ? (
              <img
                src={value.url}
                alt={value.alt || ''}
                className="h-6 w-6 rounded object-cover border border-border/80 shrink-0"
              />
            ) : (
              <ImageIcon className="h-4 w-4 text-muted-foreground shrink-0 group-hover:text-foreground transition-colors" />
            )}
            <span className={cn("truncate text-xs sm:text-sm font-normal", value?.url ? "text-foreground font-medium" : "text-muted-foreground")}>
              {value?.url ? (value.alt ? `${value.alt} (${value.url.split('/').pop()})` : value.url.split('/').pop() || value.url) : 'Choose image from media library…'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            {value?.url && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedUrl(value.url);
                    setAlt(value.alt || '');
                    setCropModalOpen(true);
                  }}
                  className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  title="Crop / Zoom"
                >
                  <Crop className="h-3 w-3 inline mr-1" />
                  Crop
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(null);
                  }}
                  className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  title="Remove image"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-primary font-medium hover:bg-primary/10"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(true);
              }}
            >
              {value?.url ? 'Change' : 'Browse'}
            </Button>
          </div>
        </div>

        {/* Thumbnail Preview Card when image is selected */}
        {value?.url && (
          <div className="relative inline-flex items-center gap-3 p-2 rounded-lg border border-border/80 bg-muted/20">
            <img
              src={value.url}
              alt={value.alt || ''}
              className="h-16 w-24 rounded-md border border-border object-cover bg-black/10"
            />
            <div className="text-xs space-y-1">
              <p className="font-medium text-foreground truncate max-w-[240px]">
                {value.url.split('/').pop()}
              </p>
              {value.alt && (
                <p className="text-[11px] text-muted-foreground truncate max-w-[240px]">
                  Alt: {value.alt}
                </p>
              )}
              <div className="flex items-center gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedUrl(value.url);
                    setAlt(value.alt || '');
                    setCropModalOpen(true);
                  }}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
                >
                  <Crop className="h-3 w-3" />
                  Crop
                </button>
                <span className="text-muted-foreground/40">·</span>
                <button
                  type="button"
                  onClick={() => onChange(null)}
                  className="text-[11px] text-destructive/80 hover:text-destructive font-medium"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Media Library</DialogTitle>
          </DialogHeader>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="browse">Browse</TabsTrigger>
              <TabsTrigger value="upload">Upload</TabsTrigger>
            </TabsList>

            <TabsContent value="browse">
              {loading ? (
                <div className="grid grid-cols-4 gap-3 mt-3">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="aspect-square rounded-md bg-muted animate-pulse" />
                  ))}
                </div>
              ) : files.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  No media files yet. Upload one first.
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-4 gap-3 max-h-64 overflow-y-auto pr-1">
                  {files.map((file) => {
                    const isImg = file.mimetype?.startsWith('image/');
                    const isSelected = selectedUrl === file.url;
                    return (
                      <button
                        key={file.filename}
                        type="button"
                        onClick={() => setSelectedUrl(file.url)}
                        className={cn(
                          'relative aspect-square rounded-md border-2 overflow-hidden bg-muted transition-all',
                          isSelected
                            ? 'border-primary ring-2 ring-primary/30'
                            : 'border-transparent hover:border-muted-foreground/30',
                        )}
                      >
                        {isImg ? (
                          <img
                            src={file.url}
                            alt={file.originalName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground font-mono">
                            {file.filename.split('.').pop()?.toUpperCase()}
                          </div>
                        )}
                        {isSelected && (
                          <div className="absolute top-1 right-1 bg-primary rounded-full p-0.5">
                            <Check className="h-3 w-3 text-primary-foreground" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Alt text input — shown once an image is selected */}
              {selectedUrl && (
                <div className="mt-4 space-y-1.5">
                  <Label htmlFor="media-alt" className="text-sm">
                    Alt text <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="media-alt"
                    placeholder="Describe the image for accessibility…"
                    value={alt}
                    onChange={(e) => setAlt(e.target.value)}
                  />
                </div>
              )}
            </TabsContent>

            <TabsContent value="upload">
              <div
                className={cn(
                  'mt-3 flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 cursor-pointer transition-colors',
                  dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-muted-foreground/50',
                  uploading && 'pointer-events-none opacity-60',
                )}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const file = e.dataTransfer.files[0];
                  if (file) uploadFile(file);
                }}
              >
                {uploading ? (
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-muted-foreground mb-3" />
                    <p className="text-sm font-medium">Drop a file or click to browse</p>
                    <p className="text-xs text-muted-foreground mt-1">JPG, PNG, GIF, WebP — max 10 MB</p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadFile(file);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
              />
            </TabsContent>
          </Tabs>

          <DialogFooter className="flex items-center justify-between sm:justify-between w-full">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (selectedUrl) {
                    setCropModalOpen(true);
                  }
                }}
                disabled={!selectedUrl}
                className="gap-1.5 text-indigo-400 hover:text-indigo-300"
              >
                <Crop className="h-3.5 w-3.5" />
                Crop & Zoom
              </Button>
              <Button type="button" onClick={confirm} disabled={!selectedUrl}>
                Use Image
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Crop & Resize Modal */}
      <ImageCropModal
        open={cropModalOpen}
        onOpenChange={setCropModalOpen}
        imageUrl={selectedUrl || value?.url || ''}
        altText={alt || value?.alt || ''}
        onCropComplete={(cropped) => {
          onChange({ url: cropped.url, alt: cropped.alt || alt });
          setOpen(false);
        }}
      />
    </>
  );
}
