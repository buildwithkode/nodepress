'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useLocale, useTranslations } from 'use-intl';
import { ArrowRight, Download, ExternalLink, Loader2, Pencil, Plus, Signpost, Trash2, Upload, XCircle } from 'lucide-react';
import api from '@/lib/axios';
import { useAuth } from '@/context/AuthContext';
import { canPublishContent } from '@/lib/roles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchInput } from '@/components/ui/search-input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface Redirect {
  id: number;
  from: string;
  to: string;
  statusCode: number;
  hits: number;
  lastHitAt: string | null;
  createdAt: string;
}

interface ImportReport {
  dryRun: boolean;
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  errors: Array<{ line: number; from: string; message: string }>;
  applied: boolean;
}

const STATUS_CODES = [301, 302, 307, 308, 410] as const;
const PAGE_SIZE = 50;

const apiError = (err: any, fallback: string) => {
  const msg = err?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : msg || fallback;
};

/** Redirects manager — 301/302/307/308/410 rules a site resolves through GET /api/redirects/resolve. */
export default function RedirectsPage() {
  const t = useTranslations('redirects');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { user } = useAuth();
  const canEdit = canPublishContent(user?.role);

  const [rows, setRows] = useState<Redirect[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('createdAt');
  const [forbidden, setForbidden] = useState(false);

  const [editing, setEditing] = useState<Redirect | 'new' | null>(null);
  const [form, setForm] = useState({ from: '', to: '', statusCode: '301' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const [importCsv, setImportCsv] = useState<string | null>(null);
  const [importName, setImportName] = useState('');
  const [report, setReport] = useState<ImportReport | null>(null);
  const [importing, setImporting] = useState(false);

  // Search as you type, without a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(id);
  }, [search]);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/redirects', { params: { page, limit: PAGE_SIZE, search: query || undefined, sort } });
      setRows(res.data.data);
      setTotal(res.data.meta.total);
      setTotalPages(res.data.meta.totalPages);
    } catch (err: any) {
      if (err?.response?.status === 403) setForbidden(true);
      else toast.error(apiError(err, t('loadFailed')));
      setRows([]);
    }
  }, [page, query, sort]);
  useEffect(() => { load(); }, [load]);

  const openEditor = (r: Redirect | 'new') => {
    setEditing(r);
    setFormError(null);
    setForm(r === 'new' ? { from: '', to: '', statusCode: '301' } : { from: r.from, to: r.to, statusCode: String(r.statusCode) });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setFormError(null);
    const body = { from: form.from, to: form.statusCode === '410' ? '' : form.to, statusCode: Number(form.statusCode) };
    try {
      if (editing === 'new') await api.post('/redirects', body);
      else await api.patch(`/redirects/${editing.id}`, body);
      toast.success(editing === 'new' ? t('createdToast') : t('savedToast'));
      setEditing(null);
      load();
    } catch (err: any) {
      setFormError(apiError(err, t('saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r: Redirect) => {
    try {
      await api.delete(`/redirects/${r.id}`);
      toast.success(t('deletedToast', { from: r.from }));
      load();
    } catch (err: any) {
      toast.error(apiError(err, t('deleteFailed')));
    }
  };

  const exportCsv = async () => {
    try {
      const res = await api.get('/redirects/export', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'redirects.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(apiError(err, t('exportFailed')));
    }
  };

  const runImport = async (csv: string, dryRun: boolean) => {
    setImporting(true);
    try {
      const res = await api.post('/redirects/import', { csv, dryRun });
      setReport(res.data);
      if (res.data.applied) {
        toast.success(t('import.appliedToast', { created: res.data.created, updated: res.data.updated }));
        setImportCsv(null);
        setReport(null);
        load();
      }
    } catch (err: any) {
      toast.error(apiError(err, t('import.failed')));
    } finally {
      setImporting(false);
    }
  };

  const pickFile = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    const text = await file.text();
    setImportName(file.name);
    setImportCsv(text);
    setReport(null);
    runImport(text, true);
  };

  const statusLabel = (code: number) => t(`statuses.s${code}` as any);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Signpost className="h-6 w-6" />{t('title')}</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{t('description')}</p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4 mr-1.5" />{t('importCsv')}</Button>
            <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4 mr-1.5" />{t('exportCsv')}</Button>
            <Button size="sm" onClick={() => openEditor('new')}><Plus className="h-4 w-4 mr-1.5" />{t('add')}</Button>
          </div>
        )}
      </div>

      {forbidden ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{t('forbidden')}</CardContent></Card>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
            <div className="w-full sm:w-80">
              <SearchInput placeholder={t('searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={sort} onValueChange={(v) => { if (v) { setSort(v); setPage(1); } }}>
              <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="createdAt">{t('sort.newest')}</SelectItem>
                <SelectItem value="hits">{t('sort.mostHits')}</SelectItem>
                <SelectItem value="from">{t('sort.from')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {rows === null ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : rows.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{query ? t('noMatch', { query }) : t('empty')}</CardContent></Card>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('columns.from')}</TableHead>
                  <TableHead>{t('columns.to')}</TableHead>
                  <TableHead className="w-28">{tc('status')}</TableHead>
                  <TableHead className="w-32 text-right">{t('columns.hits')}</TableHead>
                  {canEdit && <TableHead className="w-24 text-right">{tc('actions')}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs break-all">{r.from}</TableCell>
                    <TableCell className="font-mono text-xs break-all">
                      {r.statusCode === 410 ? (
                        <span className="text-muted-foreground">{t('goneTarget')}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />{r.to}
                          {/^https?:\/\//i.test(r.to) && (
                            <a href={r.to} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground" aria-label={t('openTarget')}>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted font-mono" title={statusLabel(r.statusCode)}>{r.statusCode}</span>
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      <div className="font-medium">{r.hits.toLocaleString(locale)}</div>
                      <div className="text-muted-foreground">
                        {r.lastHitAt ? t('lastHit', { date: new Date(r.lastHitAt).toLocaleDateString(locale) }) : t('neverHit')}
                      </div>
                    </TableCell>
                    {canEdit && (
                      <TableCell className="text-right whitespace-nowrap">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditor(r)} aria-label={tc('edit')}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger render={<Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" aria-label={tc('delete')} />}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
                              <AlertDialogDescription>{t('deleteDescription', { from: r.from })}</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
                              <AlertDialogAction variant="destructive" onClick={() => remove(r)}>{tc('delete')}</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {rows && rows.length > 0 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t('count', { count: total })}</span>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{tc('previous')}</Button>
                  <span>{tc('page', { page, total: totalPages })}</span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>{tc('next')}</Button>
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {t.rich('autoHint', { mono: (chunks) => <span className="font-mono">{chunks}</span> })}
          </p>
        </>
      )}

      {/* Add / edit */}
      <Dialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={save} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{editing === 'new' ? t('dialog.addTitle') : t('dialog.editTitle')}</DialogTitle>
              <DialogDescription>{t('dialog.description')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="rd-from">{t('columns.from')}</Label>
              <Input id="rd-from" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} placeholder="/old-page" className="font-mono" autoFocus />
              <p className="text-[11px] text-muted-foreground">{t('dialog.fromHint')}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rd-status">{tc('status')}</Label>
              <Select value={form.statusCode} onValueChange={(v) => { if (v) setForm({ ...form, statusCode: v }); }}>
                <SelectTrigger id="rd-status" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_CODES.map((c) => (
                    <SelectItem key={c} value={String(c)}>{c} · {statusLabel(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.statusCode !== '410' && (
              <div className="space-y-1.5">
                <Label htmlFor="rd-to">{t('columns.to')}</Label>
                <Input id="rd-to" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} placeholder="/new-page" className="font-mono" />
                <p className="text-[11px] text-muted-foreground">{t('dialog.toHint')}</p>
              </div>
            )}
            {formError && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <XCircle className="w-4 h-4 shrink-0 mt-px" /><span>{formError}</span>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={saving}>{tc('cancel')}</Button>
              <Button type="submit" disabled={saving || !form.from.trim() || (form.statusCode !== '410' && !form.to.trim())}>
                {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}{tc('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* CSV import review */}
      <Dialog open={importCsv !== null} onOpenChange={(o) => { if (!o) { setImportCsv(null); setReport(null); } }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('import.title')}</DialogTitle>
            <DialogDescription>
              {t.rich('import.description', { file: importName, mono: (chunks) => <span className="font-mono">{chunks}</span> })}
            </DialogDescription>
          </DialogHeader>
          {!report ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t('import.checking')}</div>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md border p-2"><div className="text-lg font-semibold">{report.created}</div><div className="text-xs text-muted-foreground">{t('import.new')}</div></div>
                <div className="rounded-md border p-2"><div className="text-lg font-semibold">{report.updated}</div><div className="text-xs text-muted-foreground">{t('import.changed')}</div></div>
                <div className="rounded-md border p-2"><div className="text-lg font-semibold">{report.unchanged}</div><div className="text-xs text-muted-foreground">{t('import.unchanged')}</div></div>
              </div>
              {report.errors.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-destructive">{t('import.errors', { count: report.errors.length })}</div>
                  <ul className="max-h-48 overflow-y-auto space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs">
                    {report.errors.map((e, i) => (
                      <li key={i}><span className="font-mono text-muted-foreground">{t('import.line', { line: e.line })}</span> {e.message}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setImportCsv(null); setReport(null); }} disabled={importing}>{tc('cancel')}</Button>
            <Button
              onClick={() => importCsv && runImport(importCsv, false)}
              disabled={!report || report.errors.length > 0 || importing || report.created + report.updated === 0}
            >
              {importing && report && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {t('import.apply', { count: report ? report.created + report.updated : 0 })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
