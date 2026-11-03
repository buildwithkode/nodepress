'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Loader2, Plus, Pencil, Trash2, Inbox, ToggleLeft, ToggleRight, Upload, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/axios';
import { useAuth } from '@/context/AuthContext';
import { canEdit as canEditModule } from '@/lib/access';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchInput } from '@/components/ui/search-input';
import { Pagination } from '@/components/ui/data-table';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogFooter, AlertDialogTitle, AlertDialogDescription,
  AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { useTranslations } from 'use-intl';

interface FormRow {
  id: number;
  name: string;
  slug: string;
  fields: unknown[];
  isActive: boolean;
  createdAt: string;
  _count: { submissions: number };
}

interface ImportPreview {
  valid: boolean;
  errors: string[];
  total: number;
  toCreate: number;
  toUpdate: number;
  toSkip: number;
}

const PAGE_SIZE = 10;

const apiError = (err: any, fallback: string): string => {
  const m = err?.response?.data?.message;
  return (Array.isArray(m) ? m.join('; ') : m) || fallback;
};

export default function FormsPage() {
  const t = useTranslations('forms');
  const tc = useTranslations('common');
  const router = useRouter();
  const { user } = useAuth();
  const canEdit = canEditModule(user, 'forms');
  const [forms, setForms]   = useState<FormRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [page, setPage]       = useState(1);
  const fileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importFile, setImportFile] = useState<{ name: string; data: unknown } | null>(null);
  const [overwrite, setOverwrite] = useState(true);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importing, setImporting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/forms');
      setForms(res.data.data);
    } catch {
      toast.error(t('list.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { setPage(1); }, [search]);

  const exportForms = async () => {
    setExporting(true);
    try {
      const res = await api.get('/forms/export');
      const url = URL.createObjectURL(new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `nodepress-forms-${res.data.exportedAt.slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(t('list.exported'));
    } catch (err) {
      toast.error(apiError(err, t('list.exportFailed')));
    } finally {
      setExporting(false);
    }
  };

  const checkImport = async (data: unknown, keepExisting: boolean) => {
    setImporting(true);
    try {
      const res = await api.post('/forms/import', data, { params: { dryRun: true, overwrite: !keepExisting } });
      setPreview(res.data);
      return true;
    } catch (err) {
      toast.error(apiError(err, t('list.importFailed')));
      return false;
    } finally {
      setImporting(false);
    }
  };

  const pickImportFile = async (file?: File) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      toast.error(t('list.importInvalid'));
      return;
    }
    setOverwrite(true);
    setPreview(null);
    if (await checkImport(data, false)) setImportFile({ name: file.name, data });
  };

  const changeOverwrite = (next: boolean) => {
    setOverwrite(next);
    if (importFile) void checkImport(importFile.data, !next);
  };

  const runImport = async () => {
    if (!importFile) return;
    setImporting(true);
    try {
      const res = await api.post('/forms/import', importFile.data, { params: { overwrite } });
      if (res.data.errors.length) toast.error(res.data.errors.join('; '));
      else toast.success(t('list.imported', { created: res.data.created, updated: res.data.updated, skipped: res.data.skipped }));
      setImportFile(null);
      await load();
    } catch (err: any) {
      const errors = err?.response?.data?.errors;
      if (Array.isArray(errors)) setPreview((p) => (p ? { ...p, valid: false, errors } : p));
      toast.error(apiError(err, t('list.importFailed')));
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/forms/${id}`);
      toast.success(t('list.deleted'));
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('list.deleteFailed'));
    }
  };

  const toggleActive = async (form: FormRow) => {
    try {
      await api.put(`/forms/${form.id}`, { isActive: !form.isActive });
      setForms((prev) => prev.map((f) => f.id === form.id ? { ...f, isActive: !f.isActive } : f));
    } catch {
      toast.error(t('list.statusFailed'));
    }
  };

  const filtered  = forms.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    f.slug.toLowerCase().includes(search.toLowerCase()),
  );
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[12rem] max-w-xs">
          <SearchInput
            placeholder={t('list.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {canEdit && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => pickImportFile(e.target.files?.[0])}
              />
              <Button variant="outline" disabled={importing} onClick={() => fileRef.current?.click()}>
                {importing && !importFile ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
                {t('list.import')}
              </Button>
            </>
          )}
          <Button variant="outline" disabled={exporting || loading || forms.length === 0} onClick={exportForms}>
            {exporting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
            {t('list.export')}
          </Button>
          {canEdit && (
            <Button onClick={() => router.push('/forms/new')}>
              <Plus className="h-4 w-4 mr-1.5" /> {t('list.newForm')}
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{tc('name')}</TableHead>
            <TableHead>{t('list.columns.slug')}</TableHead>
            <TableHead className="w-20 text-center">{t('list.columns.fields')}</TableHead>
            <TableHead className="w-24 text-center">{t('list.columns.submissions')}</TableHead>
            <TableHead className="w-20 text-center">{tc('status')}</TableHead>
            <TableHead className="w-36 text-right">{tc('actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 6 }).map((__, j) => (
                  <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                ))}
              </TableRow>
            ))
          ) : paginated.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-16 text-center text-muted-foreground">
                {search
                  ? t('list.noMatches')
                  : t('list.empty')}
              </TableCell>
            </TableRow>
          ) : paginated.map((form) => (
            <TableRow key={form.id}>
              <TableCell className="font-medium">{form.name}</TableCell>
              <TableCell>
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                  {form.slug}
                </code>
              </TableCell>
              <TableCell className="text-center">
                <Badge variant="secondary">{form.fields.length}</Badge>
              </TableCell>
              <TableCell className="text-center">
                <button
                  className="text-sm font-medium text-primary hover:underline"
                  onClick={() => router.push(`/forms/${form.id}/submissions`)}
                >
                  {form._count.submissions}
                </button>
              </TableCell>
              <TableCell className="text-center">
                {canEdit ? (
                  <button onClick={() => toggleActive(form)} title={t('list.toggleActive')}>
                    {form.isActive
                      ? <ToggleRight className="h-5 w-5 text-emerald-400 mx-auto" />
                      : <ToggleLeft  className="h-5 w-5 text-muted-foreground mx-auto" />}
                  </button>
                ) : (
                  form.isActive
                    ? <ToggleRight className="h-5 w-5 text-emerald-400 mx-auto opacity-50" />
                    : <ToggleLeft  className="h-5 w-5 text-muted-foreground mx-auto opacity-50" />
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  {/* Submissions */}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title={t('list.viewSubmissions')}
                    onClick={() => router.push(`/forms/${form.id}/submissions`)}
                  >
                    <Inbox className="h-3.5 w-3.5" />
                  </Button>

                  {/* Edit */}
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title={tc('edit')}
                      onClick={() => router.push(`/forms/${form.id}/edit`)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}

                  {/* Delete */}
                  {canEdit && (
                    <AlertDialog>
                      <AlertDialogTrigger render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title={tc('delete')}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        />
                      }>
                        <Trash2 className="h-3.5 w-3.5" />
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('list.deleteConfirmTitle', { name: form.name })}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t.rich('list.deleteConfirmDescription', {
                              count: form._count.submissions,
                              strong: (chunks) => <strong>{chunks}</strong>,
                            })}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
                          <AlertDialogAction variant="destructive" onClick={() => handleDelete(form.id)}>
                            {tc('delete')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Pagination total={filtered.length} page={page} pageSize={PAGE_SIZE} onPage={setPage} />

      <Dialog open={!!importFile} onOpenChange={(open) => { if (!open && !importing) setImportFile(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('list.importTitle')}</DialogTitle>
            <DialogDescription className="break-all">{importFile?.name}</DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="space-y-3 text-sm">
              <p>{t('list.importSummary', { toCreate: preview.toCreate, toUpdate: preview.toUpdate, toSkip: preview.toSkip })}</p>
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox checked={overwrite} disabled={importing} onCheckedChange={(v) => changeOverwrite(v === true)} className="mt-0.5" />
                <span>
                  {t('list.importOverwrite')}
                  <span className="block text-xs text-muted-foreground">{t('list.importOverwriteHint')}</span>
                </span>
              </label>
              <p className="text-xs text-muted-foreground">{t('list.importNote')}</p>
              {preview.errors.length > 0 && (
                <div className="space-y-1 text-destructive">
                  <p className="flex items-center gap-1.5 font-medium">
                    <XCircle className="h-4 w-4 shrink-0" />
                    {t('list.importProblems', { count: preview.errors.length })}
                  </p>
                  <ul className="max-h-40 overflow-y-auto space-y-1 pl-6 text-xs">
                    {preview.errors.map((e) => <li key={e} className="break-words">{e}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={importing} onClick={() => setImportFile(null)}>{tc('cancel')}</Button>
            <Button
              disabled={importing || !preview?.valid || !(preview.toCreate + preview.toUpdate)}
              onClick={runImport}
            >
              {importing && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {t('list.importConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
