'use client';

import React, { useRef, useState } from 'react';
import Cookies from 'js-cookie';
import { AlertTriangle, BadgeCheck, FileArchive, Loader2, ShieldAlert, ShieldCheck, Upload, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useTranslations } from 'use-intl';

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
async function postPackage(
  file: File,
  dryRun: boolean,
  fallback: { tooLarge: string; failed: (status: number) => string },
): Promise<PackageReview> {
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
    throw new Error(res.status === 413 ? fallback.tooLarge : msg || fallback.failed(res.status));
  }
  return data;
}

function SignatureLine({ review }: { review: PackageReview }) {
  const t = useTranslations('developer');
  const key = review.signerKeyId && <span className="font-mono text-muted-foreground/80"> · {t('pluginUpload.signerKey', { id: review.signerKeyId })}</span>;
  switch (review.signature) {
    case 'trusted':
      return <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400"><ShieldCheck className="w-4 h-4" />{t('pluginUpload.sigTrusted')}{key}</span>;
    case 'untrusted':
      return <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400"><ShieldAlert className="w-4 h-4" />{t('pluginUpload.sigUntrusted')}{key}</span>;
    case 'invalid':
      return <span className="flex items-center gap-1.5 text-destructive"><XCircle className="w-4 h-4" />{t('pluginUpload.sigInvalid')}{key}</span>;
    default:
      return <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400"><ShieldAlert className="w-4 h-4" />{t('pluginUpload.sigNone')}</span>;
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
  const t = useTranslations('developer');
  const tc = useTranslations('common');
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [review, setReview] = useState<PackageReview | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fallback = {
    tooLarge: t('pluginUpload.tooLarge'),
    failed: (status: number) => t('pluginUpload.uploadFailed', { status }),
  };

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
      setError(t('pluginUpload.fileTooBig', { size: (picked.size / 1024 / 1024).toFixed(1), max: maxUploadMb }));
      return;
    }
    setChecking(true);
    try {
      setReview(await postPackage(picked, true, fallback));
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
      await postPackage(file, false, fallback);
      toast.success(review.action === 'install'
        ? t('pluginUpload.installedToast', { name: review.name, version: review.version })
        : t('pluginUpload.uploadedToast', { name: review.name, version: review.version }));
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
          <DialogTitle>{t('pluginUpload.title')}</DialogTitle>
          <DialogDescription>
            {t.rich('pluginUpload.description', {
              max: maxUploadMb,
              ext: '.zip',
              mono: (chunks) => <span className="font-mono">{chunks}</span>,
            })}
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
            {file ? <span className="font-medium text-foreground">{file.name}</span> : <span className="text-muted-foreground">{t('pluginUpload.chooseFile')}</span>}
            {checking && <span className="block text-xs text-muted-foreground">{t('pluginUpload.checking')}</span>}
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
                  <span className="text-muted-foreground">{t('pluginUpload.installedVersion', { version: review.currentVersion })}</span>
                )}
              </div>
              <div className="text-muted-foreground mt-0.5">
                {t.rich('pluginUpload.meta', {
                  author: review.author,
                  range: review.nodepress,
                  files: review.files,
                  mono: (chunks) => <span className="font-mono">{chunks}</span>,
                })}
              </div>
              {review.description && <p className="mt-2 text-muted-foreground">{review.description}</p>}
            </div>

            <SignatureLine review={review} />

            <div>
              <div className="font-medium text-foreground mb-1">{t('pluginUpload.asksPermission')}</div>
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
                <span className="text-muted-foreground">{t('pluginUpload.noPermissions')}</span>
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
                {t('pluginUpload.fullAccess')} {review.action === 'install'
                  ? t('pluginUpload.installedDisabled')
                  : t('pluginUpload.keepsState')}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={installing}>{tc('cancel')}</Button>
          <Button onClick={install} disabled={!review?.installable || installing || checking}>
            {installing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Upload className="w-4 h-4 mr-1.5" />}
            {review ? t(`pluginUpload.actions.${review.action}`, { name: review.name }) : t('pluginUpload.install')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
