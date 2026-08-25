'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Pencil,
  Trash2,
  LayoutGrid,
  Download,
  Upload,
  Copy,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileCode,
  FileText,
  Shield,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/axios';
import { useAuth } from '@/context/AuthContext';
import { canManageSettings } from '@/lib/roles';
import { cn, ctLabel } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Pagination } from '@/components/ui/data-table';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchInput } from '@/components/ui/search-input';
import { Textarea } from '@/components/ui/textarea';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
const FIELD_TYPE_BADGE: Record<string, string> = {
  text:     'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  textarea: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20',
  richtext: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
  number:   'bg-orange-500/10 text-orange-400 border border-orange-500/20',
  boolean:  'bg-green-500/10 text-green-400 border border-green-500/20',
  select:   'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
  image:    'bg-pink-500/10 text-pink-400 border border-pink-500/20',
  color:    'bg-rose-500/10 text-rose-400 border border-rose-500/20',
  date:     'bg-teal-500/10 text-teal-400 border border-teal-500/20',
  datetime: 'bg-sky-500/10 text-sky-400 border border-sky-500/20',
  json:     'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  relation: 'bg-violet-500/10 text-violet-400 border border-violet-500/20',
  repeater: 'bg-red-500/10 text-red-400 border border-red-500/20',
  flexible: 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20',
  group:    'bg-slate-500/10 text-slate-400 border border-slate-500/20',
};

interface SubField { name: string; type: string }
interface Layout   { name: string; label: string; fields: SubField[] }
interface Field {
  name:     string;
  type:     string;
  required: boolean;
  options?: { subFields?: SubField[]; layouts?: Layout[]; choices?: string };
}
interface ContentType { id: number; name: string; displayName?: string | null; schema: Field[]; allowedMethods: string[] | null; createdAt: string }

