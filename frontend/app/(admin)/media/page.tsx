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
  Pencil,
  FolderInput,
  Crosshair,
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
import { cn } from '@/lib/utils';
import api from '../../../lib/axios';
import { useAuth } from '@/context/AuthContext';
import { useRealtimeEvents } from '@/lib/useRealtimeEvents';
import { canManageContent } from '@/lib/roles';
import { transformUrl } from '@/lib/media-url';
import { FocalPointDialog } from './_components/FocalPointDialog';
import { useTranslations } from 'use-intl';

interface MediaFile {
  filename: string;
  url: string;
  webpUrl?: string | null;
  originalName: string;
  mimetype: string;
  size: number;
  width?: number | null;
  height?: number | null;
  focalX?: number | null;
  focalY?: number | null;
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
  const t = useTranslations('media');
  const tc = useTranslations('common');
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

  // Folder rename state
  const [editingFolder, setEditingFolder] = useState<MediaFolder | null>(null);
  const [editFolderName, setEditFolderName] = useState('');
  const [renamingFolder, setRenamingFolder] = useState(false);

  // Move file state
  const [movingFile, setMovingFile] = useState<MediaFile | null>(null);
  const [focalFile, setFocalFile] = useState<MediaFile | null>(null);
  const [targetFolderId, setTargetFolderId] = useState<string>('unfiled');
  const [movingLoading, setMovingLoading] = useState(false);

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
      toast.error(t('toasts.loadFailed'));
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
      toast.success(t('toasts.fileDeleted'));
      fetchFiles(activeFolderId);
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('toasts.deleteFailed'));
    }
  };

  const handleDeleteFolder = async (id: number) => {
    try {
      await api.delete(`/media/folders/${id}`);
      toast.success(t('toasts.folderDeleted'));
      if (activeFolderId === id) setActiveFolderId(undefined);
      fetchFolders();
      fetchFiles(activeFolderId);
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('toasts.deleteFailed'));
    }
  };

  const handleRenameFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFolder || !editFolderName.trim()) return;
    setRenamingFolder(true);
    try {
      await api.put(`/media/folders/${editingFolder.id}`, { name: editFolderName.trim() });
      toast.success(t('toasts.folderRenamed'));
      setEditingFolder(null);
      fetchFolders();
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('toasts.renameFolderFailed'));
    } finally {
      setRenamingFolder(false);
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
      toast.success(t('toasts.folderCreated'));
      setNewFolderName('');
      setShowNewFolder(false);
      fetchFolders();
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('toasts.createFolderFailed'));
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleMoveFile = async () => {
    if (!movingFile) return;
    setMovingLoading(true);
    try {
      const folderId = targetFolderId === 'unfiled' ? null : Number(targetFolderId);
      await api.put(`/media/${movingFile.filename}/folder`, { folderId });
      toast.success(t('toasts.fileMoved'));
      setMovingFile(null);
      fetchFiles(activeFolderId);
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('toasts.moveFileFailed'));
    } finally {
      setMovingLoading(false);
    }
  };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success(t('toasts.urlCopied'));
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
      toast.success(t('toasts.uploaded', { name: file.name }));
      fetchFiles(activeFolderId);
    } catch {
      toast.error(t('toasts.uploadFailed', { name: file.name }));
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files ?? []);
    fileList.forEach(uploadFile);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    dropped.forEach(uploadFile);
  };

  const rootFolders = folders.filter((f) => f.parentId === null);

  const activeFolderLabel =
    activeFolderId === undefined  ? t('folders.allFiles') :
    activeFolderId === null       ? t('folders.unfiled') :
    folders.find((f) => f.id === activeFolderId)?.name ?? t('folders.folder');

  return (
    <div className="flex gap-6 h-full">
      {/* ── Folder Sidebar ──────────────────────────────────────────────────── */}
      <aside className="w-48 shrink-0 space-y-0.5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">{t('folders.title')}</p>

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
          {t('folders.allFiles')}
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
          {t('folders.unfiled')}
        </button>

        {rootFolders.length > 0 && <div className="my-1 border-t border-border" />}

        {rootFolders.map((folder) => (
          <div key={folder.id} className="group flex items-center gap-1">
            <button
              onClick={() => setActiveFolderId(folder.id)}
              className={cn(
                'flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors text-left min-w-0',
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
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {/* Rename Folder Button */}
                <button
                  type="button"
                  onClick={() => {
                    setEditingFolder(folder);
                    setEditFolderName(folder.name);
                  }}
                  title={t('folders.rename')}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                >
                  <Pencil className="h-3 w-3" />
                </button>

                {/* Delete Folder Button */}
                <AlertDialog>
                  <AlertDialogTrigger render={
                    <button className="p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-all" title={t('folders.delete')} />
                  }>
                    <Trash2 className="h-3 w-3" />
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('folders.deleteConfirmTitle', { name: folder.name })}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('folders.deleteConfirmDescription')}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={() => handleDeleteFolder(folder.id)}>
                        {tc('delete')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
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
                  placeholder={t('folders.namePlaceholder')}
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
                {t('folders.new')}
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
            {tc('refresh')}
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
            <p className="text-sm font-medium">{uploading ? t('upload.uploading') : t('upload.prompt')}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t('upload.limits', { formats: 'JPG, PNG, GIF, WebP, PDF, MP4', size: '10 MB' })}</p>
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
            <p className="text-sm">{t('library.empty')}</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground mb-4">{t('library.fileCount', { count: files.length })}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {files.map((file) => (
                <div key={file.filename}
                  className="rounded-lg border border-border overflow-hidden bg-card hover:bg-muted/30 transition-colors">
                  {/* Thumbnail */}
                  {isImage(file.filename) ? (
                    <a href={file.url} target="_blank" rel="noopener noreferrer" className="relative block">
                      {/* A small square variant (cropped around the focal point) instead of the full original. */}
                      <img
                        src={transformUrl(file.filename, { w: 256, h: 256, fit: 'cover', focalX: file.focalX, focalY: file.focalY })}
                        alt={file.originalName || file.filename}
                        loading="lazy"
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
                      {file.folderId && (
                        <span className="inline-block text-[10px] bg-indigo-500/10 text-indigo-400 rounded px-1.5 py-0.5 truncate max-w-[90px]">
                          📁 {folders.find((f) => f.id === file.folderId)?.name ?? t('folders.folder')}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1.5 items-center">
                      <Button type="button" variant="outline" size="sm"
                        onClick={() => handleCopyUrl(file.webpUrl || file.url)}
                        className="flex-1 h-7 text-xs gap-1"
                        title={file.webpUrl ? t('library.copyWebpUrl') : t('library.copyUrl')}>
                        <Copy className="h-3 w-3" />{file.webpUrl ? 'WebP' : tc('copy')}
                      </Button>

                      {canEdit && isImage(file.filename) && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setFocalFile(file)}
                          className="h-7 text-xs px-2"
                          title={file.focalX != null ? t('library.focalPointAt', { x: file.focalX, y: file.focalY ?? 0 }) : t('library.setFocalPoint')}
                        >
                          <Crosshair className={cn('h-3 w-3', file.focalX != null ? 'text-indigo-400' : 'text-muted-foreground')} />
                        </Button>
                      )}

                      {/* Move to Folder Button */}
                      {canEdit && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setMovingFile(file);
                            setTargetFolderId(file.folderId ? String(file.folderId) : 'unfiled');
                          }}
                          className="h-7 text-xs px-2"
                          title={t('library.moveToFolder')}
                        >
                          <FolderInput className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                        </Button>
                      )}

                      {canEdit && (
                        <AlertDialog>
                          <AlertDialogTrigger render={
                            <Button variant="ghost" size="icon-xs" title={tc('delete')}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 w-7" />
                          }>
                            <Trash2 className="h-3 w-3" />
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t('library.deleteConfirmTitle')}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {t.rich('library.deleteConfirmDescription', {
                                  name: file.originalName || file.filename,
                                  strong: (chunks) => <span className="font-medium">{chunks}</span>,
                                })}{file.webpUrl && ` ${t('library.deleteConfirmWebp')}`}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
                              <AlertDialogAction variant="destructive" onClick={() => handleDelete(file.filename)}>
                                {tc('delete')}
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

      {/* ── Rename Folder Dialog ──────────────────────────────────────────────── */}
      <Dialog open={editingFolder !== null} onOpenChange={(open) => !open && setEditingFolder(null)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleRenameFolder}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-semibold">
                <Pencil className="h-4 w-4 text-indigo-400" />
                {t('renameDialog.title')}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {t('renameDialog.description', { name: editingFolder?.name ?? '' })}
              </DialogDescription>
            </DialogHeader>

            <div className="py-4">
              <Label htmlFor="rename-folder-input" className="text-xs font-medium mb-1.5 block">
                {t('renameDialog.label')}
              </Label>
              <Input
                id="rename-folder-input"
                autoFocus
                value={editFolderName}
                onChange={(e) => setEditFolderName(e.target.value)}
                placeholder={t('folders.namePlaceholder')}
                className="h-9 text-sm"
              />
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditingFolder(null)}>
                {tc('cancel')}
              </Button>
              <Button type="submit" size="sm" disabled={renamingFolder || !editFolderName.trim()}>
                {renamingFolder && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                {t('renameDialog.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Move File to Folder Dialog ─────────────────────────────────────────── */}
      <FocalPointDialog
        file={focalFile}
        onClose={() => setFocalFile(null)}
        onSaved={(filename, focalX, focalY) =>
          setFiles((prev) => prev.map((f) => (f.filename === filename ? { ...f, focalX, focalY } : f)))
        }
      />

      <Dialog open={movingFile !== null} onOpenChange={(open) => !open && setMovingFile(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <FolderInput className="h-4 w-4 text-indigo-400" />
              {t('moveDialog.title')}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {t.rich('moveDialog.description', {
                name: movingFile?.originalName || movingFile?.filename || '',
                strong: (chunks) => <span className="font-semibold text-foreground">{chunks}</span>,
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-3">
            <Label className="text-xs font-medium block">{t('moveDialog.destination')}</Label>
            <Select value={targetFolderId} onValueChange={(val) => setTargetFolderId(val ?? 'unfiled')}>
              <SelectTrigger className="w-full h-9 text-xs">
                <SelectValue placeholder={t('moveDialog.selectFolder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unfiled">📁 {t('moveDialog.unfiledRoot')}</SelectItem>
                {folders.map((f) => (
                  <SelectItem key={f.id} value={String(f.id)}>
                    📁 {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setMovingFile(null)}>
              {tc('cancel')}
            </Button>
            <Button type="button" size="sm" onClick={handleMoveFile} disabled={movingLoading}>
              {movingLoading && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              {t('moveDialog.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
