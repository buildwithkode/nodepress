'use client';

import { useEffect, useRef, useState } from 'react';
import { Upload, Copy, Trash2, File, RefreshCw, Loader2 } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import api from '../../../lib/axios';

interface MediaFile {
  filename: string;
  url: string;
  size: number;
  createdAt: string;
}

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];

const isImage = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return IMAGE_EXTS.includes(ext);
};

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function MediaPage() {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const res = await api.get('/media');
      setFiles(res.data);
    } catch {
      toast.error('Failed to load media files');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleDelete = async (filename: string) => {
    try {
      await api.delete(`/media/${filename}`);
      toast.success('File deleted');
      fetchFiles();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success('URL copied to clipboard');
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
      toast.success(`${file.name} uploaded`);
      fetchFiles();
    } catch {
      toast.error(`${file.name} upload failed`);
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    selected.forEach(uploadFile);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    dropped.forEach(uploadFile);
  };

  return (
    <div>
      {/* Refresh */}
      <div className="flex justify-end mb-6">
        <Button variant="outline" onClick={fetchFiles}>
          <RefreshCw className="h-4 w-4 mr-1.5" />
          Refresh
        </Button>
      </div>

      {/* Upload Zone */}
      <div
        onClick={() => !uploading && fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'mb-8 border-2 border-dashed rounded-lg flex flex-col items-center justify-center py-12 px-6 cursor-pointer transition-colors select-none',
          dragOver
            ? 'border-blue-500 bg-blue-500/10'
            : uploading
            ? 'border-border bg-muted/30 cursor-not-allowed opacity-60'
            : 'border-border bg-card hover:border-blue-500/50 hover:bg-blue-500/5',
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.mp4"
          className="hidden"
          onChange={handleFileChange}
          disabled={uploading}
        />
        {uploading ? (
          <Loader2 className="h-10 w-10 text-blue-400 animate-spin mb-3" />
        ) : (
          <Upload className="h-10 w-10 text-muted-foreground mb-3" />
        )}
        <p className="text-sm font-medium text-foreground">
          {uploading ? 'Uploading…' : 'Click or drag files here to upload'}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Supports images (JPG, PNG, GIF, WebP), PDF, MP4 — Max 10MB
        </p>
      </div>

      {/* Media Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border overflow-hidden">
              <Skeleton className="h-36 w-full rounded-none" />
              <div className="p-2.5 space-y-2">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : files.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm">No files uploaded yet</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-4">
            {files.length} file{files.length !== 1 ? 's' : ''}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {files.map((file) => (
              <div
                key={file.filename}
                className="rounded-lg border border-border overflow-hidden bg-card hover:bg-muted/30 transition-colors"
              >
                {/* Thumbnail */}
                {isImage(file.filename) ? (
                  <a href={file.url} target="_blank" rel="noopener noreferrer">
                    <img
                      src={file.url}
                      alt={file.filename}
                      className="w-full h-36 object-cover block"
                    />
                  </a>
                ) : (
                  <div className="h-36 flex items-center justify-center bg-muted/50">
                    <File className="h-12 w-12 text-muted-foreground" />
                  </div>
                )}

                {/* Info */}
                <div className="p-2.5">
                  <p
                    className="text-xs text-foreground truncate mb-1.5"
                    title={file.filename}
                  >
                    {file.filename}
                  </p>
                  <span className="inline-block text-[10px] bg-secondary text-muted-foreground rounded px-1.5 py-0.5 mb-2">
                    {formatSize(file.size)}
                  </span>

                  {/* Actions */}
                  <div className="flex gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyUrl(file.url)}
                      title="Copy URL"
                      className="flex-1 h-7 text-xs gap-1"
                    >
                      <Copy className="h-3 w-3" />
                      Copy
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            title="Delete"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          />
                        }
                      >
                        <Trash2 className="h-3 w-3" />
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete file?</AlertDialogTitle>
                          <AlertDialogDescription>
                            <span className="font-medium">{file.filename}</span> will be permanently
                            deleted and cannot be recovered.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            onClick={() => handleDelete(file.filename)}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
