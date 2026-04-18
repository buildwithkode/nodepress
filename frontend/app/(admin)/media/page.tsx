'use client';

import { useEffect, useRef, useState } from 'react';
import { Upload, Copy, Trash2, File, RefreshCw, Loader2, Folder, FolderPlus, FolderOpen, ChevronRight } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import api from '../../../lib/axios';
import { useAuth } from '@/context/AuthContext';
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
    </div>
  );
}
