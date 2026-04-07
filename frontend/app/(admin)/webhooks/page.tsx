'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, Zap, RefreshCw, Loader2, ToggleLeft, ToggleRight } from 'lucide-react';
import { toast } from 'sonner';
import AdminGuard from '@/components/AdminGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import api from '../../../lib/axios';

interface Webhook {
  id: number;
  name: string;
  url: string;
  secret?: string;
  events: string[];
  enabled: boolean;
  createdAt: string;
}

const ALL_EVENTS = [
  { value: 'entry.created',  label: 'Entry Created' },
  { value: 'entry.updated',  label: 'Entry Updated' },
  { value: 'entry.deleted',  label: 'Entry Deleted' },
  { value: 'entry.restored', label: 'Entry Restored' },
  { value: 'entry.purged',   label: 'Entry Purged' },
  { value: 'media.uploaded', label: 'Media Uploaded' },
  { value: 'media.deleted',  label: 'Media Deleted' },
];

const EVENT_COLORS: Record<string, string> = {
  'entry.created':  'bg-green-500/15 text-green-400',
  'entry.updated':  'bg-blue-500/15 text-blue-400',
  'entry.deleted':  'bg-red-500/15 text-red-400',
  'entry.restored': 'bg-yellow-500/15 text-yellow-400',
  'entry.purged':   'bg-red-700/20 text-red-300',
  'media.uploaded': 'bg-purple-500/15 text-purple-400',
  'media.deleted':  'bg-orange-500/15 text-orange-400',
  '*':              'bg-muted text-muted-foreground',
};

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(false);
  const [pinging, setPinging] = useState<number | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', url: '', secret: '', events: [] as string[] });

  const fetchWebhooks = async () => {
    setLoading(true);
    try {
      const res = await api.get('/webhooks');
      setWebhooks(res.data.data ?? res.data);
    } catch {
      toast.error('Failed to load webhooks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchWebhooks(); }, []);

  const toggleEvent = (ev: string) => {
    setForm((f) => ({
      ...f,
      events: f.events.includes(ev) ? f.events.filter((e) => e !== ev) : [...f.events, ev],
    }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Name is required');
    if (!form.url.trim()) return toast.error('URL is required');
    if (form.events.length === 0) return toast.error('Select at least one event');

    setSaving(true);
    try {
      await api.post('/webhooks', {
        name: form.name.trim(),
        url: form.url.trim(),
        secret: form.secret.trim() || undefined,
        events: form.events,
      });
      toast.success('Webhook registered');
      setForm({ name: '', url: '', secret: '', events: [] });
      setShowForm(false);
      fetchWebhooks();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create webhook');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (hook: Webhook) => {
    try {
      await api.patch(`/webhooks/${hook.id}/toggle`, { enabled: !hook.enabled });
      toast.success(hook.enabled ? 'Webhook disabled' : 'Webhook enabled');
      fetchWebhooks();
    } catch {
      toast.error('Failed to update webhook');
    }
  };

  const handlePing = async (hook: Webhook) => {
    setPinging(hook.id);
    try {
      await api.post(`/webhooks/${hook.id}/ping`);
      toast.success(`Ping sent to ${hook.url}`);
    } catch {
      toast.error('Ping failed');
    } finally {
      setPinging(null);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/webhooks/${id}`);
      toast.success('Webhook deleted');
      fetchWebhooks();
    } catch {
      toast.error('Failed to delete webhook');
    }
  };

  return (
    <AdminGuard>
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Receive HTTP POST notifications when content changes.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchWebhooks}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Refresh
          </Button>
          <Button onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add Webhook
          </Button>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-8 rounded-lg border border-border bg-card p-5 space-y-4"
        >
          <p className="text-sm font-semibold">New Webhook</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="wh-name">Name</Label>
              <Input
                id="wh-name"
                placeholder="e.g. Notify deploy server"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wh-url">Endpoint URL</Label>
              <Input
                id="wh-url"
                type="url"
                placeholder="https://example.com/webhook"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wh-secret">
              Signing Secret{' '}
              <span className="text-muted-foreground font-normal">(optional — HMAC-SHA256)</span>
            </Label>
            <Input
              id="wh-secret"
              placeholder="my-secret-key"
              value={form.secret}
              onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label>Events</Label>
            <div className="flex flex-wrap gap-2">
              {ALL_EVENTS.map((ev) => (
                <button
                  key={ev.value}
                  type="button"
                  onClick={() => toggleEvent(ev.value)}
                  className={cn(
                    'text-xs px-2.5 py-1 rounded-full border transition-colors',
                    form.events.includes(ev.value)
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/50',
                  )}
                >
                  {ev.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    events: f.events.includes('*') ? [] : ['*'],
                  }))
                }
                className={cn(
                  'text-xs px-2.5 py-1 rounded-full border transition-colors',
                  form.events.includes('*')
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-muted-foreground hover:border-primary/50',
                )}
              >
                * All Events
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Register Webhook
            </Button>
          </div>
        </form>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-lg border border-border p-4 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          ))}
        </div>
      ) : webhooks.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Zap className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No webhooks registered yet</p>
          <p className="text-xs mt-1">Add one to receive real-time content change notifications.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((hook) => (
            <div
              key={hook.id}
              className={cn(
                'rounded-lg border border-border bg-card p-4',
                !hook.enabled && 'opacity-60',
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-foreground">{hook.name}</span>
                    <span
                      className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded font-semibold',
                        hook.enabled
                          ? 'bg-green-500/15 text-green-400'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {hook.enabled ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mb-2">{hook.url}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {hook.events.map((ev) => (
                      <span
                        key={ev}
                        className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded',
                          EVENT_COLORS[ev] ?? 'bg-muted text-muted-foreground',
                        )}
                      >
                        {ev}
                      </span>
                    ))}
                    {hook.secret && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        🔒 signed
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Toggle */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggle(hook)}
                    title={hook.enabled ? 'Disable' : 'Enable'}
                    className="h-8 text-muted-foreground"
                  >
                    {hook.enabled
                      ? <ToggleRight className="h-4 w-4 text-green-400" />
                      : <ToggleLeft className="h-4 w-4" />
                    }
                  </Button>

                  {/* Ping */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePing(hook)}
                    disabled={pinging === hook.id}
                    title="Send test ping"
                    className="h-8 text-muted-foreground"
                  >
                    {pinging === hook.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Zap className="h-4 w-4" />
                    }
                  </Button>

                  {/* Delete */}
                  <AlertDialog>
                    <AlertDialogTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Delete webhook"
                          className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        />
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete webhook?</AlertDialogTitle>
                        <AlertDialogDescription>
                          <span className="font-medium">"{hook.name}"</span> will stop receiving events.
                          This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={() => handleDelete(hook.id)}>
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    </AdminGuard>
  );
}
