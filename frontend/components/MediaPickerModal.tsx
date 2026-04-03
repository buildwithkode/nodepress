'use client';

import { useEffect, useRef, useState } from 'react';
import { Upload, ImageIcon, Check, Loader2 } from 'lucide-react';
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
  const [open, setOpen]           = useState(false);
  const [files, setFiles]         = useState<MediaFile[]>([]);
  const [loading, setLoading]     = useState(false);
  const [selectedUrl, setSelectedUrl] = useState<string>(value?.url ?? '');
  const [alt, setAlt]             = useState<string>(value?.alt ?? '');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver]   = useState(false);
  const [tab, setTab]             = useState('browse');
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
      setSelectedUrl(uploaded.url);
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
        {value?.url && (
          <div className="relative inline-block group">
            <img
              src={value.url}
              alt={value.alt}
              className="h-24 w-auto rounded border object-cover"
            />
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="absolute inset-0 flex items-center justify-center rounded bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-medium"
            >
              Change
            </button>
          </div>
        )}
        {value?.url && value.alt && (
          <p className="text-xs text-muted-foreground">Alt: {value.alt}</p>
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            <ImageIcon className="h-3.5 w-3.5 mr-1.5" />
            {value?.url ? 'Change Image' : 'Choose from Media'}
          </Button>
          {value?.url && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              Remove
            </Button>
          )}
        </div>
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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={confirm} disabled={!selectedUrl}>
              Use Image
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
