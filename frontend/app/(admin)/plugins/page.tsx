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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PluginSettingsDrawer, PluginItem } from '@/components/PluginSettingsDrawer';
import api from '@/lib/axios';
import { usePlugins } from '@/context/PluginContext';

const CATEGORY_TABS = [
  { id: 'all', label: 'All Plugins' },
  { id: 'content', label: 'Content' },
  { id: 'seo', label: 'SEO' },
  { id: 'utilities', label: 'Utilities' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'security', label: 'Security' },
];

export default function PluginsPage() {
  const { refreshPlugins } = usePlugins();
  const [plugins, setPlugins] = useState<PluginItem[]>([]);
  const [meta, setMeta] = useState<{
    totalPlugins: number;
    enabledPlugins: number;
    totalHooks: number;
    totalFilters: number;
    activeEvents: string[];
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
    } catch (err) {
      console.error(`Failed to toggle plugin "${plugin.id}":`, err);
      // Revert optimistic update
      setPlugins((prev) =>
        prev.map((p) => (p.id === plugin.id ? { ...p, enabled: plugin.enabled } : p)),
      );
    } finally {
      setTogglingId(null);
    }
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
              Plugin Architecture & Extensions
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Manage, configure, and monitor live extensions, sandboxed lifecycle hooks, and data pipeline filters.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchPlugins} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Metric Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-card border border-border flex items-center gap-3.5 shadow-xs">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Puzzle className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">{meta.totalPlugins}</div>
            <div className="text-xs text-muted-foreground font-medium">Installed Plugins</div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-card border border-border flex items-center gap-3.5 shadow-xs">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">{meta.enabledPlugins}</div>
            <div className="text-xs text-muted-foreground font-medium">Active & Running</div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-card border border-border flex items-center gap-3.5 shadow-xs">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">{meta.totalHooks}</div>
            <div className="text-xs text-muted-foreground font-medium">Lifecycle Action Hooks</div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-card border border-border flex items-center gap-3.5 shadow-xs">
          <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
            <Sliders className="w-5 h-5 text-purple-500" />
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">{meta.totalFilters}</div>
            <div className="text-xs text-muted-foreground font-medium">Data Pipeline Filters</div>
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
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative min-w-[240px]">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search extensions..."
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
          <span className="text-sm">Loading installed extensions...</span>
        </div>
      ) : filteredPlugins.length === 0 ? (
        <div className="p-16 text-center rounded-xl border border-dashed border-border bg-card/50">
          <Puzzle className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-foreground">No plugins found</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            {searchQuery
              ? `No installed plugins matched "${searchQuery}".`
              : 'No plugins registered in this category.'}
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
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>by {plugin.author}</span>
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
                      aria-label={`Toggle ${plugin.name}`}
                      disabled={togglingId === plugin.id}
                      onClick={() => handleToggle(plugin)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
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

                {/* Description */}
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-4">
                  {plugin.description}
                </p>

                {/* Declared Permission Scopes */}
                <div>
                  <div className="text-[11px] font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                    Permissions:
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
                    {plugin.enabled ? 'Active & Intercepting' : 'Disabled in Memory'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs px-2.5"
                    onClick={() => handleOpenSettings(plugin)}
                  >
                    <Settings2 className="w-3.5 h-3.5 mr-1" />
                    Configure
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
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              Enterprise Defense-in-Depth Security Model
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                100% Crash Isolated
              </span>
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed mt-1">
              Unlike legacy CMS architectures, NodePress executes all plugins inside sandboxed boundaries with{' '}
              <strong className="text-foreground">Layer 1 Capability Permissions</strong>,{' '}
              <strong className="text-foreground">Layer 2 Crash Isolation</strong> (plugin bugs never crash the core CMS), and{' '}
              <strong className="text-foreground">Layer 4 Hard 5-Second Timeouts</strong>. Toggle plugins on or off with 0ms downtime without needing server restarts.
            </p>
          </div>
        </div>
      </div>

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
