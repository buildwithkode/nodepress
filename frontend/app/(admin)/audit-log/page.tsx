'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ScrollText } from 'lucide-react';
import api from '@/lib/axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

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
      .catch(() => toast.error('Failed to load audit log'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(1, resource ?? ''); setPage(1); }, [resource]);

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-4 max-w-5xl">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ScrollText className="h-4 w-4" /> Audit Log
              </CardTitle>
              <CardDescription className="mt-1">
                Every create, update, and delete operation recorded with actor and timestamp.
              </CardDescription>
            </div>
            <Select value={resource || 'all'} onValueChange={(v: string | null) => setResource(v === 'all' ? '' : (v ?? ''))}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All resources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All resources</SelectItem>
                <SelectItem value="entry">Entries</SelectItem>
                <SelectItem value="content_type">Content Types</SelectItem>
                <SelectItem value="user">Users</SelectItem>
                <SelectItem value="api_key">API Keys</SelectItem>
                <SelectItem value="form">Forms</SelectItem>
                <SelectItem value="media">Media</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>ID / Name</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {!loading && logs.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No audit events yet.</TableCell></TableRow>
              )}
              {!loading && logs.map((log) => (
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
              <span>{total} events</span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => { setPage(page - 1); load(page - 1); }}
                  className="px-3 py-1 rounded border disabled:opacity-40 hover:bg-muted"
                >
                  Previous
                </button>
                <span>Page {page} of {totalPages}</span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => { setPage(page + 1); load(page + 1); }}
                  className="px-3 py-1 rounded border disabled:opacity-40 hover:bg-muted"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
