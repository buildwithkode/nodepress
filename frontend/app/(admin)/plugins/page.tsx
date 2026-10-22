'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Puzzle,
  Search,
  CheckCircle2,
  XCircle,
  Settings2,
  ShieldCheck,
  Zap,
  Activity,
  Layers,
  FileText,
  Globe,
  Sliders,
  Filter,
  Lock,
  Loader2,
  RefreshCw,
  ExternalLink,
  Sparkles,
  Upload,
  Trash2,
  Power,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { PluginSettingsDrawer, PluginItem } from '@/components/PluginSettingsDrawer';
import { PluginUploadDialog } from '@/components/PluginUploadDialog';
import { toast } from 'sonner';
import api from '@/lib/axios';
import { usePlugins } from '@/context/PluginContext';
import { useTranslations } from 'use-intl';

const CATEGORY_TABS = [
  { id: 'all' },
  { id: 'content' },
  { id: 'seo' },
  { id: 'utilities' },
  { id: 'integrations' },
  { id: 'security' },
] as const;

export default function PluginsPage() {
  const t = useTranslations('developer');
  const tc = useTranslations('common');
  const { refreshPlugins } = usePlugins();
  const [plugins, setPlugins] = useState<PluginItem[]>([]);
  const [meta, setMeta] = useState<{
    totalPlugins: number;
    enabledPlugins: number;
    totalHooks: number;
    totalFilters: number;
    activeEvents: string[];
    /** Admins only: whether uploads are allowed here (null for editors). */
    uploads?: { mode: 'signed' | 'unsigned' | 'off'; maxUploadMb: number } | null;
    restartRequired?: boolean;
  }>({
    totalPlugins: 0,
    enabledPlugins: 0,
    totalHooks: 0,
    totalFilters: 0,
    activeEvents: [],
  });

  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [selectedPlugin, setSelectedPlugin] = useState<PluginItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [restarting, setRestarting] = useState(false);

  const fetchPlugins = async () => {
    try {
      setLoading(true);
      const res = await api.get('/plugins');
      setPlugins(res.data.plugins || []);
      setMeta(res.data.meta || {});
    } catch (err) {
      console.error('Failed to load plugins:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlugins();
  }, []);

  const handleToggle = async (plugin: PluginItem) => {
    const newStatus = !plugin.enabled;
    setTogglingId(plugin.id);

    // Optimistic update
    setPlugins((prev) =>
      prev.map((p) => (p.id === plugin.id ? { ...p, enabled: newStatus } : p)),
    );

    try {
      const res = await api.patch(`/plugins/${plugin.id}/toggle`, { enabled: newStatus });
      setPlugins((prev) =>
        prev.map((p) => (p.id === plugin.id ? { ...p, enabled: res.data.enabled } : p)),
      );
      setMeta((prev) => ({
        ...prev,
        enabledPlugins: prev.enabledPlugins + (newStatus ? 1 : -1),
      }));
      await refreshPlugins();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? (newStatus ? t('plugins.enableFailed', { name: plugin.name }) : t('plugins.disableFailed', { name: plugin.name })));
      // Revert optimistic update
      setPlugins((prev) =>
        prev.map((p) => (p.id === plugin.id ? { ...p, enabled: plugin.enabled } : p)),
      );
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (plugin: PluginItem) => {
    try {
      await api.delete(`/plugins/packages/${plugin.id}`);
      toast.success(t('plugins.deletedToast', { name: plugin.name }));
      await fetchPlugins();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? t('plugins.deleteFailed', { name: plugin.name }));
    }
  };

  /** Ask the server to exit; its supervisor (Docker, PM2, systemd) starts it again. */
  const handleRestart = async () => {
    setRestarting(true);
    try {
      await api.post('/plugins/restart');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? t('plugins.restartFailed'));
      setRestarting(false);
      return;
    }
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    await sleep(2500);
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      try {
        await api.get('/health', { timeout: 3000 });
        await fetchPlugins();
        await refreshPlugins();
        toast.success(t('plugins.restarted'));
        setRestarting(false);
        return;
      } catch {
        await sleep(2000);
      }
    }
    setRestarting(false);
    toast.error(
      t('plugins.restartTimeout', { command: 'npm run start:dev' }),
      { duration: 15000 },
    );
  };

  const handleOpenSettings = (plugin: PluginItem) => {
    setSelectedPlugin(plugin);
    setDrawerOpen(true);
  };

  const handleSettingsSaved = (updated: PluginItem) => {
    setPlugins((prev) =>
      prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)),
    );
    setSelectedPlugin(updated);
  };

  const filteredPlugins = useMemo(() => {
    return plugins.filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.id.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCat =
        activeCategory === 'all' ||
        (p.category || 'utilities').toLowerCase() === activeCategory.toLowerCase();

      return matchesSearch && matchesCat;
    });
  }, [plugins, searchQuery, activeCategory]);

  const getCategoryIcon = (category: string) => {
    switch (category?.toLowerCase()) {
      case 'content':
        return <FileText className="w-4 h-4 text-blue-400" />;
      case 'seo':
        return <Globe className="w-4 h-4 text-amber-400" />;
      case 'security':
        return <Lock className="w-4 h-4 text-emerald-400" />;
      case 'integrations':
        return <Zap className="w-4 h-4 text-purple-400" />;
      default:
        return <Puzzle className="w-4 h-4 text-primary" />;
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Puzzle className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {t('plugins.title')}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('plugins.subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchPlugins} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            {tc('refresh')}
          </Button>
          {meta.uploads && (
            <Button
              size="sm"
              onClick={() => setUploadOpen(true)}
              disabled={meta.uploads.mode === 'off'}
              title={meta.uploads.mode === 'off' ? t('plugins.uploadsOff', { env: 'PLUGIN_UPLOADS=off' }) : undefined}
            >
              <Upload className="w-3.5 h-3.5 mr-1.5" />
              {t('plugins.uploadPlugin')}
            </Button>
          )}
        </div>
      </div>

      {/* Restart banner */}
      {meta.restartRequired && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-blue-500/30 bg-blue-500/5 px-4 py-3">
          <div className="flex items-start gap-2.5 text-sm">
            <Clock className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" />
            <div>
              <div className="font-medium text-foreground">{t('plugins.restartNeeded')}</div>
              <div className="text-xs text-muted-foreground">
                {t('plugins.restartNeededHint')}
              </div>
            </div>
          </div>
          {meta.uploads && (
            <Button size="sm" onClick={handleRestart} disabled={restarting}>
              {restarting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Power className="w-3.5 h-3.5 mr-1.5" />}
              {restarting ? t('plugins.restarting') : t('plugins.restartNow')}
            </Button>
          )}
        </div>
      )}

      {/* Metric Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-card border border-border flex items-center gap-3.5 shadow-xs">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Puzzle className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">{meta.totalPlugins}</div>
            <div className="text-xs text-muted-foreground font-medium">{t('plugins.statInstalled')}</div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-card border border-border flex items-center gap-3.5 shadow-xs">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">{meta.enabledPlugins}</div>
            <div className="text-xs text-muted-foreground font-medium">{t('plugins.statActive')}</div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-card border border-border flex items-center gap-3.5 shadow-xs">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">{meta.totalHooks}</div>
            <div className="text-xs text-muted-foreground font-medium">{t('plugins.statHooks')}</div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-card border border-border flex items-center gap-3.5 shadow-xs">
          <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
            <Sliders className="w-5 h-5 text-purple-500" />
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">{meta.totalFilters}</div>
            <div className="text-xs text-muted-foreground font-medium">{t('plugins.statFilters')}</div>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveCategory(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                activeCategory === tab.id
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {t(`plugins.categories.${tab.id}`)}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative min-w-[240px]">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={t('plugins.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-background border border-input rounded-lg focus:outline-hidden focus:ring-2 focus:ring-primary text-foreground placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Plugins Grid */}
      {loading ? (
        <div className="p-16 text-center text-muted-foreground flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="text-sm">{t('plugins.loading')}</span>
        </div>
      ) : filteredPlugins.length === 0 ? (
        <div className="p-16 text-center rounded-xl border border-dashed border-border bg-card/50">
          <Puzzle className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-foreground">{t('plugins.noneFound')}</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            {searchQuery
              ? t('plugins.noMatch', { query: searchQuery })
              : t('plugins.noneInCategory')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredPlugins.map((plugin) => (
            <div
              key={plugin.id}
              className={`group relative flex flex-col justify-between rounded-xl bg-card border transition-all duration-200 shadow-xs hover:shadow-md ${
                plugin.enabled
                  ? 'border-border hover:border-primary/40'
                  : 'border-border/60 bg-muted/20 opacity-85'
              }`}
            >
              {/* Card Header */}
              <div className="p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                        plugin.enabled
                          ? 'bg-primary/10 border-primary/20 text-primary'
                          : 'bg-muted border-border text-muted-foreground'
                      }`}
                    >
                      {getCategoryIcon(plugin.category)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-foreground text-base leading-tight">
                          {plugin.name}
                        </h3>
                        <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/50">
                          v{plugin.version}
                        </span>
                        {plugin.source === 'uploaded' && (
                          <span
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-border/60 text-muted-foreground flex items-center gap-1"
                            title={plugin.signature === 'trusted' ? t('plugins.signedTrusted') : t('plugins.notSignedTrusted')}
                          >
                            {plugin.signature === 'trusted'
                              ? <ShieldCheck className="w-3 h-3 text-emerald-500" />
                              : <ShieldAlert className="w-3 h-3 text-amber-500" />}
                            {t('plugins.uploaded')}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>{t('plugins.byAuthor', { author: plugin.author })}</span>
                        <span>•</span>
                        <span className="capitalize">{plugin.category}</span>
                      </div>
                    </div>
                  </div>

                  {/* Toggle Switch */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={plugin.enabled}
                      aria-label={t('plugins.toggleAria', { name: plugin.name })}
                      disabled={
                        togglingId === plugin.id ||
                        plugin.pending === 'install' ||
                        (!!(plugin.incompatible || plugin.loadError) && !plugin.enabled)
                      }
                      title={plugin.pending === 'install' ? t('plugins.restartToLoad') : plugin.loadError ?? plugin.incompatible ?? undefined}
                      onClick={() => handleToggle(plugin)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                        plugin.enabled ? 'bg-emerald-500 dark:bg-emerald-600' : 'bg-zinc-300 dark:bg-zinc-700'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          plugin.enabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {plugin.pending && (
                  <div className="mb-3 flex items-start gap-1.5 rounded-md border border-blue-500/30 bg-blue-500/10 px-2.5 py-2 text-xs text-blue-700 dark:text-blue-400">
                    <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      {plugin.pending === 'install' && t('plugins.pendingInstall')}
                      {plugin.pending === 'update' && t('plugins.pendingUpdate', { version: plugin.pendingVersion ?? '' })}
                      {plugin.pending === 'remove' && t('plugins.pendingRemove')}
                    </span>
                  </div>
                )}

                {plugin.loadError && (
                  <div className="mb-3 flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
                    <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{plugin.loadError} {t('plugins.loadErrorHint')}</span>
                  </div>
                )}

                {plugin.incompatible && (
                  <div className="mb-3 flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-400">
                    <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{plugin.incompatible}. {t('plugins.incompatibleHint')}</span>
                  </div>
                )}

                {/* Description */}
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-4">
                  {plugin.description}
                </p>

                {/* Declared Permission Scopes */}
                <div>
                  <div className="text-[11px] font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                    {t('plugins.permissions')}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {plugin.permissions.map((perm) => (
                      <span
                        key={perm}
                        className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                      >
                        {perm}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Card Footer */}
              <div className="px-5 py-3 border-t border-border/60 bg-muted/10 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      plugin.enabled ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/50'
                    }`}
                  />
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {plugin.enabled ? tc('enabled') : plugin.loadError ? t('plugins.notRunning') : plugin.incompatible ? t('plugins.incompatible') : tc('disabled')}
                    {plugin.nodepress && <span className="ml-1.5 font-mono text-muted-foreground/70">NodePress {plugin.nodepress}</span>}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {plugin.source === 'uploaded' && meta.uploads && meta.uploads.mode !== 'off' && plugin.pending !== 'remove' && (
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                            disabled={plugin.enabled}
                            title={plugin.enabled ? t('plugins.disableBeforeDelete') : undefined}
                          />
                        }
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        {tc('delete')}
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('plugins.deleteTitle', { name: plugin.name })}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t('plugins.deleteDescription')}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
                          <AlertDialogAction variant="destructive" onClick={() => handleDelete(plugin)}>
                            {tc('delete')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs px-2.5"
                    disabled={plugin.pending === 'install'}
                    onClick={() => handleOpenSettings(plugin)}
                  >
                    <Settings2 className="w-3.5 h-3.5 mr-1" />
                    {t('plugins.configure')}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Security Architecture Information Banner */}
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
        <div className="flex items-start gap-3.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground">{t('plugins.howTitle')}</h4>
            <p className="text-xs text-muted-foreground leading-relaxed mt-1">
              {t.rich('plugins.howBody', {
                strong: (chunks) => <strong className="text-foreground">{chunks}</strong>,
              })}
            </p>
          </div>
        </div>
      </div>

      {meta.uploads && (
        <PluginUploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          maxUploadMb={meta.uploads.maxUploadMb}
          onInstalled={fetchPlugins}
        />
      )}

      {/* Slide-out Settings Drawer */}
      <PluginSettingsDrawer
        plugin={selectedPlugin}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSaved={handleSettingsSaved}
      />
    </div>
  );
}
