'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ScrollText } from 'lucide-react';
import AdminGuard from '@/components/AdminGuard';
import api from '@/lib/axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslations } from 'use-intl';

interface AuditEntry {
  id: number;
  userEmail: string;
  action: string;
  resource: string;
  resourceId: string;
  metadata: any;
  ip: string | null;
  createdAt: string;
}

const ACTION_COLORS: Record<string, string> = {
  created:          'text-emerald-600 dark:text-emerald-400',
  updated:          'text-blue-600 dark:text-blue-400',
  deleted:          'text-red-600 dark:text-red-400',
  restored:         'text-amber-600 dark:text-amber-400',
  role_changed:     'text-purple-600 dark:text-purple-400',
  password_changed: 'text-muted-foreground',
  login:            'text-muted-foreground',
};

export default function AuditLogPage() {
  const t = useTranslations('developer');
  const tc = useTranslations('common');
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [resource, setResource] = useState('');
  const [page, setPage] = useState(1);
  const LIMIT = 50;

  const load = (p = 1, res = resource) => {
    setLoading(true);
    const params: any = { page: p, limit: LIMIT };
    if (res) params.resource = res;
    api.get('/audit-log', { params })
      .then((r) => { setLogs(r.data.data); setTotal(r.data.meta.total); })
      .catch(() => toast.error(t('auditLog.loadFailed')))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(1, resource ?? ''); setPage(1); }, [resource]);

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <AdminGuard>
    <div className="space-y-4 w-full">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ScrollText className="h-4 w-4" /> {t('auditLog.title')}
              </CardTitle>
              <CardDescription className="mt-1">
                {t('auditLog.description')}
              </CardDescription>
            </div>
            <Select value={resource || 'all'} onValueChange={(v: string | null) => setResource(v === 'all' ? '' : (v ?? ''))}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t('auditLog.allResources')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('auditLog.allResources')}</SelectItem>
                <SelectItem value="entry">{t('auditLog.resources.entry')}</SelectItem>
                <SelectItem value="content_type">{t('auditLog.resources.content_type')}</SelectItem>
                <SelectItem value="user">{t('auditLog.resources.user')}</SelectItem>
                <SelectItem value="api_key">{t('auditLog.resources.api_key')}</SelectItem>
                <SelectItem value="form">{t('auditLog.resources.form')}</SelectItem>
                <SelectItem value="media">{t('auditLog.resources.media')}</SelectItem>
                <SelectItem value="plugin">{t('auditLog.resources.plugin')}</SelectItem>
                <SelectItem value="settings">{t('auditLog.resources.settings')}</SelectItem>
                <SelectItem value="release">{t('auditLog.resources.release')}</SelectItem>
                <SelectItem value="role">{t('auditLog.resources.role')}</SelectItem>
                <SelectItem value="redirect">{t('auditLog.resources.redirect')}</SelectItem>
                <SelectItem value="component">{t('auditLog.resources.component')}</SelectItem>
                <SelectItem value="import">{t('auditLog.resources.import')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('auditLog.colTime')}</TableHead>
                <TableHead>{t('auditLog.colUser')}</TableHead>
                <TableHead>{t('auditLog.colAction')}</TableHead>
                <TableHead>{t('auditLog.colResource')}</TableHead>
                <TableHead>{t('auditLog.colIdName')}</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  </TableRow>
                ))
              ) : logs.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t('auditLog.empty')}</TableCell></TableRow>
              ) : logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sm font-medium max-w-[160px] truncate">
                    {log.userEmail}
                  </TableCell>
                  <TableCell>
                    <span className={`text-xs font-semibold uppercase tracking-wide ${ACTION_COLORS[log.action] ?? 'text-muted-foreground'}`}>
                      {log.action.replace(/_/g, ' ')}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {log.resource.replace(/_/g, ' ')}
                  </TableCell>
                  <TableCell className="text-sm font-mono max-w-[160px] truncate">
                    {log.resourceId}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">
                    {log.ip ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
              <span>{t('auditLog.events', { count: total })}</span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => { setPage(page - 1); load(page - 1); }}
                  className="px-3 py-1 rounded border disabled:opacity-40 hover:bg-muted"
                >
                  {tc('previous')}
                </button>
                <span>{tc('page', { page, total: totalPages })}</span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => { setPage(page + 1); load(page + 1); }}
                  className="px-3 py-1 rounded border disabled:opacity-40 hover:bg-muted"
                >
                  {tc('next')}
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </AdminGuard>
  );
}
