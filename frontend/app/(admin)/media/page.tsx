'use client';

import { useEffect, useRef, useState } from 'react';
import { Upload, Copy, Trash2, File, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import Cookies from 'js-cookie';
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
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-foreground">Media Library</h1>
        <Button variant="outline" size="sm" onClick={fetchFiles}>
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
            ? 'border-blue-400 bg-blue-50'
            : uploading
            ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
            : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50/40',
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
          <Loader2 className="h-10 w-10 text-blue-500 animate-spin mb-3" />
        ) : (
          <Upload className="h-10 w-10 text-gray-400 mb-3" />
        )}
        <p className="text-sm font-medium text-gray-700">
          {uploading ? 'Uploading…' : 'Click or drag files here to upload'}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Supports images (JPG, PNG, GIF, WebP), PDF, MP4 — Max 10MB
        </p>
      </div>

      {/* Media Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-gray-200 overflow-hidden animate-pulse">
              <div className="h-36 bg-gray-100" />
              <div className="p-2.5 space-y-2">
                <div className="h-3 bg-gray-200 rounded w-3/4" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : files.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Upload className="h-10 w-10 mx-auto mb-3 text-gray-300" />
          <p className="text-sm">No files uploaded yet</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-4">
            {files.length} file{files.length !== 1 ? 's' : ''}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {files.map((file) => (
              <div
                key={file.filename}
                className="rounded-lg border border-gray-200 overflow-hidden bg-white hover:shadow-md transition-shadow"
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
                  <div className="h-36 flex items-center justify-center bg-gray-50">
                    <File className="h-12 w-12 text-gray-300" />
                  </div>
                )}

                {/* Info */}
                <div className="p-2.5">
                  <p
                    className="text-xs text-gray-700 truncate mb-1.5"
                    title={file.filename}
                  >
                    {file.filename}
                  </p>
                  <span className="inline-block text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 mb-2">
                    {formatSize(file.size)}
                  </span>

                  {/* Actions */}
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleCopyUrl(file.url)}
                      title="Copy URL"
                      className="flex-1 flex items-center justify-center gap-1 text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      <Copy className="h-3 w-3" />
                      Copy
                    </button>

                    <AlertDialog>
                      <AlertDialogTrigger
                        title="Delete"
                        className="flex items-center justify-center px-2 py-1 rounded border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
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
                            onClick={() => handleDelete(file.filename)}
                            className="bg-red-600 hover:bg-red-700 text-white"
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
