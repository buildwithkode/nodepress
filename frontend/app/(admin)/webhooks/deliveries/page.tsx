'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/axios';

type Delivery = {
  id: number;
  webhookId: number;
  event: string;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  responseStatus: number | null;
  errorMessage: string | null;
  nextRetryAt: string | null;
  createdAt: string;
};

const STATUS_STYLES: Record<string, string> = {
  delivered: 'bg-green-500/10 text-green-400 border border-green-500/20',
  failed:    'bg-red-500/10 text-red-400 border border-red-500/20',
  pending:   'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
};

export default function WebhookDeliveriesPage() {
  const router = useRouter();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const limit = 25;

  useEffect(() => {
    setLoading(true);
    api.get('/webhooks/deliveries', { params: { page, limit } })
      .then((res) => {
        setDeliveries(res.data.data);
        setTotal(res.data.meta.total);
      })
      .finally(() => setLoading(false));
  }, [page]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/webhooks')}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Webhooks
        </button>
        <h1 className="text-xl font-semibold">Delivery Log</h1>
        <span className="text-xs text-muted-foreground border border-border rounded-full px-2 py-0.5">
          {total} total
        </span>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : deliveries.length === 0 ? (
        <div className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">
          No deliveries yet. Webhook events will appear here once fired.
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Event</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Attempts</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">HTTP</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Next retry</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {deliveries.map((d) => (
                <tr key={d.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <code className="text-xs font-mono text-pink-400">{d.event}</code>
                    {d.errorMessage && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[220px]" title={d.errorMessage}>
                        {d.errorMessage}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_STYLES[d.status] ?? ''}`}>
                      {d.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{d.attempts}/3</td>
                  <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">
                    {d.responseStatus ?? '—'}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground text-xs">
                    {d.nextRetryAt
                      ? new Date(d.nextRetryAt).toLocaleString()
                      : d.status === 'delivered' ? '—' : 'exhausted'}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">
                    {new Date(d.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-muted-foreground">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded border border-border disabled:opacity-40 hover:bg-muted/40 transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded border border-border disabled:opacity-40 hover:bg-muted/40 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
