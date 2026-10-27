'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Copy, Key } from 'lucide-react';
import AdminGuard from '@/components/AdminGuard';
import { toast } from 'sonner';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { SearchInput } from '@/components/ui/search-input';
import { Pagination } from '@/components/ui/data-table';
import { useTranslations } from 'use-intl';
import { useAccess } from '@/lib/use-access';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ApiKey {
  id: number;
  name: string;
  key: string;
  permissions: { access: 'read' | 'write' | 'all'; contentTypes: string[] };
  createdAt: string;
  lastUsedAt: string | null;
}

const ACCESS_BADGE: Record<string, 'blue' | 'orange' | 'green'> = {
  read:  'blue',
  write: 'orange',
  all:   'green',
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function ApiKeysPage() {
  const t = useTranslations('developer');
  const editable = useAccess().canEdit('api_keys');
  const tc = useTranslations('common');
  const router = useRouter();
  const [keys, setKeys]               = useState<ApiKey[]>([]);
  const [loading, setLoading]         = useState(false);
  const [search, setSearch]           = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  useEffect(() => { setPage(1); }, [search]);

  // ---- data ----
  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api-keys');
      setKeys(res.data);
    } catch {
      toast.error(t('apiKeys.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ---- helpers ----
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success(t('apiKeys.copiedToClipboard'));
  };

  // ---- revoke ----
  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/api-keys/${id}`);
      toast.success(t('apiKeys.revoked'));
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('apiKeys.revokeFailed'));
    }
  };

  // ---- filtered list ----
  const filteredKeys = keys.filter(k =>
    k.name.toLowerCase().includes(search.toLowerCase())
  );
  const paginatedKeys = filteredKeys.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <AdminGuard module="api_keys">
    <TooltipProvider>
      <div>
        {/* Description */}
        <p className="text-sm text-muted-foreground mb-5">
          {t.rich('apiKeys.intro', {
            header: 'X-API-Key: <key>',
            code: (chunks) => (
              <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">{chunks}</code>
            ),
          })}
        </p>

        {/* Toolbar */}
        <div className="flex items-center gap-2 mb-6">
          <div className="flex-1 max-w-xs">
            <SearchInput
              placeholder={t('apiKeys.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {editable && (
            <div className="ml-auto">
              <Button onClick={() => router.push('/api-keys/new')}>
                <Plus className="h-4 w-4 mr-1.5" />
                {t('apiKeys.newKey')}
              </Button>
            </div>
          )}
        </div>

        {/* Table */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tc('name')}</TableHead>
              <TableHead>{t('apiKeys.colKey')}</TableHead>
              <TableHead className="w-24">{t('apiKeys.colAccess')}</TableHead>
              <TableHead>{t('apiKeys.colContentTypes')}</TableHead>
              <TableHead className="w-36">{t('apiKeys.colLastUsed')}</TableHead>
              <TableHead className="w-28">{tc('actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-14" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                </TableRow>
              ))
            ) : paginatedKeys.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                  {search ? t('apiKeys.noMatch') : t('apiKeys.empty')}
                </TableCell>
              </TableRow>
            ) : paginatedKeys.map((k) => (
              <TableRow key={k.id}>
                {/* Name */}
                <TableCell>
                  <span className="flex items-center gap-2">
                    <Key className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div>
                      <p className="font-medium text-foreground">{k.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{new Date(k.createdAt).toLocaleDateString()}</p>
                    </div>
                  </span>
                </TableCell>

                {/* Key (masked) */}
                <TableCell>
                  <span className="flex items-center gap-2">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                      {k.key.slice(0, 14)}…{k.key.slice(-6)}
                    </code>
                    <Tooltip>
                      <TooltipTrigger render={<Button variant="ghost" size="icon-xs" onClick={() => copyToClipboard(k.key)} />}>
                        <Copy className="h-3 w-3" />
                      </TooltipTrigger>
                      <TooltipContent>{t('apiKeys.copyFullKey')}</TooltipContent>
                    </Tooltip>
                  </span>
                </TableCell>

                {/* Access */}
                <TableCell>
                  <Badge variant={ACCESS_BADGE[k.permissions.access]}>
                    {k.permissions.access.toUpperCase()}
                  </Badge>
                </TableCell>

                {/* Content types */}
                <TableCell>
                  {k.permissions.contentTypes[0] === '*' ? (
                    <Badge variant="purple">{t('apiKeys.allBadge')}</Badge>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {k.permissions.contentTypes.map((ct) => (
                        <Badge key={ct} variant="secondary">{ct}</Badge>
                      ))}
                    </div>
                  )}
                </TableCell>

                {/* Last used */}
                <TableCell className="text-muted-foreground">
                  {k.lastUsedAt
                    ? new Date(k.lastUsedAt).toLocaleString()
                    : <span className="italic">{t('apiKeys.never')}</span>}
                </TableCell>

                {/* Revoke */}
                <TableCell>
                  <AlertDialog>
                    <AlertDialogTrigger render={<Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" title={t('apiKeys.revoke')} disabled={!editable} />}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('apiKeys.revokeTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t.rich('apiKeys.revokeDescription', {
                            name: k.name,
                            strong: (chunks) => <strong>{chunks}</strong>,
                          })}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={() => handleDelete(k.id)}>
                          {t('apiKeys.revoke')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pagination total={filteredKeys.length} page={page} pageSize={PAGE_SIZE} onPage={setPage} />
      </div>
    </TooltipProvider>
    </AdminGuard>
  );
}
