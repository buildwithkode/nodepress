'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useTranslations } from 'use-intl';
import {
  Plus,
  ArrowRight,
  Pencil,
  Trash2,
  ArrowLeft,
  Layers,
  Copy,
  Loader2,
  CheckSquare,
  Trash,
  RotateCcw,
  X,
  Download,
  Upload,
  Link2,
  FileSpreadsheet,
  FileJson,
  CheckCircle2,
  AlertCircle,
  FileCode,
  Rocket,
  Globe,
  Send,
  Shield,
  Settings,
  Clock,
  ExternalLink,
  FileText,
  Package,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/ui/data-table';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchInput } from '@/components/ui/search-input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Card, CardHeader, CardTitle, CardDescription, CardFooter,
} from '@/components/ui/card';
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogFooter, AlertDialogTitle, AlertDialogDescription,
  AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useLocales, localeLabel } from '@/lib/locales';
import api from '@/lib/axios';
import { cn, ctLabel } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { AddToReleaseDialog } from '@/components/AddToReleaseDialog';
import { canManageContent, canManageSettings, canPublishContent } from '@/lib/roles';
import { useRealtimeEvents } from '@/lib/useRealtimeEvents';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}

function truncate(val: any, itemsLabel: (count: number) => string, max = 60): string {
  if (val === null || val === undefined) return '—';
  if (Array.isArray(val)) return itemsLabel(val.length);
  if (typeof val === 'object') {
    // ImageValue: { url, alt }
    if (typeof val.url === 'string') return val.url;
    const str = Object.entries(val)
      .filter(([k]) => k !== '_layout')
      .map(([, v]) => String(v))
      .join(', ');
    return str.length > max ? str.slice(0, max) + '…' : str;
  }
  const str = String(val);
  return str.length > max ? str.slice(0, max) + '…' : str;
}

