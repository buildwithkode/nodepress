'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Download, FileUp, Loader2, XCircle } from 'lucide-react';
import { useTranslations } from 'use-intl';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

type TypePlan = { name: string; total: number; toCreate: number; toUpdate: number; toRestore: number; toSkip: number };
type Preview = {
  valid: boolean;
  errors: string[];
  schemas: { toCreate: number; toUpdate: number } | null;
  entries: { total: number; toCreate: number; toUpdate: number; toRestore: number; toSkip: number; relinked: number; types: TypePlan[] };
  localesToAdd: string[];
};
type Result = {
  schemas: { created?: number; updated?: number } | null;
  entries: { created: number; updated: number };
  localesAdded: string[];
  errors: string[];
};

const fileSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const message = (err: any, fallback: string) => {
  const m = err?.response?.data?.message;
  return Array.isArray(m) ? m.join('; ') : m || fallback;
};

/** Whole-site export / import (admin only): GET /api/site/export, POST /api/site/import. */
export default function SiteTransferPage() {
  const t = useTranslations('siteTransfer');
  const inputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [bundle, setBundle] = useState<unknown>(null);
  const [overwrite, setOverwrite] = useState(true);
  const [busy, setBusy] = useState<'check' | 'import' | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const download = async () => {
    setExporting(true);
    try {
      const res = await api.get('/site/export');
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nodepress-site-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t('exported'));
    } catch (err) {
      toast.error(message(err, t('exportFailed')));
    } finally {
      setExporting(false);
    }
  };

  const pick = async (f: File | null) => {
    setFile(f);
    setBundle(null);
    setPreview(null);
    setResult(null);
    if (!f) return;
    try {
      const parsed = JSON.parse(await f.text());
      if (parsed?.format !== 'nodepress-site') throw new Error('format');
      setBundle(parsed);
    } catch {
      toast.error(t('invalidFile'));
    }
  };

  const send = (dryRun: boolean) =>
    api.post(`/site/import?dryRun=${dryRun}&overwrite=${overwrite}`, bundle, { timeout: 0 });

  const check = async () => {
    setBusy('check');
    setResult(null);
    try {
      setPreview((await send(true)).data);
    } catch (err) {
      setPreview(null);
      toast.error(message(err, t('importFailed')));
    } finally {
      setBusy(null);
    }
  };

  const run = async () => {
    setBusy('import');
    try {
      const r: Result = (await send(false)).data;
      setResult(r);
      setPreview(null);
      if (r.errors.length) toast.warning(t('writeErrors'));
      else toast.success(t('done', { created: r.entries.created, updated: r.entries.updated }));
    } catch (err) {
      toast.error(message(err, t('importFailed')));
    } finally {
      setBusy(null);
    }
  };

  const th = 'text-left px-3 py-2 font-medium text-muted-foreground';

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('intro')}</p>
        <p className="text-sm text-muted-foreground mt-1">{t('mediaNote')}</p>
      </div>

      <section className="rounded-xl border border-border p-4 sm:p-5 space-y-3">
        <h2 className="font-medium">{t('exportTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('exportText')}</p>
        <Button onClick={download} disabled={exporting}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} {t('exportButton')}
        </Button>
      </section>

      <section className="rounded-xl border border-border p-4 sm:p-5 space-y-4">
        <h2 className="font-medium">{t('importTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('importText')}</p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => { void pick(e.target.files?.[0] ?? null); e.target.value = ''; }}
          />
          <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={busy !== null}>
            <FileUp className="h-4 w-4" /> {file ? t('changeFile') : t('chooseFile')}
          </Button>
          <span className="text-sm text-muted-foreground truncate max-w-full">
            {file ? `${file.name} · ${fileSize(file.size)}` : t('noFile')}
          </span>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={overwrite}
            onCheckedChange={(v) => { setOverwrite(v === true); setPreview(null); }}
            disabled={busy !== null}
            className="mt-0.5"
          />
          <span>
            {t('overwrite')}
            <span className="block text-xs text-muted-foreground">{t('overwriteHint')}</span>
          </span>
        </label>
        <Button onClick={check} disabled={!bundle || busy !== null}>
          {busy === 'check' && <Loader2 className="h-4 w-4 animate-spin" />} {t('check')}
        </Button>
        <p className="text-xs text-muted-foreground">
          {t.rich('cliHint', { code: (chunks) => <code className="font-mono">{chunks}</code> })}
        </p>
      </section>

      {preview && (
        <section className="rounded-xl border border-border p-4 sm:p-5 space-y-4">
          <h2 className="font-medium">{t('previewTitle')}</h2>
          {preview.schemas && (
            <p className="text-sm">{t('typesLine', { toCreate: preview.schemas.toCreate, toUpdate: preview.schemas.toUpdate })}</p>
          )}
          <p className="text-sm">
            {t('entriesLine', {
              toCreate: preview.entries.toCreate,
              toUpdate: preview.entries.toUpdate,
              toRestore: preview.entries.toRestore,
              toSkip: preview.entries.toSkip,
            })}
          </p>
          {preview.entries.types.length > 0 && (
            <div className="rounded-lg border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b border-border">
                    <th className={th}>{t('colType')}</th>
                    <th className={th}>{t('colNew')}</th>
                    <th className={th}>{t('colUpdate')}</th>
                    <th className={`${th} hidden sm:table-cell`}>{t('colRestore')}</th>
                    <th className={th}>{t('colKept')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {preview.entries.types.map((tp) => (
                    <tr key={tp.name}>
                      <td className="px-3 py-2"><code className="text-xs font-mono">{tp.name}</code></td>
                      <td className="px-3 py-2">{tp.toCreate}</td>
                      <td className="px-3 py-2">{tp.toUpdate}</td>
                      <td className="px-3 py-2 hidden sm:table-cell">{tp.toRestore}</td>
                      <td className="px-3 py-2 text-muted-foreground">{tp.toSkip}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {preview.entries.relinked > 0 && (
            <p className="text-xs text-muted-foreground">{t('relinked', { count: preview.entries.relinked })}</p>
          )}
          {preview.localesToAdd.length > 0 && (
            <p className="text-sm">{t('localesToAdd', { list: preview.localesToAdd.join(', ') })}</p>
          )}
          {preview.errors.length > 0 ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1 text-sm">
              <p className="flex gap-2 font-medium">
                <XCircle className="h-4 w-4 shrink-0 text-destructive mt-0.5" /> {t('problems', { count: preview.errors.length })}
              </p>
              <ul className="space-y-1 pl-6">
                {preview.errors.slice(0, 50).map((e) => <li key={e} className="break-words">{e}</li>)}
              </ul>
              {preview.errors.length > 50 && <p className="pl-6 text-muted-foreground">{t('moreProblems', { count: preview.errors.length - 50 })}</p>}
            </div>
          ) : (
            <Button onClick={run} disabled={busy !== null}>
              {busy === 'import' && <Loader2 className="h-4 w-4 animate-spin" />} {t('importButton')}
            </Button>
          )}
        </section>
      )}

      {result && (
        <section className="rounded-xl border border-border p-4 sm:p-5 space-y-2 text-sm">
          <p className="flex gap-2 font-medium">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
            {t('done', { created: result.entries.created, updated: result.entries.updated })}
          </p>
          {result.schemas && (
            <p className="text-muted-foreground">{t('doneTypes', { created: result.schemas.created ?? 0, updated: result.schemas.updated ?? 0 })}</p>
          )}
          {result.localesAdded.length > 0 && (
            <p className="text-muted-foreground">{t('localesAdded', { list: result.localesAdded.join(', ') })}</p>
          )}
          {result.errors.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-1">
              <p className="flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" /> {t('writeErrors')}</p>
              <ul className="space-y-1 pl-6">{result.errors.map((e) => <li key={e} className="break-words">{e}</li>)}</ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
