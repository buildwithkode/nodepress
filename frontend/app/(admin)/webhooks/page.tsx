'use client';

import { useEffect, useState } from 'react';
import {
  Plus,
  Trash2,
  Zap,
  RefreshCw,
  Loader2,
  ToggleLeft,
  ToggleRight,
  Pencil,
  Eye,
  AlertCircle,
  CheckCircle2,
  Clock,
  Send,
  Radio,
  FileCode2,
} from 'lucide-react';
import { toast } from 'sonner';
import AdminGuard from '@/components/AdminGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import api from '../../../lib/axios';
import { useTranslations } from 'use-intl';

interface Webhook {
  id: number;
  name: string;
  url: string;
  secret?: string;
  events: string[];
  enabled: boolean;
  createdAt: string;
}

interface WebhookDelivery {
  id: number;
  webhookId: number;
  event: string;
  payload: any;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  responseStatus: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  webhook?: {
    id: number;
    name: string;
    url: string;
    enabled: boolean;
  } | null;
}

const ALL_EVENTS = [
  { value: 'entry.created',  labelKey: 'entryCreated' },
  { value: 'entry.updated',  labelKey: 'entryUpdated' },
  { value: 'entry.deleted',  labelKey: 'entryDeleted' },
  { value: 'entry.restored', labelKey: 'entryRestored' },
  { value: 'entry.purged',   labelKey: 'entryPurged' },
  { value: 'media.uploaded', labelKey: 'mediaUploaded' },
  { value: 'media.deleted',  labelKey: 'mediaDeleted' },
] as const;

const EVENT_COLORS: Record<string, string> = {
  'entry.created':  'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  'entry.updated':  'bg-blue-500/15 text-blue-400 border-blue-500/30',
  'entry.deleted':  'bg-red-500/15 text-red-400 border-red-500/30',
  'entry.restored': 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  'entry.purged':   'bg-rose-700/20 text-rose-300 border-rose-700/30',
  'media.uploaded': 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  'media.deleted':  'bg-orange-500/15 text-orange-400 border-orange-500/30',
  '*':              'bg-muted text-muted-foreground border-border',
};