const METHOD_BADGES = [
  { key: 'list',   short: 'LIST',   cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  { key: 'read',   short: 'READ',   cls: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' },
  { key: 'create', short: 'POST',   cls: 'bg-green-500/10 text-green-400 border-green-500/20' },
  { key: 'update', short: 'PUT',    cls: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  { key: 'delete', short: 'DELETE', cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
];

// ---------------------------------------------------------------------------
// Export helper
// ---------------------------------------------------------------------------
function exportContentType(ct: ContentType) {
  const payload = {
    nodepress: '1.0',
    exportedAt: new Date().toISOString(),
    contentType: { name: ct.name, displayName: ct.displayName ?? null, schema: ct.schema, allowedMethods: ct.allowedMethods ?? null },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${ct.name}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ContentTypesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = canManageSettings(user?.role);
  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [loading, setLoading]           = useState(false);
  const [duplicating, setDuplicating]   = useState<number | null>(null);
  const [search, setSearch]             = useState('');
  const [page, setPage]                 = useState(1);
  const PAGE_SIZE = 10;

  // Schema Export / Import state
  const [exportingAll, setExportingAll] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [importPreflight, setImportPreflight] = useState<any>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [importExecuting, setImportExecuting] = useState(false);

  // ---- data ----
  const fetchContentTypes = async () => {
    setLoading(true);
    try {
      const res = await api.get('/content-types');
      setContentTypes(res.data);
    } catch {
      toast.error('Failed to load content types');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchContentTypes(); }, []);
  useEffect(() => { setPage(1); }, [search]);

  const handleExportAll = async () => {
    setExportingAll(true);
    try {
      const res = await api.get('/content-types/export');
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nodepress-schemas-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('All content type schemas exported');
    } catch {
      toast.error('Failed to export schemas');
    } finally {
      setExportingAll(false);
    }
  };

  const handlePreflightImport = async (textToValidate?: string) => {
    const raw = textToValidate ?? importJsonText;
    if (!raw.trim()) {
      setImportPreflight(null);
      return;
    }

    setPreflightLoading(true);
    try {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed)
        ? parsed
        : parsed.contentTypes || (parsed.contentType ? [parsed.contentType] : []);

      if (list.length === 0) {
        setImportPreflight({ valid: false, errors: ['No contentTypes array found in JSON'] });
        return;
      }

      const res = await api.post('/content-types/import', {
        contentTypes: list,
        dryRun: true,
      });
      setImportPreflight(res.data);
    } catch (err: any) {
      setImportPreflight({
        valid: false,
        errors: [err.response?.data?.message || err.message || 'Invalid JSON format'],
      });
    } finally {
      setPreflightLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setImportJsonText(text);
      await handlePreflightImport(text);
    } catch {
      toast.error('Failed to read file');
    }
    e.target.value = '';
  };

  const handleExecuteImport = async () => {
    if (!importJsonText.trim()) return;
    setImportExecuting(true);
    try {
      const parsed = JSON.parse(importJsonText);
      const list = Array.isArray(parsed)
        ? parsed
        : parsed.contentTypes || (parsed.contentType ? [parsed.contentType] : []);

      const res = await api.post('/content-types/import', {
        contentTypes: list,
        dryRun: false,
        overwrite: true,
      });

      const { created = 0, updated = 0 } = res.data;
      toast.success(`Schema migration complete: ${created} created, ${updated} updated`);
      setImportDialogOpen(false);
      setImportJsonText('');
      setImportPreflight(null);
      await fetchContentTypes();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Schema import failed');
    } finally {
      setImportExecuting(false);
    }
  };

  const handleDuplicate = async (ct: ContentType) => {
    setDuplicating(ct.id);
    const candidates = [
      `${ct.name}_copy`,
      ...Array.from({ length: 9 }, (_, i) => `${ct.name}_copy_${i + 2}`),
    ];
    for (const name of candidates) {
      try {
        const res = await api.post('/content-types', { name, schema: ct.schema });
        toast.success(`Duplicated as "${name}"`);
        router.push(`/content-types/${res.data.id}/edit`);
        return;
      } catch (err: any) {
        if (err.response?.status !== 409) {
          toast.error(err.response?.data?.message || 'Duplicate failed');
          setDuplicating(null);
          return;
        }
      }
    }
    toast.error('Too many duplicates — delete some first');
    setDuplicating(null);
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/content-types/${id}`);
      toast.success('Content type deleted');
      await fetchContentTypes();
    } catch {
      toast.error('Failed to delete content type');
    }
  };

  const filtered = contentTypes.filter((ct) => {
    const q = search.toLowerCase();
    return ct.name.toLowerCase().includes(q) || (ct.displayName ?? '').toLowerCase().includes(q);
  });

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6 w-full">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex-1 max-w-xs">
          <SearchInput
            placeholder="Search content types..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={exportingAll}
            onClick={handleExportAll}
          >
            {exportingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export Schemas
          </Button>

          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setImportDialogOpen(true)}
            >
              <Upload className="h-4 w-4" />
              Import Schemas
            </Button>
          )}

          {isAdmin && (
            <Button onClick={() => router.push('/content-types/new')} size="sm">
              <Plus className="h-4 w-4 mr-1.5" />
              New Content Type
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Fields</TableHead>
            <TableHead className="w-40">Endpoints</TableHead>
            <TableHead className="w-24">Count</TableHead>
            <TableHead className="w-28">Created</TableHead>
            <TableHead className="w-24">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && (
            Array.from({ length: 4 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
              </TableRow>
            ))
          )}
          {filtered.length === 0 && !loading && (
            <TableRow>
              <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                {search ? 'No content types match your search.' : 'No content types yet. Create your first one.'}
              </TableCell>
            </TableRow>
          )}
          {paginated.map((ct) => (
            <TableRow key={ct.id}>
              <TableCell>
                <button
                  type="button"
                  onClick={() => router.push(`/entries?ct=${ct.name}`)}
                  className="font-semibold text-foreground text-sm flex items-center gap-1.5 hover:text-primary transition-colors text-left"
                  title={`View ${ctLabel(ct)} entries`}
                >
                  <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground" />
                  {ctLabel(ct)}
                </button>
                <div className="text-xs text-muted-foreground font-mono mt-0.5">/{ct.name}</div>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1 max-w-sm">
                  {ct.schema.map((f) => (
                    <span
                      key={f.name}
                      className={cn(
                        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono font-medium',
                        FIELD_TYPE_BADGE[f.type] ?? 'bg-muted text-muted-foreground',
                      )}
                    >
                      {f.name}
                      {f.required && <span className="text-destructive font-bold">*</span>}
                    </span>
                  ))}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {METHOD_BADGES.map(({ key, short, cls }) => {
                    const enabled = ct.allowedMethods === null || ct.allowedMethods.includes(key);
                    return (
                      <span
                        key={key}
                        className={cn(
                          'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold border',
                          enabled ? cls : 'bg-muted/20 text-muted-foreground/40 border-border/30',
                        )}
                      >
                        {short}
                      </span>
                    );
                  })}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{ct.schema.length}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {new Date(ct.createdAt).toLocaleDateString()}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => router.push(`/entries?ct=${ct.name}`)}
                    title="View Entries"
                  >
                    <FileText className="h-3.5 w-3.5 text-blue-400" />
                  </Button>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => router.push(`/users/permissions?tab=fields&ct=${ct.name}`)}
                      title="Field Permissions & Access Control"
                    >
                      <Shield className="h-3.5 w-3.5 text-amber-400" />
                    </Button>
                  )}
                  {isAdmin && (
                    <Button variant="ghost" size="icon-sm" onClick={() => router.push(`/content-types/${ct.id}/edit`)} title="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Duplicate"
                      disabled={duplicating === ct.id}
                      onClick={() => handleDuplicate(ct)}
                    >
                      {duplicating === ct.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  )}
                  <Button variant="ghost" size="icon-sm" onClick={() => exportContentType(ct)} title="Export JSON">
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  {isAdmin && (
                    <AlertDialog>
                      <AlertDialogTrigger render={<Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" title="Delete" />}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete content type?</AlertDialogTitle>
                          <AlertDialogDescription>
                            All entries under <strong>{ctLabel(ct)}</strong> will also be deleted. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction variant="destructive" onClick={() => handleDelete(ct.id)}>
                            Delete
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

      {/* Schema Import Dialog with Dry-Run Preflight */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCode className="h-5 w-5 text-blue-500" />
              Import Content Type Schemas
            </DialogTitle>
            <DialogDescription>
              Upload or paste a JSON schema definition to create or update content types. Automatic dry-run validation checks for syntax, reserved names, and field rules.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2">
              <label className="inline-flex cursor-pointer">
                <span className="inline-flex items-center gap-1.5 h-8 rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors">
                  <Upload className="h-3.5 w-3.5" /> Select Schema .JSON File
                </span>
                <input
                  type="file"
                  accept=".json,application/json"
                  className="sr-only"
                  onChange={handleFileUpload}
                />
              </label>
              <span className="text-xs text-muted-foreground">or paste JSON payload below:</span>
            </div>

            <Textarea
              placeholder={`{\n  "contentTypes": [\n    {\n      "name": "article",\n      "schema": [{ "name": "title", "type": "text", "required": true }]\n    }\n  ]\n}`}
              value={importJsonText}
              onChange={(e) => {
                setImportJsonText(e.target.value);
                handlePreflightImport(e.target.value);
              }}
              rows={8}
              className="font-mono text-xs"
            />

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
                    ? `Pre-flight passed: ${importPreflight.total} schemas ready (${importPreflight.toCreate} new, ${importPreflight.toUpdate} updates)`
                    : `Validation failed: ${importPreflight.errors?.length || 1} error(s)`}
                </div>

                {importPreflight.errors && importPreflight.errors.length > 0 && (
                  <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-destructive">
                    {importPreflight.errors.map((err: string, idx: number) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                )}

                {importPreflight.preview && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {importPreflight.preview.map((p: any) => (
                      <Badge
                        key={p.name}
                        variant="outline"
                        className={cn(
                          'text-[10px] font-mono',
                          p.isExisting ? 'border-blue-500/40 text-blue-400' : 'border-emerald-500/40 text-emerald-400',
                        )}
                      >
                        {p.name} ({p.fieldCount} fields) — {p.isExisting ? 'Update' : 'Create'}
                      </Badge>
                    ))}
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
                setImportJsonText('');
                setImportPreflight(null);
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!importPreflight?.valid || importExecuting}
              onClick={handleExecuteImport}
              className="gap-1.5"
            >
              {importExecuting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Import Schemas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
