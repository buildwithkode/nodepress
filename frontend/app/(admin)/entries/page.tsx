'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
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
import api from '@/lib/axios';
import { cn, ctLabel } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { canManageContent, canManageSettings } from '@/lib/roles';
import { useRealtimeEvents } from '@/lib/useRealtimeEvents';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}

function truncate(val: any, max = 60): string {
  if (val === null || val === undefined) return '—';
  if (Array.isArray(val)) return `${val.length} item${val.length !== 1 ? 's' : ''}`;
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

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  published:      { label: 'Production',     className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800' },
  staging:        { label: 'Staging (QA)',   className: 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-300 dark:border-purple-800' },
  pending_review: { label: 'Pending Review', className: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-300 dark:border-blue-800' },
  draft:          { label: 'Draft',          className: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800' },
  archived:       { label: 'Archived',       className: 'bg-muted text-muted-foreground border border-border' },
};

interface Field { name: string; label?: string; type: string; options?: any }
interface ContentType { id: number; name: string; displayName?: string | null; schema: Field[] }
interface Entry {
  id: number; slug: string; status: string; contentTypeId: number;
  data: Record<string, any>; createdAt: string; updatedAt: string;
}

export default function EntriesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const canEdit = canManageContent(user?.role);
  const isAdmin = canManageSettings(user?.role);
  const ctParam     = searchParams?.get('ct')     ?? '';
  const statusParam = searchParams?.get('status') ?? '';

  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [entryCounts, setEntryCounts] = useState<Record<number, number>>({});
  const [loadingCTs, setLoadingCTs] = useState(true);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [duplicating, setDuplicating] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(statusParam || 'all');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  // Bulk selection
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  // Trash view
  const [showTrash, setShowTrash] = useState(false);

  const selectedCT = contentTypes.find((ct) => ct.name === ctParam) ?? null;

  /* ── Load content types + counts ───────────────────────────────────────── */
  useEffect(() => {
    setLoadingCTs(true);
    api.get('/content-types')
      .then(async (res) => {
        const cts: ContentType[] = res.data;
        setContentTypes(cts);
        const counts = await Promise.all(
          cts.map((ct) =>
            api.get('/entries', { params: { contentTypeId: ct.id, limit: 1 } })
              .then((r) => ({ id: ct.id, count: r.data.meta?.total ?? 0 }))
              .catch(() => ({ id: ct.id, count: 0 })),
          ),
        );
        setEntryCounts(Object.fromEntries(counts.map((c) => [c.id, c.count])));
      })
      .catch(() => toast.error('Failed to load content types'))
      .finally(() => setLoadingCTs(false));
  }, []);

  /* ── Load entries when CT is selected ──────────────────────────────────── */
  useEffect(() => {
    if (!selectedCT) { setEntries([]); return; }
    setLoadingEntries(true);
    setSelected(new Set());
    const params: Record<string, any> = { contentTypeId: selectedCT.id, limit: 100 };
    if (showTrash) {
      params.deleted = true;
    } else if (statusFilter !== 'all') {
      params.status = statusFilter;
    }
    api.get('/entries', { params })
      .then((res) => setEntries(res.data.data ?? res.data))
      .catch(() => toast.error('Failed to load entries'))
      .finally(() => setLoadingEntries(false));
  }, [selectedCT?.id, statusFilter, showTrash]);

  useEffect(() => { setPage(1); setSelected(new Set()); }, [search, ctParam, statusFilter, showTrash]);

  /* ── Refresh helpers ────────────────────────────────────────────────────── */
  const refreshEntries = async () => {
    if (!selectedCT) return;
    const res = await api.get('/entries', { params: { contentTypeId: selectedCT.id, limit: 100 } });
    const list = res.data.data ?? res.data;
    setEntries(list);
    setEntryCounts((prev) => ({ ...prev, [selectedCT.id]: res.data.meta?.total ?? list.length }));
    setSelected(new Set());
  };

  /* ── Realtime ───────────────────────────────────────────────────────────── */
  useRealtimeEvents(
    {
      onEntryCreated: () => { if (selectedCT && !showTrash) refreshEntries(); },
      onEntryUpdated: () => { if (selectedCT && !showTrash) refreshEntries(); },
      onEntryDeleted: () => { if (selectedCT) refreshEntries(); },
    },
    selectedCT ? [selectedCT.name] : [],
  );

  /* ── Delete ────────────────────────────────────────────────────────────── */
  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/entries/${id}`);
      toast.success('Entry deleted');
      await refreshEntries();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  /* ── Restore / Purge (trash bin) ───────────────────────────────────────── */
  const handleRestore = async (id: number) => {
    try {
      await api.post(`/entries/${id}/restore`);
      toast.success('Entry restored');
      await refreshEntries();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Restore failed');
    }
  };

  const handlePurge = async (id: number) => {
    try {
      await api.delete(`/entries/${id}/purge`);
      toast.success('Entry permanently deleted');
      await refreshEntries();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Purge failed');
    }
  };

  /* ── Promote Environment Stage ────────────────────────────────────────── */
  const handlePromote = async (entryId: number, targetStatus: string) => {
    try {
      await api.post(`/entries/${entryId}/promote`, { status: targetStatus });
      const stageName = targetStatus === 'published' ? 'Production' : targetStatus === 'staging' ? 'Staging (QA)' : targetStatus;
      toast.success(`Entry promoted to ${stageName}`);
      setEntries((prev) =>
        prev.map((e) => (e.id === entryId ? { ...e, status: targetStatus } : e)),
      );
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to promote entry');
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
      toast.success(`${format.toUpperCase()} export downloaded`);
    } catch {
      toast.error('Export failed');
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
        errors: [err.response?.data?.message || err.message || 'Invalid format'],
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
      toast.error('Failed to read file');
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
      if (created) parts.push(`created ${created}`);
      if (updated) parts.push(`updated ${updated}`);
      const summary = parts.length ? parts.join(', ') : 'no changes';
      toast.success(`Import complete: ${summary}${errors.length ? ` (${errors.length} skipped)` : ''}`);

      setImportDialogOpen(false);
      setImportPayloadText('');
      setImportPreflight(null);
      await refreshEntries();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Import execution failed');
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
      const label = action === 'bulk-delete' ? 'deleted' : action === 'bulk-publish' ? 'published to production' : action === 'bulk-stage' ? 'promoted to staging' : action === 'bulk-pending-review' ? 'submitted for review' : 'archived';
      toast.success(`${res.data.affected} ${res.data.affected === 1 ? 'entry' : 'entries'} ${label}`);
      await refreshEntries();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Bulk action failed');
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
        toast.success(`Duplicated as "${slug}"`);
        router.push(`/entries/${res.data.id}/edit`);
        return;
      } catch (err: any) {
        if (err.response?.status !== 409) {
          toast.error(err.response?.data?.message || 'Duplicate failed');
          setDuplicating(null);
          return;
        }
      }
    }
    toast.error('Could not find a unique slug for the duplicate');
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
      toast.success('API URL copied to clipboard');
    } catch {
      toast.error('Could not copy URL');
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
          <p className="text-sm font-medium text-muted-foreground">No content types yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Create a content type first to start adding entries.
          </p>
          <Button className="mt-4" size="sm" onClick={() => router.push('/content-types/new')}>
            <Plus className="h-4 w-4 mr-1.5" /> New Content Type
          </Button>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {contentTypes.map((ct) => {
          const count = entryCounts[ct.id];
          const fields = ct.schema.slice(0, 3).map((f) => f.name);
          return (
            <Card key={ct.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">
                    {ctLabel(ct)}
                  </CardTitle>
                  <Badge variant="secondary" className="shrink-0 tabular-nums">
                    {count === undefined ? '…' : `${count} ${count === 1 ? 'entry' : 'entries'}`}
                  </Badge>
                </div>
                <CardDescription className="text-xs truncate">
                  {fields.length > 0
                    ? fields.join(', ') + (ct.schema.length > 3 ? ` +${ct.schema.length - 3} more` : '')
                    : 'No fields defined'}
                </CardDescription>
              </CardHeader>
              <CardFooter className="mt-auto gap-2">
                {canEdit && (
                  <Button onClick={() => router.push(`/entries/new?ct=${ct.id}`)}>
                    <Plus className="h-4 w-4 mr-1.5" /> New Entry
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => router.push(`/entries?ct=${ct.name}`)}
                >
                  View Entries <ArrowRight className="h-4 w-4 ml-1" />
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
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => router.push('/entries')}
        >
          <ArrowLeft className="h-4 w-4" /> All Types
        </Button>
        <span className="text-muted-foreground/40 text-sm">/</span>
        <span className="text-sm font-medium capitalize">{ctParam.replace(/_/g, ' ')}</span>

        {selectedCT && isAdmin && (
          <div className="flex items-center gap-1 ml-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => router.push(`/content-types/${selectedCT.id}/edit`)}
              title="Edit Content Type Schema"
            >
              <Settings className="h-3.5 w-3.5 text-indigo-400" />
              Edit Schema
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => router.push(`/users/permissions?tab=fields&ct=${selectedCT.name}`)}
              title="Configure Field-Level Permissions"
            >
              <Shield className="h-3.5 w-3.5 text-amber-400" />
              Permissions
            </Button>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          {!showTrash && (
            <Select value={statusFilter} onValueChange={(v) => { if (v) { setStatusFilter(v); setPage(1); } }}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="published">Production (Published)</SelectItem>
                <SelectItem value="staging">Staging (QA)</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="pending_review">Pending Review</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          )}
          <SearchInput
            placeholder="Search entries…"
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
                  title="Export non-deleted entries as JSON"
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
                  title="Export non-deleted entries as CSV spreadsheet"
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
                Import
              </Button>
            </>
          )}
          <Button
            variant={showTrash ? 'default' : 'outline'}
            size="sm"
            className="gap-1.5"
            onClick={() => { setShowTrash((v) => !v); setSelected(new Set()); }}
          >
            <Trash className="h-4 w-4" />
            {showTrash ? 'Exit Trash' : 'Trash'}
          </Button>
          {canEdit && !showTrash && (
            <Button onClick={() => router.push(`/entries/new?ct=${selectedCT?.id ?? ''}`)}>
              <Plus className="h-4 w-4 mr-1.5" /> New Entry
            </Button>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {canEdit && selected.size > 0 && !showTrash && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-4 py-2.5">
          <CheckSquare className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {selected.size} {selected.size === 1 ? 'entry' : 'entries'} selected
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
              Stage (QA)
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkLoading}
              onClick={() => handleBulkAction('bulk-publish')}
            >
              {bulkLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Publish (Prod)
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkLoading}
              onClick={() => handleBulkAction('bulk-pending-review')}
            >
              Submit for Review
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkLoading}
              onClick={() => handleBulkAction('bulk-archive')}
            >
              Archive
            </Button>
            <AlertDialog>
              <AlertDialogTrigger render={
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={bulkLoading}
                />
              }>
                Delete
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {selected.size} {selected.size === 1 ? 'entry' : 'entries'}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Selected entries will be moved to trash. You can restore them later.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={() => handleBulkAction('bulk-delete')}>
                    Delete
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
                  title="Select all on this page"
                />
              </TableHead>
            )}
            <TableHead>Slug</TableHead>
            <TableHead>Status</TableHead>
            {schemaColumns.map((col) => (
              <TableHead key={col.name}>
                {col.label?.trim() || col.name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </TableHead>
            ))}
            <TableHead>Updated</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loadingEntries && Array.from({ length: 4 }).map((_, i) => (
            <TableRow key={i}>
              {canEdit && <TableCell><Skeleton className="h-4 w-4" /></TableCell>}
              <TableCell><Skeleton className="h-4 w-32" /></TableCell>
              <TableCell><Skeleton className="h-4 w-16" /></TableCell>
              {schemaColumns.map((col) => (
                <TableCell key={col.name}><Skeleton className="h-4 w-24" /></TableCell>
              ))}
              <TableCell><Skeleton className="h-4 w-20" /></TableCell>
              <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
            </TableRow>
          ))}
          {!loadingEntries && paginatedEntries.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={schemaColumns.length + (canEdit && !showTrash ? 4 : 3)}
                className="py-12 text-center text-muted-foreground"
              >
                {showTrash ? 'Trash is empty.' : search ? 'No entries match your search.' : 'No entries yet. Create the first one.'}
              </TableCell>
            </TableRow>
          )}
          {paginatedEntries.map((entry) => (
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
                <p className="font-medium text-foreground">{entry.slug}</p>
              </TableCell>
              <TableCell>
                {(() => {
                  const s = STATUS_LABELS[entry.status] ?? STATUS_LABELS.published;
                  return (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}>
                      {s.label}
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
                        {val ? 'Yes' : 'No'}
                      </Badge>
                    ) : col.type === 'repeater' || col.type === 'flexible' ? (
                      <Badge variant="secondary" className="text-xs">
                        {Array.isArray(val) ? `${val.length} item${val.length !== 1 ? 's' : ''}` : '—'}
                      </Badge>
                    ) : col.type === 'richtext' ? (
                      <span className="text-muted-foreground/60 text-xs italic">Rich text</span>
                    ) : (
                      truncate(val)
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
                        title="Restore"
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
                            title="Purge permanently"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          />
                        }>
                          <X className="h-3.5 w-3.5" />
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Permanently delete?</AlertDialogTitle>
                            <AlertDialogDescription>
                              <strong>{entry.slug}</strong> and all its versions will be erased forever. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction variant="destructive" onClick={() => handlePurge(entry.id)}>
                              Purge
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
                          title="Promote to Staging (QA)"
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
                          title="Publish to Production"
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
                          title="Edit"
                          onClick={() => router.push(`/entries/${entry.id}/edit`)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Duplicate"
                          disabled={duplicating === entry.id}
                          onClick={() => handleDuplicate(entry)}
                        >
                          {duplicating === entry.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Copy API URL"
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
                              title="Delete"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            />
                          }>
                            <Trash2 className="h-3.5 w-3.5" />
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
                              <AlertDialogDescription>
                                <strong>{entry.slug}</strong> will be moved to trash. You can restore it later.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction variant="destructive" onClick={() => handleDelete(entry.id)}>
                                Delete
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
              Import Entries — {selectedCT?.displayName || selectedCT?.name}
            </DialogTitle>
            <DialogDescription>
              Upload a .JSON or .CSV file, or paste data directly. Real-time dry-run validation checks slugs, locales, and fields against the schema before saving.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Format toggle & file input */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <label className="inline-flex cursor-pointer">
                  <span className="inline-flex items-center gap-1.5 h-8 rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors">
                    <Upload className="h-3.5 w-3.5" /> Select File (.csv / .json)
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
                <div className="text-xs font-medium">Update duplicate entries</div>
                <div className="text-[11px] text-muted-foreground">
                  If an entry with matching (slug + locale) exists, update its content instead of skipping it.
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
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Running pre-flight dry-run validation…
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
                    ? `Pre-flight passed: ${importPreflight.total} rows ready (${importPreflight.toCreate} new, ${importPreflight.toUpdate} updates)`
                    : `Pre-flight errors detected (${importPreflight.errors?.length || 1})`}
                </div>

                {importPreflight.errors && importPreflight.errors.length > 0 && (
                  <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-destructive">
                    {importPreflight.errors.slice(0, 5).map((err: string, idx: number) => (
                      <li key={idx}>{err}</li>
                    ))}
                    {importPreflight.errors.length > 5 && (
                      <li>...and {importPreflight.errors.length - 5} more</li>
                    )}
                  </ul>
                )}

                {importPreflight.preview && importPreflight.preview.length > 0 && (
                  <div className="overflow-x-auto mt-2 max-h-36 rounded border bg-background/50">
                    <table className="w-full text-left text-[10px]">
                      <thead className="border-b bg-muted/40 font-mono text-muted-foreground">
                        <tr>
                          <th className="p-1.5">Row</th>
                          <th className="p-1.5">Slug</th>
                          <th className="p-1.5">Locale</th>
                          <th className="p-1.5">Status</th>
                          <th className="p-1.5">Action</th>
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
                                {p.isExisting ? 'Update' : 'Create'}
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
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!importPreflight?.valid || importExecuting || !importPayloadText.trim()}
              onClick={handleExecuteImport}
              className="gap-1.5"
            >
              {importExecuting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Import {importPreflight?.total ? `${importPreflight.total} Entries` : 'Entries'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
