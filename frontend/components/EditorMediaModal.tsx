'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Upload, ImageIcon, Check, Loader2, Search, Link as LinkIcon,
  Globe, AlertCircle, X,
} from 'lucide-react';
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
  id?: number;
  filename: string;
  url: string;
  originalName: string;
  mimetype: string;
  size?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onInsert: (params: { url: string; alt: string; caption?: string }) => void;
}

export function EditorMediaModal({ open, onClose, onInsert }: Props) {
  const [tab, setTab] = useState<'library' | 'upload' | 'url'>('library');
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedUrl, setSelectedUrl] = useState('');
  const [alt, setAlt] = useState('');
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // External URL tab state
  const [urlInput, setUrlInput] = useState('');
  const [urlValid, setUrlValid] = useState<boolean | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const res = await api.get('/media?limit=100');
      const list = Array.isArray(res.data) ? res.data : (res.data.data ?? []);
      const imageFiles = list.filter((f: MediaFile) =>
        f.mimetype?.startsWith('image/') ||
        /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(f.url || f.filename)
      );
      setFiles(imageFiles);
    } catch {
      toast.error('Failed to load media library');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setSelectedUrl('');
      setAlt('');
      setCaption('');
      setSearch('');
      setUrlInput('');
      setUrlValid(null);
      setTab('library');
      fetchFiles();
    }
  }, [open]);

  useEffect(() => {
    if (!urlInput.trim()) {
      setUrlValid(null);
      return;
    }
    const timer = setTimeout(() => {
      const img = new Image();
      img.onload = () => setUrlValid(true);
      img.onerror = () => setUrlValid(false);
      img.src = urlInput.trim();
    }, 400);
    return () => clearTimeout(timer);
  }, [urlInput]);

  const uploadFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file (.png, .jpg, .webp, .svg, .gif)');
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
      const uploaded = await res.json();
      toast.success(`"${file.name}" uploaded successfully`);
      await fetchFiles();
      const targetUrl = uploaded.url || uploaded.webpUrl;
      setSelectedUrl(targetUrl);
      setAlt(file.name.replace(/\.[^/.]+$/, ''));
      setTab('library');
    } catch {
      toast.error(`Upload failed for "${file.name}"`);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const handleConfirm = () => {
    const finalUrl = tab === 'url' ? urlInput.trim() : selectedUrl;
    if (!finalUrl) {
      toast.error('Please select or enter an image URL');
      return;
    }
    onInsert({
      url: finalUrl,
      alt: alt.trim(),
      caption: caption.trim() || undefined,
    });
    onClose();
  };

  const filteredFiles = files.filter((f) =>
    (f.originalName || f.filename || '').toLowerCase().includes(search.toLowerCase())
  );

  const activeUrl = tab === 'url' ? urlInput.trim() : selectedUrl;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-background border-border">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-border bg-muted/20">
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-primary" />
            Insert Media Image
          </DialogTitle>
        </DialogHeader>

        {/* Tabs & Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
            <TabsList className="grid grid-cols-3 mb-4 bg-muted/60">
              <TabsTrigger value="library" className="gap-1.5 text-xs font-medium">
                <ImageIcon className="h-3.5 w-3.5" /> Media Library ({files.length})
              </TabsTrigger>
              <TabsTrigger value="upload" className="gap-1.5 text-xs font-medium">
                <Upload className="h-3.5 w-3.5" /> Upload Image
              </TabsTrigger>
              <TabsTrigger value="url" className="gap-1.5 text-xs font-medium">
                <Globe className="h-3.5 w-3.5" /> Web URL
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: Media Library */}
            <TabsContent value="library" className="space-y-3 mt-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search media files by name…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 text-xs h-9 bg-muted/30"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <span className="text-xs">Loading media files…</span>
                </div>
              ) : filteredFiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-center border border-dashed rounded-lg">
                  <ImageIcon className="h-8 w-8 text-muted-foreground/40 mb-2" />
                  <p className="text-xs font-medium">No images found</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                    {search ? 'Try a different search term' : 'Upload your first image in the Upload tab'}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 text-xs h-8"
                    onClick={() => setTab('upload')}
                  >
                    <Upload className="h-3.5 w-3.5 mr-1" /> Upload Image
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5 max-h-[260px] overflow-y-auto pr-1">
                  {filteredFiles.map((file) => {
                    const isSelected = selectedUrl === file.url;
                    return (
                      <button
                        key={file.filename}
                        type="button"
                        onClick={() => {
                          setSelectedUrl(file.url);
                          if (!alt) setAlt(file.originalName.replace(/\.[^/.]+$/, ''));
                        }}
                        className={cn(
                          'relative group aspect-square rounded-lg border-2 overflow-hidden text-left transition-all bg-muted/20',
                          isSelected
                            ? 'border-primary ring-2 ring-primary/30 shadow-md'
                            : 'border-border/60 hover:border-border hover:shadow-sm'
                        )}
                      >
                        <img
                          src={file.url}
                          alt={file.originalName || file.filename}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        {isSelected && (
                          <div className="absolute inset-0 bg-primary/25 flex items-center justify-center">
                            <span className="bg-primary text-primary-foreground rounded-full p-1 shadow">
                              <Check className="h-3.5 w-3.5 stroke-[3]" />
                            </span>
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <p className="text-[10px] text-white truncate font-medium">
                            {file.originalName || file.filename}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Tab 2: Upload */}
            <TabsContent value="upload" className="space-y-4 mt-0">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all',
                  dragOver
                    ? 'border-primary bg-primary/5 scale-[0.99]'
                    : 'border-border/70 hover:border-primary/50 hover:bg-muted/10',
                  uploading && 'pointer-events-none opacity-60'
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadFile(f);
                  }}
                />
                {uploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-xs font-medium text-foreground">Uploading image to server…</p>
                  </div>
                ) : (
                  <>
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                      <Upload className="h-6 w-6 text-primary" />
                    </div>
                    <p className="text-sm font-semibold text-foreground">
                      Click to upload or drag & drop
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      PNG, JPG, WebP, GIF, or SVG (Up to 10 MB)
                    </p>
                    <Button size="sm" variant="secondary" className="mt-4 text-xs">
                      Select File
                    </Button>
                  </>
                )}
              </div>
            </TabsContent>

            {/* Tab 3: Web URL */}
            <TabsContent value="url" className="space-y-3 mt-0">
              <div className="space-y-1.5">
                <Label htmlFor="img-url-input" className="text-xs font-medium">
                  Direct Image URL
                </Label>
                <div className="relative">
                  <LinkIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="img-url-input"
                    placeholder="https://images.unsplash.com/... or CDN link"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    className="pl-8 text-xs font-mono h-9"
                  />
                </div>
              </div>

              {/* Preview */}
              {urlInput.trim() && (
                <div className="border rounded-lg p-3 bg-muted/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Image Preview</span>
                    {urlValid === true && (
                      <span className="text-[11px] text-emerald-500 font-semibold flex items-center gap-1">
                        <Check className="h-3 w-3" /> Valid Image
                      </span>
                    )}
                    {urlValid === false && (
                      <span className="text-[11px] text-destructive font-semibold flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> Unable to load image
                      </span>
                    )}
                    {urlValid === null && (
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> Verifying…
                      </span>
                    )}
                  </div>
                  <div className="aspect-video max-h-40 rounded border bg-black/40 overflow-hidden flex items-center justify-center">
                    <img
                      src={urlInput.trim()}
                      alt="URL preview"
                      className="max-h-full w-auto object-contain"
                      onError={() => setUrlValid(false)}
                      onLoad={() => setUrlValid(true)}
                    />
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* Metadata: Alt Text & Caption */}
          {activeUrl && (
            <div className="mt-4 pt-4 border-t border-border space-y-3 bg-muted/10 rounded-lg p-3">
              <div className="space-y-1">
                <Label htmlFor="img-alt-input" className="text-xs font-semibold flex items-center justify-between">
                  <span>Alt Text (Recommended for SEO)</span>
                  <span className="text-[10px] text-muted-foreground font-normal">Accessibility & Google Ranking</span>
                </Label>
                <Input
                  id="img-alt-input"
                  placeholder="e.g. Performance benchmark comparison between NodePress and WordPress"
                  value={alt}
                  onChange={(e) => setAlt(e.target.value)}
                  className="text-xs h-8"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="img-caption-input" className="text-xs font-semibold flex items-center justify-between">
                  <span>Caption (Optional)</span>
                  <span className="text-[10px] text-muted-foreground font-normal">Displayed below the image</span>
                </Label>
                <Input
                  id="img-caption-input"
                  placeholder="e.g. Figure 1: TTFB benchmark under 1,000 concurrent requests"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  className="text-xs h-8"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-3 border-t border-border bg-muted/20 flex items-center justify-between sm:justify-between">
          <div className="text-xs text-muted-foreground truncate max-w-[340px]">
            {activeUrl ? (
              <span className="font-mono text-[11px] truncate block text-foreground/80">
                Selected: {activeUrl.split('/').pop()}
              </span>
            ) : (
              <span>Select or upload an image to insert</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!activeUrl || (tab === 'url' && urlValid === false)}
              onClick={handleConfirm}
              className="gap-1.5"
            >
              <ImageIcon className="h-3.5 w-3.5" />
              Insert Image
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
