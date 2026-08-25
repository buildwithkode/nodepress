'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Upload,
  Copy,
  Trash2,
  File,
  RefreshCw,
  Loader2,
  Folder,
  FolderPlus,
  FolderOpen,
  ChevronRight,
  Sparkles,
  SlidersHorizontal,
  Download,
  Check,
  ExternalLink,
  ImageIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import Cookies from 'js-cookie';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import api from '../../../lib/axios';
import { useAuth } from '@/context/AuthContext';
import { useRealtimeEvents } from '@/lib/useRealtimeEvents';
import { canManageContent } from '@/lib/roles';

interface MediaFile {
  filename: string;
  url: string;
  webpUrl?: string | null;
  originalName: string;
  mimetype: string;
  size: number;
  width?: number | null;
  height?: number | null;
  folderId?: number | null;
  createdAt: string;
}

interface MediaFolder {
  id: number;
  name: string;
  parentId: number | null;
}

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
const isImage = (filename: string) => IMAGE_EXTS.includes(filename.split('.').pop()?.toLowerCase() ?? '');
const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function MediaPage() {
  const { user } = useAuth();
  const canEdit = canManageContent(user?.role);

  const [files, setFiles]       = useState<MediaFile[]>([]);
  const [folders, setFolders]   = useState<MediaFolder[]>([]);
  const [loading, setLoading]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Folder navigation — null = root (all unfiled), undefined = show all
  const [activeFolderId, setActiveFolderId] = useState<number | null | undefined>(undefined);
  const [newFolderName, setNewFolderName]   = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [showNewFolder, setShowNewFolder]   = useState(false);

  // Dynamic image transformation modal
  const [transformFile, setTransformFile] = useState<MediaFile | null>(null);
  const [targetWidth, setTargetWidth] = useState<string>('800');
  const [targetHeight, setTargetHeight] = useState<string>('');
  const [targetQuality, setTargetQuality] = useState<number>(80);
  const [targetFormat, setTargetFormat] = useState<'webp' | 'avif' | 'jpeg' | 'png'>('webp');
  const [targetFit, setTargetFit] = useState<'inside' | 'cover' | 'contain' | 'fill'>('inside');
  const [copiedTransformUrl, setCopiedTransformUrl] = useState(false);
  const [copiedPictureHtml, setCopiedPictureHtml] = useState(false);

  const getTransformUrl = (filename: string, w?: string, h?: string, fmt?: string, q?: number, fit?: string) => {
    const params = new URLSearchParams();
    if (w && parseInt(w, 10) > 0) params.set('w', w);
    if (h && parseInt(h, 10) > 0) params.set('h', h);
    if (fmt) params.set('format', fmt);
    if (q) params.set('q', String(q));
    if (fit && fit !== 'inside') params.set('fit', fit);
    const backendOrigin = (api.defaults.baseURL || '').replace(/\/api$/, '');
    return `${backendOrigin}/api/media/${filename}/transform?${params.toString()}`;
  };

  const applyPreset = (w: string, h: string, fit: 'inside' | 'cover' | 'contain' | 'fill') => {
    setTargetWidth(w);
    setTargetHeight(h);
    setTargetFit(fit);
  };

  const fetchFolders = async () => {
    try {
      const res = await api.get('/media/folders');
      setFolders(res.data ?? []);
    } catch { /* non-critical */ }
  };

  const fetchFiles = async (folderId?: number | null) => {
    setLoading(true);
    try {
      const params: Record<string, any> = { limit: 100 };
      if (folderId !== undefined) params.folderId = folderId === null ? 'null' : folderId;
      const res = await api.get('/media', { params });
      setFiles(Array.isArray(res.data) ? res.data : (res.data.data ?? []));
    } catch {
      toast.error('Failed to load media files');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFolders();
    fetchFiles(activeFolderId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFolderId]);

  useRealtimeEvents({
    onMediaUploaded: () => fetchFiles(activeFolderId),
    onMediaDeleted:  () => fetchFiles(activeFolderId),
  });

  const handleDelete = async (filename: string) => {
    try {
      await api.delete(`/media/${filename}`);
      toast.success('File deleted');
      fetchFiles(activeFolderId);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const handleDeleteFolder = async (id: number) => {
    try {
      await api.delete(`/media/folders/${id}`);
      toast.success('Folder deleted');
      if (activeFolderId === id) setActiveFolderId(undefined);
      fetchFolders();
      fetchFiles(activeFolderId);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    try {
      await api.post('/media/folders', {
        name: newFolderName.trim(),
        parentId: typeof activeFolderId === 'number' ? activeFolderId : undefined,
      });
      toast.success('Folder created');
      setNewFolderName('');
      setShowNewFolder(false);
      fetchFolders();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create folder');
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success('URL copied');
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
      // Auto-assign to current folder if one is selected
      if (typeof activeFolderId === 'number') {
        await api.put(`/media/${uploaded.filename}/folder`, { folderId: activeFolderId }).catch(() => {});
      }
      toast.success(`${file.name} uploaded`);
      fetchFiles(activeFolderId);
    } catch {
      toast.error(`${file.name} upload failed`);
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files || []).forEach(uploadFile);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    Array.from(e.dataTransfer.files).forEach(uploadFile);
  };

  // Build flat list into a tree for sidebar (only root-level for simplicity)
  const rootFolders = folders.filter((f) => f.parentId === null);

  const activeFolderLabel =
    activeFolderId === undefined  ? 'All Files' :
    activeFolderId === null       ? 'Unfiled' :
    folders.find((f) => f.id === activeFolderId)?.name ?? 'Folder';

  return (
    <div className="flex gap-6 h-full">
      {/* ── Folder Sidebar ──────────────────────────────────────────────────── */}
      <aside className="w-48 shrink-0 space-y-0.5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">Folders</p>

        {/* All files */}
        <button
          onClick={() => setActiveFolderId(undefined)}
          className={cn(
            'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors text-left',
            activeFolderId === undefined
              ? 'bg-accent text-accent-foreground font-medium'
              : 'hover:bg-muted text-muted-foreground hover:text-foreground',
          )}
        >
          <Folder className="h-3.5 w-3.5 shrink-0" />
          All Files
        </button>

        {/* Unfiled */}
        <button
          onClick={() => setActiveFolderId(null)}
          className={cn(
            'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors text-left',
            activeFolderId === null
              ? 'bg-accent text-accent-foreground font-medium'
              : 'hover:bg-muted text-muted-foreground hover:text-foreground',
          )}
        >
          <Folder className="h-3.5 w-3.5 shrink-0 opacity-40" />
          Unfiled
        </button>

        {rootFolders.length > 0 && <div className="my-1 border-t border-border" />}

        {rootFolders.map((folder) => (
          <div key={folder.id} className="group flex items-center gap-1">
            <button
              onClick={() => setActiveFolderId(folder.id)}
              className={cn(
                'flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors text-left',
                activeFolderId === folder.id
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'hover:bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {activeFolderId === folder.id
                ? <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                : <Folder className="h-3.5 w-3.5 shrink-0" />
              }
              <span className="truncate">{folder.name}</span>
            </button>
            {canEdit && (
              <AlertDialog>
                <AlertDialogTrigger render={
                  <button className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-all" />
                }>
                  <Trash2 className="h-3 w-3" />
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete folder "{folder.name}"?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Files inside will become unfiled. Sub-folders will be deleted.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={() => handleDeleteFolder(folder.id)}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        ))}

        {/* New folder form */}
        {canEdit && (
          <div className="pt-2">
            {showNewFolder ? (
              <form onSubmit={handleCreateFolder} className="flex gap-1">
                <Input
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Folder name"
                  className="h-7 text-xs"
                  onKeyDown={(e) => e.key === 'Escape' && setShowNewFolder(false)}
                />
                <Button type="submit" size="sm" className="h-7 px-2 text-xs" disabled={creatingFolder}>
                  {creatingFolder ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronRight className="h-3 w-3" />}
                </Button>
              </form>
            ) : (
              <button
                onClick={() => setShowNewFolder(true)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <FolderPlus className="h-3.5 w-3.5" />
                New Folder
              </button>
            )}
          </div>
        )}
      </aside>

      {/* ── Main Content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-foreground">{activeFolderLabel}</h2>
          <Button variant="outline" size="sm" onClick={() => fetchFiles(activeFolderId)}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>

        {/* Upload Zone */}
        {canEdit && (
          <div
            onClick={() => !uploading && fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={cn(
              'mb-6 border-2 border-dashed rounded-lg flex flex-col items-center justify-center py-10 px-6 cursor-pointer transition-colors select-none',
              dragOver        ? 'border-blue-500 bg-blue-500/10' :
              uploading       ? 'border-border bg-muted/30 cursor-not-allowed opacity-60' :
                                'border-border bg-card hover:border-blue-500/50 hover:bg-blue-500/5',
            )}
          >
            <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.mp4"
              className="hidden" onChange={handleFileChange} disabled={uploading} />
            {uploading
              ? <Loader2 className="h-8 w-8 text-blue-400 animate-spin mb-2" />
              : <Upload className="h-8 w-8 text-muted-foreground mb-2" />
            }
            <p className="text-sm font-medium">{uploading ? 'Uploading…' : 'Click or drag files here'}</p>
            <p className="text-xs text-muted-foreground mt-0.5">JPG, PNG, GIF, WebP, PDF, MP4 — Max 10 MB</p>
          </div>
        )}

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-border overflow-hidden">
                <Skeleton className="h-32 w-full rounded-none" />
                <div className="p-2 space-y-1.5"><Skeleton className="h-3 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>
              </div>
            ))}
          </div>
        ) : files.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Upload className="h-10 w-10 mx-auto mb-3" />
            <p className="text-sm">No files here yet</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground mb-4">{files.length} file{files.length !== 1 ? 's' : ''}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {files.map((file) => (
                <div key={file.filename}
                  className="rounded-lg border border-border overflow-hidden bg-card hover:bg-muted/30 transition-colors">
                  {/* Thumbnail */}
                  {isImage(file.filename) ? (
                    <a href={file.url} target="_blank" rel="noopener noreferrer" className="relative block">
                      <img src={file.url} alt={file.originalName || file.filename}
                        className="w-full h-32 object-cover block" />
                      {file.webpUrl && (
                        <span className="absolute top-1.5 right-1.5 text-[9px] font-semibold bg-blue-600 text-white rounded px-1 py-0.5 leading-none">
                          WebP
                        </span>
                      )}
                    </a>
                  ) : (
                    <div className="h-32 flex items-center justify-center bg-muted/50">
                      <File className="h-10 w-10 text-muted-foreground" />
                    </div>
                  )}

                  {/* Info */}
                  <div className="p-2.5">
                    <p className="text-xs text-foreground truncate mb-1" title={file.originalName || file.filename}>
                      {file.originalName || file.filename}
                    </p>
                    <div className="flex flex-wrap gap-1 mb-2">
                      <span className="inline-block text-[10px] bg-secondary text-muted-foreground rounded px-1.5 py-0.5">
                        {formatSize(file.size)}
                      </span>
                      {file.width && file.height && (
                        <span className="inline-block text-[10px] bg-secondary text-muted-foreground rounded px-1.5 py-0.5">
                          {file.width}×{file.height}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      <Button type="button" variant="outline" size="sm"
                        onClick={() => handleCopyUrl(file.webpUrl || file.url)}
                        className="flex-1 h-7 text-xs gap-1"
                        title={file.webpUrl ? 'Copy WebP URL' : 'Copy URL'}>
                        <Copy className="h-3 w-3" />{file.webpUrl ? 'WebP' : 'Copy'}
                      </Button>
                      {file.webpUrl && (
                        <Button type="button" variant="outline" size="sm"
                          onClick={() => handleCopyUrl(file.url)}
                          className="h-7 text-xs px-2" title="Copy original URL">
                          <Copy className="h-3 w-3" />
                        </Button>
                      )}
                      {isImage(file.filename) && (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-xs"
                          onClick={() => {
                            setTransformFile(file);
                            setTargetWidth(file.width ? String(Math.min(file.width, 800)) : '800');
                            setTargetHeight('');
                            setTargetQuality(80);
                            setTargetFormat('webp');
                            setTargetFit('inside');
                          }}
                          title="Dynamic Transform & Resize"
                          className="h-7 w-7 text-indigo-400 hover:text-indigo-300"
                        >
                          <Sparkles className="h-3 w-3" />
                        </Button>
                      )}
                      {canEdit && (
                        <AlertDialog>
                          <AlertDialogTrigger render={
                            <Button variant="ghost" size="icon-xs" title="Delete"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10" />
                          }>
                            <Trash2 className="h-3 w-3" />
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete file?</AlertDialogTitle>
                              <AlertDialogDescription>
                                <span className="font-medium">{file.originalName || file.filename}</span> will be
                                permanently deleted.{file.webpUrl && ' The WebP version will also be deleted.'}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction variant="destructive" onClick={() => handleDelete(file.filename)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Dynamic Image Transformer Modal ───────────────────────────────── */}
      {/* ── Dynamic Image Transformer Modal ───────────────────────────────── */}
      <Dialog open={transformFile !== null} onOpenChange={(open) => !open && setTransformFile(null)}>
        <DialogContent className="sm:max-w-4xl max-w-[95vw] w-full p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <Sparkles className="h-5 w-5 text-indigo-400" />
              Dynamic Image Transformer & Responsive CDN
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Generate on-the-fly resized, cropped, and format-optimized variants with edge-caching CDN URLs.
            </DialogDescription>
          </DialogHeader>

          {transformFile && (
            <div className="space-y-5 py-1">
              {/* Presets Header Strip */}
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                <Label className="text-xs font-semibold text-foreground/80 mb-2 block">Quick Dimension Presets</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-8 justify-center font-medium hover:bg-indigo-500/10 hover:text-indigo-400 hover:border-indigo-500/30 transition-colors"
                    onClick={() => applyPreset('150', '150', 'cover')}
                  >
                    Thumbnail (150×150)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-8 justify-center font-medium hover:bg-indigo-500/10 hover:text-indigo-400 hover:border-indigo-500/30 transition-colors"
                    onClick={() => applyPreset('400', '300', 'cover')}
                  >
                    Card (400×300)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-8 justify-center font-medium hover:bg-indigo-500/10 hover:text-indigo-400 hover:border-indigo-500/30 transition-colors"
                    onClick={() => applyPreset('1200', '630', 'cover')}
                  >
                    Social Hero (1200×630)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-8 justify-center font-medium hover:bg-indigo-500/10 hover:text-indigo-400 hover:border-indigo-500/30 transition-colors"
                    onClick={() => applyPreset('1920', '800', 'inside')}
                  >
                    Full Banner (1920×800)
                  </Button>
                </div>
              </div>

              {/* Main 2-Column Studio */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Column: Dimensions & Format Tuning */}
                <div className="space-y-4 rounded-lg border border-border/60 bg-muted/10 p-4">
                  <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wider block">Transform Settings</span>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="tf-w" className="text-xs font-medium">Width (px)</Label>
                      <Input id="tf-w" type="number" placeholder="Auto" value={targetWidth} onChange={(e) => setTargetWidth(e.target.value)} className="h-8 text-xs font-mono" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="tf-h" className="text-xs font-medium">Height (px)</Label>
                      <Input id="tf-h" type="number" placeholder="Auto" value={targetHeight} onChange={(e) => setTargetHeight(e.target.value)} className="h-8 text-xs font-mono" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Format</Label>
                      <Select value={targetFormat} onValueChange={(v: any) => setTargetFormat(v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="webp">WebP (Modern Standard)</SelectItem>
                          <SelectItem value="avif">AVIF (Next-Gen High Compression)</SelectItem>
                          <SelectItem value="jpeg">JPEG (Universal)</SelectItem>
                          <SelectItem value="png">PNG (Lossless / Transparent)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Fit / Crop Mode</Label>
                      <Select value={targetFit} onValueChange={(v: any) => setTargetFit(v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="inside">Inside (Preserve Aspect)</SelectItem>
                          <SelectItem value="cover">Cover (Crop & Fill)</SelectItem>
                          <SelectItem value="contain">Contain (Letterbox)</SelectItem>
                          <SelectItem value="fill">Fill (Stretch Exact)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2 pt-1">
                    <div className="flex justify-between items-center text-xs">
                      <Label className="text-xs font-medium">Quality Level</Label>
                      <span className="font-mono font-medium px-1.5 py-0.5 rounded bg-muted text-foreground">{targetQuality}%</span>
                    </div>
                    <input
                      type="range"
                      min={20}
                      max={100}
                      step={5}
                      value={targetQuality}
                      onChange={(e) => setTargetQuality(Number(e.target.value))}
                      className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                  </div>
                </div>

                {/* Right Column: Live Preview & Exporters */}
                <div className="flex flex-col justify-between rounded-lg border border-border/60 bg-muted/20 p-4 space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Live Preview</span>
                      <Badge variant="outline" className="text-[10px] font-mono uppercase bg-indigo-500/10 text-indigo-400 border-indigo-500/30">
                        {targetFormat}
                      </Badge>
                    </div>

                    <div className="h-44 rounded-md border border-border bg-black/40 overflow-hidden flex items-center justify-center relative">
                      <img
                        src={getTransformUrl(transformFile.filename, targetWidth, targetHeight, targetFormat, targetQuality, targetFit)}
                        alt="Transformed preview"
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs gap-1.5 h-8 font-medium"
                        onClick={() => {
                          const url = getTransformUrl(transformFile.filename, targetWidth, targetHeight, targetFormat, targetQuality, targetFit);
                          navigator.clipboard.writeText(url);
                          setCopiedTransformUrl(true);
                          toast.success('Transformed CDN URL copied to clipboard');
                          setTimeout(() => setCopiedTransformUrl(false), 3000);
                        }}
                      >
                        {copiedTransformUrl ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                        {copiedTransformUrl ? 'Copied URL!' : 'Copy Transform URL'}
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs gap-1.5 h-8 font-medium"
                        onClick={() => {
                          const base = (api.defaults.baseURL || '').replace(/\/api$/, '');
                          const webpSrc = `${base}/api/media/${transformFile.filename}/transform?w=800&format=webp`;
                          const snippet = `<picture>\n  <source srcset="${webpSrc}" type="image/webp" />\n  <img src="${transformFile.url}" alt="${transformFile.originalName || 'image'}" loading="lazy" />\n</picture>`;
                          navigator.clipboard.writeText(snippet);
                          setCopiedPictureHtml(true);
                          toast.success('HTML <picture> snippet copied');
                          setTimeout(() => setCopiedPictureHtml(false), 3000);
                        }}
                        title="Copy responsive HTML5 <picture> snippet"
                      >
                        {copiedPictureHtml ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <ExternalLink className="h-3.5 w-3.5" />}
                        HTML &lt;picture&gt;
                      </Button>
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      className="w-full text-xs gap-1.5 h-8 font-medium"
                      onClick={() => {
                        const url = getTransformUrl(transformFile.filename, targetWidth, targetHeight, targetFormat, targetQuality, targetFit);
                        window.open(url, '_blank');
                      }}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Open / Download Transformed Asset
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={() => setTransformFile(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