export default function WebhooksPage() {
  const t = useTranslations('developer');
  const tc = useTranslations('common');
  const [activeTab, setActiveTab] = useState('webhooks');
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(false);
  const [pinging, setPinging] = useState<number | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', url: '', secret: '', events: [] as string[] });

  // Deliveries state
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState<'all' | 'failed' | 'delivered' | 'pending'>('all');
  const [selectedWebhookFilter, setSelectedWebhookFilter] = useState<number | null>(null);
  const [retryingDeliveryId, setRetryingDeliveryId] = useState<number | null>(null);
  const [inspectDelivery, setInspectDelivery] = useState<WebhookDelivery | null>(null);

  const resetForm = () => {
    setForm({ name: '', url: '', secret: '', events: [] });
    setEditingId(null);
  };

  const openCreate = () => {
    if (showForm && editingId === null) { setShowForm(false); return; }
    resetForm();
    setShowForm(true);
  };

  const openEdit = (hook: Webhook) => {
    setForm({ name: hook.name, url: hook.url, secret: hook.secret ?? '', events: hook.events });
    setEditingId(hook.id);
    setShowForm(true);
  };

  const fetchWebhooks = async () => {
    setLoading(true);
    try {
      const res = await api.get('/webhooks');
      setWebhooks(res.data.data ?? res.data);
    } catch {
      toast.error(t('webhooks.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const fetchDeliveries = async (status = deliveryStatusFilter, webhookId?: number | null) => {
    setDeliveriesLoading(true);
    try {
      const params: any = { limit: 50 };
      if (status !== 'all') params.status = status;
      const targetWh = webhookId !== undefined ? webhookId : selectedWebhookFilter;
      if (targetWh !== null) params.webhookId = targetWh;
      const res = await api.get('/webhooks/deliveries', { params });
      setDeliveries(res.data.data ?? []);
    } catch {
      toast.error(t('webhooks.loadDeliveriesFailed'));
    } finally {
      setDeliveriesLoading(false);
    }
  };

  useEffect(() => {
    fetchWebhooks();
    fetchDeliveries('all');
  }, []);

  const handleStatusFilterChange = (status: 'all' | 'failed' | 'delivered' | 'pending') => {
    setDeliveryStatusFilter(status);
    fetchDeliveries(status);
  };

  const toggleEvent = (ev: string) => {
    setForm((f) => ({
      ...f,
      events: f.events.includes(ev) ? f.events.filter((e) => e !== ev) : [...f.events, ev],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error(t('webhooks.nameRequired'));
    if (!form.url.trim()) return toast.error(t('webhooks.urlRequired'));
    if (form.events.length === 0) return toast.error(t('webhooks.eventsRequired'));

    setSaving(true);
    try {
      if (editingId !== null) {
        await api.patch(`/webhooks/${editingId}`, {
          name: form.name.trim(),
          url: form.url.trim(),
          secret: form.secret.trim() || null,
          events: form.events,
        });
        toast.success(t('webhooks.updated'));
      } else {
        await api.post('/webhooks', {
          name: form.name.trim(),
          url: form.url.trim(),
          secret: form.secret.trim() || undefined,
          events: form.events,
        });
        toast.success(t('webhooks.registered'));
      }
      resetForm();
      setShowForm(false);
      fetchWebhooks();
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('webhooks.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (hook: Webhook) => {
    try {
      await api.patch(`/webhooks/${hook.id}/toggle`, { enabled: !hook.enabled });
      toast.success(hook.enabled ? t('webhooks.disabledToast') : t('webhooks.enabledToast'));
      fetchWebhooks();
    } catch {
      toast.error(t('webhooks.updateFailed'));
    }
  };

  const handlePing = async (hook: Webhook) => {
    setPinging(hook.id);
    try {
      await api.post(`/webhooks/${hook.id}/ping`);
      toast.success(t('webhooks.pingSent', { url: hook.url }));
    } catch {
      toast.error(t('webhooks.pingFailed'));
    } finally {
      setPinging(null);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/webhooks/${id}`);
      toast.success(t('webhooks.deleted'));
      fetchWebhooks();
    } catch {
      toast.error(t('webhooks.deleteFailed'));
    }
  };

  // ── 1-Click UI Re-Delivery Handler ──────────────────────────────────────────

  const handleRedeliver = async (deliveryId: number) => {
    setRetryingDeliveryId(deliveryId);
    try {
      const res = await api.post(`/webhooks/deliveries/${deliveryId}/retry`);
      if (res.data.success) {
        toast.success(res.data.message || t('webhooks.redelivered'));
      } else {
        toast.error(res.data.message || t('webhooks.redeliveryFailed'));
      }
      // Refresh current deliveries view to reflect fresh status & attempts
      fetchDeliveries(deliveryStatusFilter);
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('webhooks.redeliverError'));
    } finally {
      setRetryingDeliveryId(null);
    }
  };

  const failedCount = deliveries.filter((d) => d.status === 'failed').length;

  return (
    <AdminGuard>
    <div className="space-y-6">
      {/* Top Navigation / Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="webhooks" className="flex items-center gap-2">
              <Radio className="h-4 w-4" />
              <span>{t('webhooks.tabWebhooks')}</span>
              <span className="ml-1 px-1.5 py-0.2 text-[11px] rounded-full bg-background font-mono">
                {webhooks.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="deliveries" className="flex items-center gap-2">
              <FileCode2 className="h-4 w-4" />
              <span>{t('webhooks.tabDeliveries')}</span>
              {failedCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 text-[11px] rounded-full bg-red-500/20 text-red-400 font-mono font-semibold">
                  {t('webhooks.failedCount', { count: failedCount })}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            {activeTab === 'webhooks' ? (
              <>
                <Button variant="outline" size="sm" onClick={fetchWebhooks} disabled={loading}>
                  <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', loading && 'animate-spin')} />
                  {tc('refresh')}
                </Button>
                <Button size="sm" onClick={openCreate}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  {t('webhooks.addWebhook')}
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => fetchDeliveries()} disabled={deliveriesLoading}>
                <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', deliveriesLoading && 'animate-spin')} />
                {t('webhooks.refreshLogs')}
              </Button>
            )}
          </div>
        </div>

        {/* ── Tab 1: Webhook Endpoints ───────────────────────────────────────── */}
        <TabsContent value="webhooks" className="space-y-6 pt-4">
          {/* Add / Edit Form */}
          {showForm && (
            <form
              onSubmit={handleSubmit}
              className="rounded-lg border border-border bg-card p-5 space-y-4 shadow-sm"
            >
              <p className="text-sm font-semibold">{editingId !== null ? t('webhooks.editTitle') : t('webhooks.registerTitle')}</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="wh-name">{tc('name')}</Label>
                  <Input
                    id="wh-name"
                    placeholder={t('webhooks.namePlaceholder')}
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wh-url">{t('webhooks.endpointUrl')}</Label>
                  <Input
                    id="wh-url"
                    type="url"
                    placeholder="https://api.example.com/webhooks/nodepress"
                    value={form.url}
                    onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wh-secret">
                  {t('webhooks.signingSecret')}{' '}
                  <span className="text-muted-foreground font-normal">{t('webhooks.signingSecretHint', { header: 'X-NodePress-Signature' })}</span>
                </Label>
                <Input
                  id="wh-secret"
                  placeholder="whsec_xxxxxxxxxxxxxxxxx"
                  value={form.secret}
                  onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('webhooks.triggerEvents')}</Label>
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
                      {t(`webhooks.events.${ev.labelKey}`)}
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
                    * {t('webhooks.allEvents')}
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => { setShowForm(false); resetForm(); }}>
                  {tc('cancel')}
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                  {editingId !== null ? t('webhooks.saveChanges') : t('webhooks.registerWebhook')}
                </Button>
              </div>
            </form>
          )}

          {/* Webhooks List */}
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
            <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
              <Zap className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">{t('webhooks.emptyTitle')}</p>
              <p className="text-xs mt-1 text-muted-foreground">{t('webhooks.emptyDescription')}</p>
              <Button size="sm" onClick={openCreate} className="mt-4">
                <Plus className="h-4 w-4 mr-1.5" />
                {t('webhooks.registerFirst')}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {webhooks.map((hook) => (
                <div
                  key={hook.id}
                  className={cn(
                    'rounded-lg border border-border bg-card p-4 transition-colors',
                    !hook.enabled && 'opacity-60 bg-muted/20',
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-foreground">{hook.name}</span>
                        <span
                          className={cn(
                            'text-[10px] px-1.5 py-0.5 rounded font-semibold',
                            hook.enabled
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : 'bg-muted text-muted-foreground border border-border',
                          )}
                        >
                          {hook.enabled ? t('webhooks.active') : tc('disabled')}
                        </span>
                      </div>
                      <p className="text-xs font-mono text-muted-foreground truncate mb-2">{hook.url}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {hook.events.map((ev) => (
                          <span
                            key={ev}
                            className={cn(
                              'text-[10px] px-2 py-0.5 rounded-full border',
                              EVENT_COLORS[ev] ?? 'bg-muted text-muted-foreground border-border',
                            )}
                          >
                            {ev}
                          </span>
                        ))}
                        {hook.secret && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                            🔒 HMAC-SHA256
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          setSelectedWebhookFilter(hook.id);
                          setActiveTab('deliveries');
                          fetchDeliveries(deliveryStatusFilter, hook.id);
                        }}
                        title={t('webhooks.viewDeliveries')}
                      >
                        <FileCode2 className="h-3.5 w-3.5 text-indigo-400" />
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleToggle(hook)}
                        title={hook.enabled ? t('webhooks.disableWebhook') : t('webhooks.enableWebhook')}
                      >
                        {hook.enabled ? <ToggleRight className="h-4 w-4 text-emerald-400" /> : <ToggleLeft className="h-4 w-4" />}
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openEdit(hook)}
                        title={t('webhooks.editTitle')}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handlePing(hook)}
                        disabled={pinging === hook.id}
                        title={t('webhooks.sendPing')}
                      >
                        {pinging === hook.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                      </Button>

                      <AlertDialog>
                        <AlertDialogTrigger render={
                          <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" />
                        }>
                          <Trash2 className="h-3.5 w-3.5" />
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t('webhooks.deleteTitle')}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t.rich('webhooks.deleteDescription', {
                                name: hook.name,
                                b: (chunks) => <span className="font-medium">{chunks}</span>,
                              })}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
                            <AlertDialogAction variant="destructive" onClick={() => handleDelete(hook.id)}>
                              {tc('delete')}
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
        </TabsContent>

        {/* ── Tab 2: Delivery Logs & Dead-Letter Queue (DLQ) ────────────────── */}
        <TabsContent value="deliveries" className="space-y-4 pt-4">
          {/* Status Filter Bar */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              {(['all', 'failed', 'delivered', 'pending'] as const).map((st) => (
                <Button
                  key={st}
                  variant={deliveryStatusFilter === st ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleStatusFilterChange(st)}
                  className="capitalize text-xs h-7"
                >
                  {t(`webhooks.statusFilter.${st}`)}
                </Button>
              ))}
            </div>

            {selectedWebhookFilter !== null && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/30 text-xs text-indigo-400">
                <span>{t.rich('webhooks.filterLabel', { name: webhooks.find(w => w.id === selectedWebhookFilter)?.name || t('webhooks.webhookNumber', { id: selectedWebhookFilter }), strong: (chunks) => <strong>{chunks}</strong> })}</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedWebhookFilter(null);
                    fetchDeliveries(deliveryStatusFilter, null);
                  }}
                  className="ml-1 hover:text-foreground font-bold"
                  title={t('webhooks.clearFilter')}
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* Deliveries Table */}
          {deliveriesLoading ? (
            <div className="space-y-2 py-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-md" />
              ))}
            </div>
          ) : deliveries.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
              <FileCode2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">{t('webhooks.noDeliveries')}</p>
              <p className="text-xs mt-1">{t('webhooks.noDeliveriesDescription')}</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">{tc('status')}</TableHead>
                    <TableHead>{t('webhooks.colEvent')}</TableHead>
                    <TableHead>{t('webhooks.colDestination')}</TableHead>
                    <TableHead className="w-24">{t('webhooks.colAttempts')}</TableHead>
                    <TableHead className="w-36">{t('webhooks.colTime')}</TableHead>
                    <TableHead className="text-right w-36">{tc('actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.map((del) => (
                    <TableRow key={del.id} className="hover:bg-muted/40 transition-colors">
                      {/* Status badge */}
                      <TableCell>
                        {del.status === 'delivered' ? (
                          <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1 font-mono text-[11px]">
                            <CheckCircle2 className="h-3 w-3" />
                            {del.responseStatus ?? 200} OK
                          </Badge>
                        ) : del.status === 'failed' ? (
                          <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/30 gap-1 font-mono text-[11px]">
                            <AlertCircle className="h-3 w-3" />
                            {del.responseStatus ? `HTTP ${del.responseStatus}` : t('webhooks.failed')}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30 gap-1 font-mono text-[11px]">
                            <Clock className="h-3 w-3" />
                            {t('webhooks.pending')}
                          </Badge>
                        )}
                      </TableCell>

                      {/* Event */}
                      <TableCell>
                        <span className={cn('text-[11px] px-2 py-0.5 rounded-full border font-mono', EVENT_COLORS[del.event] ?? 'bg-muted text-muted-foreground border-border')}>
                          {del.event}
                        </span>
                      </TableCell>

                      {/* Destination */}
                      <TableCell className="max-w-[260px] truncate">
                        <div className="font-medium text-xs text-foreground truncate">
                          {del.webhook?.name || t('webhooks.webhookNumber', { id: del.webhookId })}
                        </div>
                        <div className="text-[11px] font-mono text-muted-foreground truncate">
                          {del.webhook?.url || '—'}
                        </div>
                      </TableCell>

                      {/* Attempts */}
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {t('webhooks.tries', { count: del.attempts })}
                      </TableCell>

                      {/* Time */}
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(del.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title={t('webhooks.inspect')}
                            onClick={() => setInspectDelivery(del)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>

                          {/* 1-Click UI Re-Delivery */}
                          <Button
                            variant="outline"
                            size="xs"
                            disabled={retryingDeliveryId === del.id}
                            onClick={() => handleRedeliver(del.id)}
                            className="text-xs h-7 gap-1 hover:bg-primary hover:text-primary-foreground transition-colors"
                            title={t('webhooks.redispatchHint')}
                          >
                            {retryingDeliveryId === del.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Send className="h-3 w-3" />
                            )}
                            {t('webhooks.redeliver')}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Inspect Payload & Error Dialog ─────────────────────────────────── */}
      <Dialog open={!!inspectDelivery} onOpenChange={(open) => !open && setInspectDelivery(null)}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileCode2 className="h-5 w-5 text-blue-500" />
              {t('webhooks.detailsTitle', { id: inspectDelivery?.id ?? '' })}
            </DialogTitle>
            <DialogDescription className="text-xs font-mono">
              {t('webhooks.detailsEvent')} <span className="text-foreground font-semibold">{inspectDelivery?.event}</span> • {t('webhooks.detailsDestination')}{' '}
              <span className="text-foreground">{inspectDelivery?.webhook?.url || t('webhooks.webhookNumber', { id: inspectDelivery?.webhookId ?? '' })}</span>
            </DialogDescription>
          </DialogHeader>

          {inspectDelivery && (
            <div className="space-y-4 overflow-y-auto pr-1 flex-1">
              {/* Delivery Meta */}
              <div className="grid grid-cols-3 gap-2 p-3 rounded-lg bg-muted/40 border border-border text-xs">
                <div>
                  <span className="text-muted-foreground block text-[10px]">{t('webhooks.metaStatus')}</span>
                  <span className="font-semibold capitalize text-foreground">{inspectDelivery.status}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">{t('webhooks.metaResponseStatus')}</span>
                  <span className="font-mono text-foreground">{inspectDelivery.responseStatus ?? tc('none')}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">{t('webhooks.metaAttempts')}</span>
                  <span className="font-mono text-foreground">{inspectDelivery.attempts}</span>
                </div>
              </div>

              {/* Error message (if any) */}
              {inspectDelivery.errorMessage && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-red-400 mb-1">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {t('webhooks.errorMessage')}
                  </div>
                  <pre className="font-mono text-[11px] text-red-300 whitespace-pre-wrap">
                    {inspectDelivery.errorMessage}
                  </pre>
                </div>
              )}

              {/* Payload Viewer */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium flex items-center justify-between">
                  <span>{t('webhooks.payload')}</span>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="h-6 text-xs"
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(inspectDelivery.payload, null, 2));
                      toast.success(t('webhooks.payloadCopied'));
                    }}
                  >
                    {t('webhooks.copyJson')}
                  </Button>
                </Label>
                <pre className="p-3 rounded-lg bg-[#111] border border-white/10 font-mono text-xs text-emerald-400 overflow-x-auto max-h-60">
                  {JSON.stringify(inspectDelivery.payload, null, 2)}
                </pre>
              </div>
            </div>
          )}

          <DialogFooter className="pt-2 border-t border-border flex sm:justify-between items-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (inspectDelivery) handleRedeliver(inspectDelivery.id);
                setInspectDelivery(null);
              }}
              className="gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              {t('webhooks.redeliverNow')}
            </Button>

            <Button variant="ghost" size="sm" onClick={() => setInspectDelivery(null)}>
              {tc('close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </AdminGuard>
  );
}