// labelKey is in the `entries` namespace; commonKey in `common`.
const STATUS_LABELS: Record<string, { labelKey?: string; commonKey?: string; className: string }> = {
  published:      { labelKey: 'stages.production',    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800' },
  staging:        { labelKey: 'stages.staging',       className: 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-300 dark:border-purple-800' },
  pending_review: { labelKey: 'stages.pendingReview', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/40 font-medium' },
  draft:          { commonKey: 'statuses.draft',      className: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700' },
  archived:       { commonKey: 'statuses.archived',   className: 'bg-muted text-muted-foreground border border-border' },
};

interface Field { name: string; label?: string; type: string; options?: any }
interface ContentType { id: number; name: string; displayName?: string | null; schema: Field[] }
interface Entry {
  id: number; slug: string; status: string; locale?: string; contentTypeId: number;
  data: Record<string, any>; createdAt: string; updatedAt: string;
  publishAt?: string | null;
  /** Locales this entry exists in (same content type + slug). */
  translations?: string[];
}

export default function EntriesPage() {
  const t = useTranslations('entries');
  const tc = useTranslations('common');
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const canEdit = canManageContent(user?.role);
  const isAdmin = canManageSettings(user?.role);
  const ctParam     = searchParams?.get('ct')     ?? '';
  const statusParam = searchParams?.get('status') ?? '';


  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [entryCounts, setEntryCounts] = useState<Record<number, number>>({});
  const [pendingCounts, setPendingCounts] = useState<Record<number, number>>({});
  const [selectedCTPendingCount, setSelectedCTPendingCount] = useState<number>(0);
  const [loadingCTs, setLoadingCTs] = useState(true);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [duplicating, setDuplicating] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(statusParam || 'all');
  const [localeFilter, setLocaleFilter] = useState<string>('all');
  const localesConfig = useLocales();
  const SUPPORTED_LOCALES = (localesConfig?.locales ?? []).map((code) => ({ code, label: localeLabel(code) }));
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  // Bulk selection
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);

  // Trash / Recycle Bin view
  const [showTrash, setShowTrash] = useState(false);
  const [deletedCount, setDeletedCount] = useState(0);

  const selectedCT = contentTypes.find((ct) => ct.name === ctParam) ?? null;

  const fetchDeletedCount = async () => {
    if (!selectedCT) { setDeletedCount(0); return; }
    try {
      const res = await api.get('/entries', { params: { contentTypeId: selectedCT.id, deleted: true, limit: 1 } });
      setDeletedCount(res.data.meta?.total ?? (Array.isArray(res.data) ? res.data.length : 0));
    } catch {
      setDeletedCount(0);
    }
  };

  const fetchPendingCount = async () => {
    if (!selectedCT) { setSelectedCTPendingCount(0); return; }
    try {
      const res = await api.get('/entries', { params: { contentTypeId: selectedCT.id, status: 'pending_review', limit: 1 } });
      setSelectedCTPendingCount(res.data.meta?.total ?? (Array.isArray(res.data) ? res.data.length : 0));
    } catch {
      setSelectedCTPendingCount(0);
    }
  };

  /* ── Load content types + counts ───────────────────────────────────────── */
  useEffect(() => {
    let mounted = true;
    setLoadingCTs(true);

    const loadData = async () => {
      try {
        const [ctRes, countsRes] = await Promise.all([
          api.get('/content-types'),
          api.get('/entries/counts').catch(() => null),
        ]);
        if (!mounted) return;

        const cts: ContentType[] = ctRes.data || [];
        setContentTypes(cts);

        if (countsRes?.data?.totals) {
          setEntryCounts(countsRes.data.totals);
          setPendingCounts(countsRes.data.pending || {});
        } else {
          // Fallback to individual counts
          const counts = await Promise.all(
            cts.map(async (ct) => {
              const [totalRes, pendingRes] = await Promise.all([
                api.get('/entries', { params: { contentTypeId: ct.id, limit: 1 } }).catch(() => ({ data: { meta: { total: 0 } } })),
                api.get('/entries', { params: { contentTypeId: ct.id, status: 'pending_review', limit: 1 } }).catch(() => ({ data: { meta: { total: 0 } } })),
              ]);
              return {
                id: ct.id,
                count: totalRes.data?.meta?.total ?? (Array.isArray(totalRes.data) ? totalRes.data.length : 0),
                pendingCount: pendingRes.data?.meta?.total ?? (Array.isArray(pendingRes.data) ? pendingRes.data.length : 0),
              };
            }),
          );
          if (!mounted) return;
          setEntryCounts(Object.fromEntries(counts.map((c) => [c.id, c.count])));
          setPendingCounts(Object.fromEntries(counts.map((c) => [c.id, c.pendingCount])));
        }
      } catch {
        toast.error(t('toasts.loadContentTypesFailed'));
      } finally {
        if (mounted) setLoadingCTs(false);
      }
    };

    loadData();
    return () => { mounted = false; };
  }, [user]);

  /* ── Load entries when CT is selected ──────────────────────────────────── */
  useEffect(() => {
    if (!selectedCT) { setEntries([]); setDeletedCount(0); setSelectedCTPendingCount(0); return; }
    setEntries([]);
    setLoadingEntries(true);
    setSelected(new Set());
    fetchDeletedCount();
    fetchPendingCount();
    const params: Record<string, any> = { contentTypeId: selectedCT.id, limit: 100 };
    if (showTrash) {
      params.deleted = true;
    } else {
      if (statusFilter !== 'all') params.status = statusFilter;
      if (localeFilter !== 'all') params.locale = localeFilter;
    }
    api.get('/entries', { params })
      .then((res) => setEntries(res.data.data ?? res.data))
      .catch(() => toast.error(t('toasts.loadEntriesFailed')))
      .finally(() => setLoadingEntries(false));
  }, [selectedCT?.id, statusFilter, localeFilter, showTrash]);

  useEffect(() => { setPage(1); setSelected(new Set()); }, [search, ctParam, statusFilter, localeFilter, showTrash]);

  /* ── Refresh helpers ────────────────────────────────────────────────────── */
  const refreshEntries = async (trashState = showTrash) => {
    if (!selectedCT) return;
    fetchDeletedCount();
    fetchPendingCount();
    const params: Record<string, any> = { contentTypeId: selectedCT.id, limit: 100 };
    if (trashState) {
      params.deleted = true;
    } else {
      if (statusFilter !== 'all') params.status = statusFilter;
      if (localeFilter !== 'all') params.locale = localeFilter;
    }
    const res = await api.get('/entries', { params });
    const list = res.data.data ?? res.data;
    setEntries(list);
    if (!trashState) {
      setEntryCounts((prev) => ({ ...prev, [selectedCT.id]: res.data.meta?.total ?? list.length }));
    }
    setSelected(new Set());
  };

  /* ── Realtime ───────────────────────────────────────────────────────────── */
  useRealtimeEvents(
    {
      onEntryCreated: () => { if (selectedCT && !showTrash) refreshEntries(false); },
      onEntryUpdated: () => { if (selectedCT && !showTrash) refreshEntries(false); },
      onEntryDeleted: () => { if (selectedCT) { fetchDeletedCount(); fetchPendingCount(); refreshEntries(showTrash); } },
    },
    selectedCT ? [selectedCT.name] : [],
  );

  /* ── Delete ────────────────────────────────────────────────────────────── */
  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/entries/${id}`);
      toast.success(t('toasts.movedToTrash'));
      await refreshEntries(false);
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('toasts.deleteFailed'));
    }
  };

  /* ── Restore / Purge (trash bin) ───────────────────────────────────────── */
  const handleRestore = async (id: number) => {
    try {
      await api.post(`/entries/${id}/restore`);
      toast.success(t('toasts.restored'));
      await refreshEntries(true);
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('toasts.restoreFailed'));
    }
  };

  const handlePurge = async (id: number) => {
    try {
      await api.delete(`/entries/${id}/purge`);
      toast.success(t('toasts.purged'));
      await refreshEntries(true);
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('toasts.purgeFailed'));
    }
  };

  /* ── Promote Environment Stage ────────────────────────────────────────── */
  const handlePromote = async (entryId: number, targetStatus: string) => {
    try {
      await api.post(`/entries/${entryId}/promote`, { status: targetStatus });
      const stageName = targetStatus === 'published' ? t('stages.production') : targetStatus === 'staging' ? t('stages.staging') : targetStatus;
      toast.success(t('toasts.promoted', { stage: stageName }));
      setEntries((prev) =>
        prev.map((e) => (e.id === entryId ? { ...e, status: targetStatus } : e)),
      );
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('toasts.promoteFailed'));
    }
  };

  /* ── Export / Import ───────────────────────────────────────────────────── */
  const [exportingFormat, setExportingFormat] = useState<'json' | 'csv' | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFormat, setImportFormat] = useState<'json' | 'csv'>('json');
  const [importPayloadText, setImportPayloadText] = useState('');
  const [importUpdateDuplicates, setImportUpdateDuplicates] = useState(true);
  const [importPreflight, setImportPreflight] = useState<any>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [importExecuting, setImportExecuting] = useState(false);

  const handleExport = async (format: 'json' | 'csv' = 'json') => {
    if (!selectedCT) return;
    setExportingFormat(format);
    try {
      const res = await api.get('/entries/export', {
        params: { contentTypeId: selectedCT.id, format },
      });

      let blob: Blob;
      let filename = `${selectedCT.name}-export.${format}`;

      if (format === 'csv') {
        const csvData = typeof res.data === 'string' ? res.data : res.data.data;
        blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
        if (res.data.filename) filename = res.data.filename;
      } else {
        blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t('toasts.exportDownloaded', { format: format.toUpperCase() }));
    } catch {
      toast.error(t('toasts.exportFailed'));
    } finally {
      setExportingFormat(null);
    }
  };

  const runPreflightImport = async (text: string, format: 'json' | 'csv', updateDups: boolean) => {
    if (!selectedCT || !text.trim()) {
      setImportPreflight(null);
      return;
    }
    setPreflightLoading(true);
    try {
      let body: any;
      if (format === 'csv') {
        body = {
          csvContent: text,
          dryRun: true,
          updateDuplicates: updateDups,
        };
      } else {
        const parsed = JSON.parse(text);
        const entries = Array.isArray(parsed) ? parsed : parsed.data ?? parsed.entries ?? [];
        body = {
          entries,
          dryRun: true,
          updateDuplicates: updateDups,
        };
      }

      const res = await api.post('/entries/import', body, {
        params: { contentTypeId: selectedCT.id },
      });
      setImportPreflight(res.data);
    } catch (err: any) {
      setImportPreflight({
        valid: false,
        errors: [err.response?.data?.message || err.message || t('import.invalidFormat')],
      });
    } finally {
      setPreflightLoading(false);
    }
  };

  const handleImportFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCT) return;
    try {
      const text = await file.text();
      const detectedFormat = file.name.endsWith('.csv') ? 'csv' : 'json';
      setImportFormat(detectedFormat);
      setImportPayloadText(text);
      await runPreflightImport(text, detectedFormat, importUpdateDuplicates);
    } catch {
      toast.error(t('toasts.readFileFailed'));
    }
    e.target.value = '';
  };

  const handleExecuteImport = async () => {
    if (!selectedCT || !importPayloadText.trim()) return;
    setImportExecuting(true);
    try {
      let body: any;
      if (importFormat === 'csv') {
        body = {
          csvContent: importPayloadText,
          dryRun: false,
          updateDuplicates: importUpdateDuplicates,
        };
      } else {
        const parsed = JSON.parse(importPayloadText);
        const entries = Array.isArray(parsed) ? parsed : parsed.data ?? parsed.entries ?? [];
        body = {
          entries,
          dryRun: false,
          updateDuplicates: importUpdateDuplicates,
        };
      }

      const res = await api.post('/entries/import', body, {
        params: { contentTypeId: selectedCT.id },
      });

      const { created = 0, updated = 0, errors = [] } = res.data ?? {};
      const parts: string[] = [];
      if (created) parts.push(t('toasts.importCreated', { count: created }));
      if (updated) parts.push(t('toasts.importUpdated', { count: updated }));
      const summary = parts.length ? parts.join(', ') : t('toasts.importNoChanges');
      toast.success(`${t('toasts.importComplete', { summary })}${errors.length ? ` ${t('toasts.importSkipped', { count: errors.length })}` : ''}`);

      setImportDialogOpen(false);
      setImportPayloadText('');
      setImportPreflight(null);
      await refreshEntries();
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('toasts.importFailed'));
    } finally {
      setImportExecuting(false);
    }
  };

  /* ── Bulk actions ───────────────────────────────────────────────────────── */
  const handleBulkAction = async (action: 'bulk-delete' | 'bulk-publish' | 'bulk-archive' | 'bulk-pending-review' | 'bulk-stage') => {
    if (selected.size === 0) return;
    setBulkLoading(true);
    try {
      const res = await api.post(`/entries/${action}`, { ids: Array.from(selected) });
      const key = action === 'bulk-delete' ? 'deleted' : action === 'bulk-publish' ? 'published' : action === 'bulk-stage' ? 'staged' : action === 'bulk-pending-review' ? 'submitted' : 'archived';
      toast.success(t(`bulk.done.${key}`, { count: res.data.affected }));
      await refreshEntries();
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('toasts.bulkFailed'));
    } finally {
      setBulkLoading(false);
    }
  };

  /* ── Selection helpers ──────────────────────────────────────────────────── */
  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  /* ── Duplicate ──────────────────────────────────────────────────────────── */
  const handleDuplicate = async (entry: Entry) => {
    setDuplicating(entry.id);
    const candidates = [
      `${entry.slug}-copy`,
      ...Array.from({ length: 9 }, (_, i) => `${entry.slug}-copy-${i + 2}`),
    ];
    for (const slug of candidates) {
      try {
        const res = await api.post('/entries', {
          slug,
          data: entry.data,
          contentTypeId: entry.contentTypeId,
        });
        toast.success(t('toasts.duplicated', { slug }));
        router.push(`/entries/${res.data.id}/edit`);
        return;
      } catch (err: any) {
        if (err.response?.status !== 409) {
          toast.error(err.response?.data?.message || t('toasts.duplicateFailed'));
          setDuplicating(null);
          return;
        }
      }
    }
    toast.error(t('toasts.noUniqueSlug'));
    setDuplicating(null);
  };

  /* ── Copy public API URL ──────────────────────────────────────────────────── */
  const handleCopyUrl = async (entry: Entry) => {
    const typeName = selectedCT?.name;
    if (!typeName) return;
    // Content-type names are stored snake_cased; the API also accepts the
    // hyphenated form (normalised back to underscores), which reads cleaner in a URL.
    const url = `${window.location.origin}/api/${typeName.replace(/_/g, '-')}/${entry.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('toasts.urlCopied'));
    } catch {
      toast.error(t('toasts.copyUrlFailed'));
    }
  };

  /* ── Cards view ─────────────────────────────────────────────────────────── */
  if (!ctParam) {
    if (loadingCTs) {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-4 w-48 mt-1" />
              </CardHeader>
              <CardFooter className="gap-2">
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-8 w-28" />
              </CardFooter>
            </Card>
          ))}
        </div>
      );
    }

    if (contentTypes.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Layers className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">{t('cards.noContentTypes')}</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            {t('cards.noContentTypesHint')}
          </p>
          <Button className="mt-4" size="sm" onClick={() => router.push('/content-types/new')}>
            <Plus className="h-4 w-4 mr-1.5" /> {t('cards.newContentType')}
          </Button>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {contentTypes.map((ct) => {
          const count = entryCounts[ct.id];
          const pendingCount = pendingCounts[ct.id] ?? 0;
          const fields = ct.schema.slice(0, 3).map((f) => f.name);
          return (
            <Card
              key={ct.id}
              className={cn(
                'flex flex-col transition-all duration-200 hover:shadow-md',
                pendingCount > 0 && 'border-amber-500/40 bg-amber-500/[0.02] shadow-[0_0_12px_-3px_rgba(245,158,11,0.12)]',
              )}
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <CardTitle className="text-base flex items-center gap-2">
                      {ctLabel(ct)}
                      {pendingCount > 0 && (
                        <span className="relative flex h-2 w-2" title={t('cards.pendingTitle', { count: pendingCount })}>
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                        </span>
                      )}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    {pendingCount > 0 && (
                      <Badge
                        variant="outline"
                        className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40 gap-1 text-[11px] font-semibold py-0.5 px-2 cursor-pointer hover:bg-amber-500/25 transition-colors"
                        onClick={() => router.push(`/entries?ct=${ct.name}&status=pending_review`)}
                        title={t('cards.pendingBadgeTitle')}
                      >
                        <Clock className="h-3 w-3" />
                        {t('cards.pendingBadge', { count: pendingCount })}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="shrink-0 tabular-nums">
                      {count === undefined ? '…' : t('cards.entryCount', { count })}
                    </Badge>
                  </div>
                </div>
                <CardDescription className="text-xs truncate">
                  {fields.length > 0
                    ? fields.join(', ') + (ct.schema.length > 3 ? ` ${t('cards.moreFields', { count: ct.schema.length - 3 })}` : '')
                    : t('cards.noFields')}
                </CardDescription>
              </CardHeader>
              <CardFooter className="mt-auto gap-2">
                {canEdit && (
                  <Button onClick={() => router.push(`/entries/new?ct=${ct.id}`)}>
                    <Plus className="h-4 w-4 mr-1.5" /> {t('newEntry')}
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => router.push(`/entries?ct=${ct.name}`)}
                >
                  {t('cards.viewEntries')} <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    );
  }

  /* ── Entries table view ─────────────────────────────────────────────────── */
  const schemaColumns = selectedCT?.schema.slice(0, 3) ?? [];
  const filteredEntries = entries.filter((e) =>
    e.slug.toLowerCase().includes(search.toLowerCase()),
  );
  const paginatedEntries = filteredEntries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const allPageSelected = paginatedEntries.length > 0 && paginatedEntries.every((e) => selected.has(e.id));

  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        paginatedEntries.forEach((e) => next.delete(e.id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        paginatedEntries.forEach((e) => next.add(e.id));
        return next;
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Breadcrumb + toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {showTrash ? (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 font-medium bg-background text-foreground hover:bg-muted border-border shadow-sm h-8 text-xs"
            onClick={() => { setShowTrash(false); setSelected(new Set()); }}
          >
            <ArrowLeft className="h-3.5 w-3.5 text-amber-500" /> {t('toolbar.backToEntries')}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => router.push('/entries')}
          >
            <ArrowLeft className="h-4 w-4" /> {t('toolbar.allTypes')}
          </Button>
        )}
        <span className="text-muted-foreground/40 text-sm">/</span>
        <span className="text-sm font-medium capitalize">{ctParam.replace(/_/g, ' ')}</span>
        {showTrash && (
          <>
            <span className="text-muted-foreground/40 text-sm">/</span>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-500 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
              <RotateCcw className="h-3 w-3" /> {t('trash.title')}
            </span>
          </>
        )}

        {selectedCT && isAdmin && !showTrash && (
          <div className="flex items-center gap-1 ml-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => router.push(`/content-types/${selectedCT.id}/edit`)}
              title={t('toolbar.editSchemaTitle')}
            >
              <Settings className="h-3.5 w-3.5 text-indigo-400" />
              {t('toolbar.editSchema')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => router.push(`/users/permissions?tab=fields&ct=${selectedCT.name}`)}
              title={t('toolbar.permissionsTitle')}
            >
              <Shield className="h-3.5 w-3.5 text-amber-400" />
              {t('toolbar.permissions')}
            </Button>
          </div>
        )}
        <div className="flex items-center flex-wrap gap-2 w-full sm:w-auto justify-start sm:justify-end sm:ml-auto">
          {!showTrash && (
            <>
              <Select value={localeFilter} onValueChange={(v) => { if (v) { setLocaleFilter(v); setPage(1); } }}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground mr-1 shrink-0" />
                  <SelectValue placeholder={t('filters.allLanguages')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('filters.allLanguages')}</SelectItem>
                  {SUPPORTED_LOCALES.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      <div className="flex items-center gap-1.5">
                        <span>{l.label}</span>
                        <span className="text-[10px] text-muted-foreground font-mono uppercase">({l.code})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={(v) => { if (v) { setStatusFilter(v); setPage(1); } }}>
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue placeholder={t('filters.allStatuses')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('filters.allStatuses')}</SelectItem>
                  <SelectItem value="published">{t('filters.production')}</SelectItem>
                  <SelectItem value="staging">{t('stages.staging')}</SelectItem>
                  <SelectItem value="draft">{tc('statuses.draft')}</SelectItem>
                  <SelectItem value="pending_review">
                    {t('stages.pendingReview')} {selectedCTPendingCount > 0 ? `(${selectedCTPendingCount})` : ''}
                  </SelectItem>
                  <SelectItem value="archived">{tc('statuses.archived')}</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}
          <SearchInput
            placeholder={t('filters.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {!showTrash && (
            <>
              {/* Export Split / Buttons */}
              <div className="inline-flex items-center rounded-md border border-input bg-background p-0.5 shadow-sm">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs gap-1"
                  disabled={exportingFormat !== null}
                  onClick={() => handleExport('json')}
                  title={t('export.jsonTitle')}
                >
                  {exportingFormat === 'json' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileJson className="h-3.5 w-3.5 text-amber-400" />
                  )}
                  JSON
                </Button>
                <div className="w-[1px] h-4 bg-border/60" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs gap-1"
                  disabled={exportingFormat !== null}
                  onClick={() => handleExport('csv')}
                  title={t('export.csvTitle')}
                >
                  {exportingFormat === 'csv' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
                  )}
                  CSV
                </Button>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-8 text-xs"
                onClick={() => setImportDialogOpen(true)}
              >
                <Upload className="h-3.5 w-3.5" />
                {t('import.button')}
              </Button>
            </>
          )}
          {deletedCount > 0 && !showTrash && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 text-xs font-semibold text-amber-600 hover:text-amber-500 dark:text-amber-400 border-amber-500/30 hover:border-amber-500/60 shadow-sm"
              onClick={() => { setShowTrash(true); setSelected(new Set()); }}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t('trash.button', { count: deletedCount })}
            </Button>
          )}
          {canEdit && !showTrash && (
            <Button onClick={() => router.push(`/entries/new?ct=${selectedCT?.id ?? ''}`)}>
              <Plus className="h-4 w-4 mr-1.5" /> {t('newEntry')}
            </Button>
          )}
        </div>
      </div>

      {/* Pending Review Notice Banner */}
      {!showTrash && selectedCTPendingCount > 0 && statusFilter !== 'pending_review' && (
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            <span>
              {t.rich('pending.banner', { count: selectedCTPendingCount, strong: (chunks) => <strong>{chunks}</strong> })}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs font-semibold text-amber-600 hover:text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 gap-1"
            onClick={() => { setStatusFilter('pending_review'); setPage(1); }}
          >
            <Clock className="h-3 w-3" /> {t('pending.showAll', { count: selectedCTPendingCount })}
          </Button>
        </div>
      )}

      {/* Recycle Bin Notice Banner */}
      {showTrash && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs">
          <RotateCcw className="h-4 w-4 shrink-0 text-amber-500" />
          <span>
            {t.rich('trash.banner', { strong: (chunks) => <strong>{chunks}</strong> })}
          </span>
        </div>
      )}

      <AddToReleaseDialog
        entryIds={[...selected]}
        open={releaseOpen}
        onOpenChange={setReleaseOpen}
        onAdded={() => setSelected(new Set())}
      />

      {/* Bulk action bar */}
      {canEdit && selected.size > 0 && !showTrash && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-4 py-2.5">
          <CheckSquare className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {t('bulk.selected', { count: selected.size })}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40"
              disabled={bulkLoading}
              onClick={() => handleBulkAction('bulk-stage')}
            >
              <Rocket className="h-3.5 w-3.5 mr-1" />
              {t('bulk.stage')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkLoading}
              onClick={() => handleBulkAction('bulk-publish')}
            >
              {bulkLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              {t('bulk.publish')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkLoading}
              onClick={() => handleBulkAction('bulk-pending-review')}
            >
              {t('bulk.submitReview')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkLoading}
              onClick={() => handleBulkAction('bulk-archive')}
            >
              {t('bulk.archive')}
            </Button>
            {canPublishContent(user?.role) && (
              <Button size="sm" variant="outline" disabled={bulkLoading} onClick={() => setReleaseOpen(true)}>
                <Package className="h-3.5 w-3.5 mr-1" />
                {t('bulk.addToRelease')}
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger render={
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={bulkLoading}
                />
              }>
                {tc('delete')}
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('bulk.deleteTitle', { count: selected.size })}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('bulk.deleteDescription')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={() => handleBulkAction('bulk-delete')}>
                    {tc('delete')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            {canEdit && !showTrash && (
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border cursor-pointer accent-primary"
                  checked={allPageSelected}
                  onChange={toggleSelectAll}
                  title={t('table.selectAll')}
                />
              </TableHead>
            )}
            <TableHead>{t('table.slug')}</TableHead>
            <TableHead>{tc('status')}</TableHead>
            {schemaColumns.map((col) => (
              <TableHead key={col.name}>
                {col.label?.trim() || col.name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </TableHead>
            ))}
            <TableHead>{tc('updatedAt')}</TableHead>
            <TableHead className="text-right">{tc('actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loadingEntries ? (
            Array.from({ length: 4 }).map((_, i) => (
              <TableRow key={i}>
                {canEdit && !showTrash && <TableCell><Skeleton className="h-4 w-4" /></TableCell>}
                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                {schemaColumns.map((col) => (
                  <TableCell key={col.name}><Skeleton className="h-4 w-24" /></TableCell>
                ))}
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
              </TableRow>
            ))
          ) : paginatedEntries.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={schemaColumns.length + (canEdit && !showTrash ? 4 : 3)}
                className="py-12 text-center text-muted-foreground"
              >
                <div className="flex flex-col items-center justify-center gap-2">
                  <p>{showTrash ? t('table.trashEmpty') : search ? t('table.noMatches') : t('table.empty')}</p>
                  {showTrash && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 h-7 text-xs mt-1"
                      onClick={() => { setShowTrash(false); setSelected(new Set()); }}
                    >
                      <ArrowLeft className="h-3 w-3" /> {t('table.returnToActive')}
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ) : paginatedEntries.map((entry) => (
            <TableRow key={entry.id} className={selected.has(entry.id) ? 'bg-muted/40' : ''}>
              {canEdit && !showTrash && (
                <TableCell>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border cursor-pointer accent-primary"
                    checked={selected.has(entry.id)}
                    onChange={() => toggleSelect(entry.id)}
                  />
                </TableCell>
              )}
              <TableCell>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-foreground">{entry.slug}</p>
                  {SUPPORTED_LOCALES.length > 1 ? (
                    // One chip per enabled language: this row's own (filled), other
                    // existing translations (outlined) and missing ones (dashed).
                    <div className="flex flex-wrap gap-1 shrink-0">
                      {SUPPORTED_LOCALES.map(({ code, label }) => {
                        const own = code === (entry.locale || localesConfig?.defaultLocale);
                        const exists = own || (entry.translations ?? []).includes(code);
                        return (
                          <span
                            key={code}
                            title={t(own ? 'table.localeOwn' : exists ? 'table.localeTranslated' : 'table.localeMissing', { language: label })}
                            className={cn(
                              'text-[10px] font-mono uppercase px-1.5 rounded border leading-4',
                              own && 'bg-primary/15 border-primary/40 text-primary font-semibold',
                              !own && exists && 'border-emerald-500/40 text-emerald-500',
                              !exists && 'border-dashed border-border text-muted-foreground/60',
                            )}
                          >
                            {code}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <Badge variant="outline" className="text-[10px] font-mono uppercase px-1.5 py-0 text-muted-foreground border-border/80 shrink-0">
                      {entry.locale || 'en'}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                {entry.status === 'draft' && entry.publishAt ? (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/40"
                    title={t('table.scheduledTitle', { date: new Date(entry.publishAt).toLocaleString() })}
                  >
                    <Clock className="h-3 w-3" />
                    {t('table.scheduled', { date: new Date(entry.publishAt).toLocaleDateString([], { month: 'short', day: 'numeric' }), time: new Date(entry.publishAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}
                  </span>
                ) : entry.status === 'pending_review' ? (
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/40">
                    <Clock className="h-3 w-3" />
                    {t('stages.pendingReview')}
                  </span>
                ) : (() => {
                  const s = STATUS_LABELS[entry.status] ?? STATUS_LABELS.published;
                  return (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}>
                      {s.commonKey ? tc(s.commonKey) : t(s.labelKey!)}
                    </span>
                  );
                })()}
              </TableCell>
              {schemaColumns.map((col) => {
                const val = entry.data[col.name];
                const imgSrc = col.type === 'image' && val
                  ? (typeof val === 'object' && val.url ? val.url : typeof val === 'string' ? val : null)
                  : null;
                return (
                  <TableCell key={col.name} className="text-muted-foreground">
                    {val === undefined || val === null ? (
                      <span className="text-muted-foreground/40">—</span>
                    ) : imgSrc ? (
                      <img src={imgSrc} alt={val?.alt ?? ''} className="h-9 w-12 rounded object-cover" />
                    ) : col.type === 'boolean' ? (
                      <Badge variant={val ? 'default' : 'outline'} className="text-xs">
                        {val ? tc('yes') : tc('no')}
                      </Badge>
                    ) : col.type === 'repeater' || col.type === 'flexible' ? (
                      <Badge variant="secondary" className="text-xs">
                        {Array.isArray(val) ? t('table.items', { count: val.length }) : '—'}
                      </Badge>
                    ) : col.type === 'richtext' ? (
                      <span className="text-muted-foreground/60 text-xs italic">{t('table.richText')}</span>
                    ) : (
                      truncate(val, (count) => t('table.items', { count }))
                    )}
                  </TableCell>
                );
              })}
              <TableCell className="text-muted-foreground">{formatDate(entry.updatedAt)}</TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  {showTrash ? (
                    <>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title={t('actions.restore')}
                        className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/30"
                        onClick={() => handleRestore(entry.id)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title={t('actions.purgeTitle')}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          />
                        }>
                          <X className="h-3.5 w-3.5" />
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t('actions.purgeConfirmTitle')}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t.rich('actions.purgeConfirmDescription', { slug: entry.slug, strong: (chunks) => <strong>{chunks}</strong> })}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
                            <AlertDialogAction variant="destructive" onClick={() => handlePurge(entry.id)}>
                              {t('actions.purge')}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  ) : (
                    <>
                      {canEdit && (entry.status === 'draft' || entry.status === 'pending_review') && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title={t('actions.promoteStaging')}
                          className="text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-950/30"
                          onClick={() => handlePromote(entry.id, 'staging')}
                        >
                          <Rocket className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canEdit && entry.status === 'staging' && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title={t('actions.publishProduction')}
                          className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                          onClick={() => handlePromote(entry.id, 'published')}
                        >
                          <Globe className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title={tc('edit')}
                          onClick={() => router.push(`/entries/${entry.id}/edit`)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title={t('actions.duplicate')}
                          disabled={duplicating === entry.id}
                          onClick={() => handleDuplicate(entry)}
                        >
                          {duplicating === entry.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                      )}
                      {entry.status === 'published' && selectedCT && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title={t('actions.viewLive')}
                          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30"
                          onClick={() => window.open(`/${selectedCT.name}/${entry.slug}`, '_blank')}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title={t('actions.copyApiUrl')}
                        onClick={() => handleCopyUrl(entry)}
                      >
                        <Link2 className="h-3.5 w-3.5" />
                      </Button>
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
                              <AlertDialogTitle>{t('actions.deleteConfirmTitle')}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {t.rich('actions.deleteConfirmDescription', { slug: entry.slug, strong: (chunks) => <strong>{chunks}</strong> })}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
                              <AlertDialogAction variant="destructive" onClick={() => handleDelete(entry.id)}>
                                {tc('delete')}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Pagination
        total={filteredEntries.length}
        page={page}
        pageSize={PAGE_SIZE}
        onPage={setPage}
      />

      {/* Bulk Import Dialog with Dry-Run Validation */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-blue-500" />
              {t('import.title', { name: selectedCT?.displayName || selectedCT?.name || '' })}
            </DialogTitle>
            <DialogDescription>
              {t('import.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Format toggle & file input */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <label className="inline-flex cursor-pointer">
                  <span className="inline-flex items-center gap-1.5 h-8 rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors">
                    <Upload className="h-3.5 w-3.5" /> {t('import.selectFile')}
                  </span>
                  <input
                    type="file"
                    accept=".json,.csv,text/csv,application/json"
                    className="sr-only"
                    onChange={handleImportFileUpload}
                  />
                </label>
              </div>

              <div className="flex items-center gap-1 bg-muted/50 p-0.5 rounded-lg border">
                <Button
                  variant={importFormat === 'json' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 text-xs px-2.5"
                  onClick={() => {
                    setImportFormat('json');
                    runPreflightImport(importPayloadText, 'json', importUpdateDuplicates);
                  }}
                >
                  <FileJson className="h-3.5 w-3.5 mr-1 text-amber-400" /> JSON
                </Button>
                <Button
                  variant={importFormat === 'csv' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 text-xs px-2.5"
                  onClick={() => {
                    setImportFormat('csv');
                    runPreflightImport(importPayloadText, 'csv', importUpdateDuplicates);
                  }}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 mr-1 text-emerald-400" /> CSV
                </Button>
              </div>
            </div>

            <Textarea
              placeholder={importFormat === 'json'
                ? `[\n  {\n    "slug": "sample-entry",\n    "locale": "en",\n    "status": "published",\n    "data": { "title": "Sample Title" }\n  }\n]`
                : `slug,locale,status,title\nsample-entry,en,published,"Sample Title"`
              }
              value={importPayloadText}
              onChange={(e) => {
                setImportPayloadText(e.target.value);
                runPreflightImport(e.target.value, importFormat, importUpdateDuplicates);
              }}
              rows={6}
              className="font-mono text-xs"
            />

            {/* Conflict resolution option */}
            <div className="flex items-center justify-between rounded-lg border p-2.5 bg-muted/20">
              <div className="space-y-0.5">
                <div className="text-xs font-medium">{t('import.updateDuplicates')}</div>
                <div className="text-[11px] text-muted-foreground">
                  {t('import.updateDuplicatesHint')}
                </div>
              </div>
              <Switch
                checked={importUpdateDuplicates}
                onCheckedChange={(checked) => {
                  setImportUpdateDuplicates(checked);
                  runPreflightImport(importPayloadText, importFormat, checked);
                }}
              />
            </div>

            {/* Dry-Run Preflight Feedback */}
            {preflightLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('import.preflightRunning')}
              </div>
            )}

            {importPreflight && !preflightLoading && (
              <div className={cn(
                'rounded-lg border p-3 text-xs space-y-2',
                importPreflight.valid
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-destructive/10 border-destructive/30 text-destructive',
              )}>
                <div className="flex items-center gap-2 font-semibold">
                  {importPreflight.valid ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  )}
                  {importPreflight.valid
                    ? t('import.preflightPassed', { total: importPreflight.total, toCreate: importPreflight.toCreate, toUpdate: importPreflight.toUpdate })
                    : t('import.preflightErrors', { count: importPreflight.errors?.length || 1 })}
                </div>

                {importPreflight.errors && importPreflight.errors.length > 0 && (
                  <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-destructive">
                    {importPreflight.errors.slice(0, 5).map((err: string, idx: number) => (
                      <li key={idx}>{err}</li>
                    ))}
                    {importPreflight.errors.length > 5 && (
                      <li>{t('import.moreErrors', { count: importPreflight.errors.length - 5 })}</li>
                    )}
                  </ul>
                )}

                {importPreflight.preview && importPreflight.preview.length > 0 && (
                  <div className="overflow-x-auto mt-2 max-h-36 rounded border bg-background/50">
                    <table className="w-full text-left text-[10px]">
                      <thead className="border-b bg-muted/40 font-mono text-muted-foreground">
                        <tr>
                          <th className="p-1.5">{t('import.columns.row')}</th>
                          <th className="p-1.5">{t('import.columns.slug')}</th>
                          <th className="p-1.5">{t('import.columns.locale')}</th>
                          <th className="p-1.5">{t('import.columns.status')}</th>
                          <th className="p-1.5">{t('import.columns.action')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40 font-mono">
                        {importPreflight.preview.map((p: any) => (
                          <tr key={p.row} className="hover:bg-muted/20">
                            <td className="p-1.5">#{p.row}</td>
                            <td className="p-1.5 font-medium">{p.slug}</td>
                            <td className="p-1.5 text-muted-foreground">{p.locale}</td>
                            <td className="p-1.5">{p.status}</td>
                            <td className="p-1.5">
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[9px] px-1 py-0 font-mono',
                                  p.isExisting
                                    ? 'border-blue-500/40 text-blue-400'
                                    : 'border-emerald-500/40 text-emerald-400',
                                )}
                              >
                                {p.isExisting ? t('import.actionUpdate') : t('import.actionCreate')}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setImportDialogOpen(false);
                setImportPayloadText('');
                setImportPreflight(null);
              }}
            >
              {tc('cancel')}
            </Button>
            <Button
              size="sm"
              disabled={!importPreflight?.valid || importExecuting || !importPayloadText.trim()}
              onClick={handleExecuteImport}
              className="gap-1.5"
            >
              {importExecuting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {importPreflight?.total ? t('import.submitCount', { count: importPreflight.total }) : t('import.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
