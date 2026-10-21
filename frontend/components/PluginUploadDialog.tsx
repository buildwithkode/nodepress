'use client';

import React, { useRef, useState } from 'react';
import Cookies from 'js-cookie';
import { AlertTriangle, BadgeCheck, FileArchive, Loader2, ShieldAlert, ShieldCheck, Upload, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

/** What POST /api/plugins/packages?dryRun=true says about a package. */
export interface PackageReview {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  homepage: string | null;
  permissions: string[];
  permissionDetails: Array<{ name: string; description: string }>;
  nodepress: string;
  signature: 'trusted' | 'untrusted' | 'unsigned' | 'invalid';
  signerKeyId: string | null;
  files: number;
  action: 'install' | 'update' | 'reinstall' | 'downgrade';
  currentVersion: string | null;
  problems: string[];
  warnings: string[];
  installable: boolean;
}

/** The upload goes through fetch: the axios instance defaults to a JSON body. */
async function postPackage(file: File, dryRun: boolean): Promise<PackageReview> {
  const body = new FormData();
  body.append('file', file);
  const res = await fetch(`/api/plugins/packages${dryRun ? '?dryRun=true' : ''}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${Cookies.get('np_token') ?? ''}` },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = Array.isArray(data.message) ? data.message.join(', ') : data.message;
    throw new Error(res.status === 413 ? 'The file is too large.' : msg || `Upload failed (${res.status})`);
  }
  return data;
}

const ACTION_LABEL: Record<PackageReview['action'], string> = {
  install: 'Install',
  update: 'Update',
  reinstall: 'Reinstall',
  downgrade: 'Downgrade',
};

function SignatureLine({ review }: { review: PackageReview }) {
  const key = review.signerKeyId && <span className="font-mono text-muted-foreground/80"> · key {review.signerKeyId}</span>;
  switch (review.signature) {
    case 'trusted':
      return <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400"><ShieldCheck className="w-4 h-4" />Signed by a trusted publisher{key}</span>;
    case 'untrusted':
      return <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400"><ShieldAlert className="w-4 h-4" />Signed by a key this server doesn&apos;t trust{key}</span>;
    case 'invalid':
      return <span className="flex items-center gap-1.5 text-destructive"><XCircle className="w-4 h-4" />Invalid signature — changed after signing{key}</span>;
    default:
      return <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400"><ShieldAlert className="w-4 h-4" />Not signed</span>;
  }
}

export function PluginUploadDialog({
  open,
  onOpenChange,
  maxUploadMb,
  onInstalled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  maxUploadMb: number;
  onInstalled: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [review, setReview] = useState<PackageReview | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setFile(null);
    setReview(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const choose = async (picked: File | undefined) => {
    reset();
    if (!picked) return;
    setFile(picked);
    if (picked.size > maxUploadMb * 1024 * 1024) {
      setError(`The file is ${(picked.size / 1024 / 1024).toFixed(1)} MB — plugins can be at most ${maxUploadMb} MB.`);
      return;
    }
    setChecking(true);
    try {
      setReview(await postPackage(picked, true));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setChecking(false);
    }
  };

  const install = async () => {
    if (!file || !review) return;
    setInstalling(true);
    try {
      await postPackage(file, false);
      toast.success(`${review.name} ${review.version} ${review.action === 'install' ? 'installed' : 'uploaded'} — restart the server to load it`);
      onInstalled();
      onOpenChange(false);
      reset();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Upload plugin</DialogTitle>
          <DialogDescription>
            Choose a plugin <span className="font-mono">.zip</span> (up to {maxUploadMb} MB). It&apos;s checked before anything
            is installed, and loads after a server restart.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(e) => choose(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={checking || installing}
          className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-4 text-left transition hover:border-primary/50 hover:bg-muted/50 disabled:opacity-60"
        >
          {checking ? <Loader2 className="w-5 h-5 animate-spin text-primary" /> : <FileArchive className="w-5 h-5 text-muted-foreground" />}
          <span className="text-sm">
            {file ? <span className="font-medium text-foreground">{file.name}</span> : <span className="text-muted-foreground">Choose a .zip file…</span>}
            {checking && <span className="block text-xs text-muted-foreground">Checking package…</span>}
          </span>
        </button>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <XCircle className="w-4 h-4 shrink-0 mt-px" />
            <span>{error}</span>
          </div>
        )}

        {review && (
          <div className="space-y-3 rounded-lg border border-border p-4 text-xs">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-semibold text-foreground">{review.name}</span>
                <span className="font-mono px-1.5 py-0.5 rounded bg-muted border border-border/50">v{review.version}</span>
                {review.currentVersion && (
                  <span className="text-muted-foreground">installed: v{review.currentVersion}</span>
                )}
              </div>
              <div className="text-muted-foreground mt-0.5">
                by {review.author} · works with NodePress <span className="font-mono">{review.nodepress}</span> · {review.files} files
              </div>
              {review.description && <p className="mt-2 text-muted-foreground">{review.description}</p>}
            </div>

            <SignatureLine review={review} />

            <div>
              <div className="font-medium text-foreground mb-1">It asks permission to:</div>
              {review.permissionDetails.length ? (
                <ul className="space-y-1">
                  {review.permissionDetails.map((p) => (
                    <li key={p.name} className="flex gap-2">
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 h-fit">{p.name}</span>
                      <span className="text-muted-foreground">{p.description}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-muted-foreground">Nothing beyond running inside the server.</span>
              )}
            </div>

            {review.problems.map((p) => (
              <div key={p} className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive">
                <XCircle className="w-4 h-4 shrink-0 mt-px" /><span>{p}</span>
              </div>
            ))}
            {review.warnings.map((w) => (
              <div key={w} className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-px" /><span>{w}</span>
              </div>
            ))}
            {review.installable && (
              <p className="flex items-start gap-1.5 text-muted-foreground">
                <BadgeCheck className="w-4 h-4 shrink-0 text-emerald-500" />
                Plugins run inside the server with full access to it. {review.action === 'install'
                  ? 'It will be installed disabled — turn it on after the restart.'
                  : 'It keeps its current on/off state and settings.'}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={installing}>Cancel</Button>
          <Button onClick={install} disabled={!review?.installable || installing || checking}>
            {installing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Upload className="w-4 h-4 mr-1.5" />}
            {review ? `${ACTION_LABEL[review.action]} ${review.name}` : 'Install'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
