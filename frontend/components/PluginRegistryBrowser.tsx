'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowUpCircle, CheckCircle2, Download, ExternalLink, GitBranch, Loader2, Package, RefreshCw, Search, Store, XCircle,
} from 'lucide-react';
import { useLocale, useTranslations } from 'use-intl';
import { Button, buttonVariants } from '@/components/ui/button';
import api from '@/lib/axios';

/** One plugin from GET /api/plugins/registry. */
export interface RegistryPluginItem {
  id: string;
  name: string;
  description: string;
  author?: string;
  homepage?: string;
  repository?: string;
  license?: string;
  nodepress: string;
  latest?: { version: string; downloadUrl?: string; sha256?: string; signedBy?: string };
  tags: string[];
  pricing: 'free' | 'paid';
  bundled?: boolean;
  installed: boolean;
  installedVersion: string | null;
  updateAvailable: boolean;
  compatible: boolean;
  incompatible: string | null;
  installable: boolean;
}

interface RegistryResponse {
  enabled: boolean;
  url: string | null;
  fetchedAt: string | null;
  stale: boolean;
  error: string | null;
  skipped: number;
  plugins: RegistryPluginItem[];
}

const badge = 'text-[10px] font-medium px-1.5 py-0.5 rounded border flex items-center gap-1';

/** Plugins → Browse: the plugin directory (PLUGIN_REGISTRY_URL), searchable, with install buttons. */
export function PluginRegistryBrowser({
  onInstall,
  reloadKey,
}: {
  onInstall: (plugin: RegistryPluginItem) => void;
  /** Change it to reload the listing (after an install). */
  reloadKey: number;
}) {
  const t = useTranslations('developer');
  const locale = useLocale();
  const [data, setData] = useState<RegistryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const load = async (refresh = false) => {
    setLoading(true);
    try {
      const res = await api.get(`/plugins/registry${refresh ? '?refresh=true' : ''}`);
      setData(res.data);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setData({ enabled: true, url: null, fetchedAt: null, stale: false, error: msg || t('registry.loadFailed'), skipped: 0, plugins: [] });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [reloadKey]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!data) return [];
    if (!q) return data.plugins;
    return data.plugins.filter((p) =>
      [p.id, p.name, p.description, p.author ?? '', ...p.tags].some((s) => s.toLowerCase().includes(q)));
  }, [data, query]);

  if (data && !data.enabled) {
    return (
      <div className="p-12 text-center rounded-xl border border-dashed border-border bg-card/50">
        <Store className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
        <h3 className="text-base font-semibold text-foreground">{t('registry.disabledTitle')}</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
          {t.rich('registry.disabledBody', { env: 'PLUGIN_REGISTRY_URL', mono: (chunks) => <span className="font-mono">{chunks}</span> })}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative min-w-[240px] sm:w-80">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={t('registry.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-background border border-input rounded-lg focus:outline-hidden focus:ring-2 focus:ring-primary text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          {data?.fetchedAt && <span>{t('registry.updatedAt', { date: new Date(data.fetchedAt).toLocaleString(locale) })}</span>}
          <Button variant="outline" size="sm" onClick={() => load(true)} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            {t('registry.refresh')}
          </Button>
        </div>
      </div>

      {data?.error && (
        <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${data.stale
          ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
          : 'border-destructive/30 bg-destructive/10 text-destructive'}`}>
          {data.stale ? <AlertTriangle className="w-4 h-4 shrink-0 mt-px" /> : <XCircle className="w-4 h-4 shrink-0 mt-px" />}
          <span>{data.stale ? t('registry.staleNotice') : t('registry.unavailable')} <span className="opacity-80">{data.error}</span></span>
        </div>
      )}

      {loading && !data ? (
        <div className="p-16 text-center text-muted-foreground flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="text-sm">{t('registry.loading')}</span>
        </div>
      ) : filtered.length === 0 ? (
        data?.error && !data.stale ? null : (
          <div className="p-12 text-center rounded-xl border border-dashed border-border bg-card/50">
            <Package className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-xs text-muted-foreground">
              {query ? t('registry.noMatch', { query }) : t('registry.empty')}
            </p>
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filtered.map((p) => (
            <div key={p.id} className="flex flex-col justify-between rounded-xl bg-card border border-border shadow-xs">
              <div className="p-5">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h3 className="font-semibold text-foreground text-base leading-tight">{p.name}</h3>
                  {p.latest && (
                    <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/50">v{p.latest.version}</span>
                  )}
                  <span className={`${badge} ${p.pricing === 'paid' ? 'border-purple-500/30 text-purple-600 dark:text-purple-400' : 'border-border/60 text-muted-foreground'}`}>
                    {p.pricing === 'paid' ? t('registry.paid') : t('registry.free')}
                  </span>
                  {p.bundled && <span className={`${badge} border-border/60 text-muted-foreground`}>{t('registry.bundled')}</span>}
                  {p.installed && (
                    <span className={`${badge} border-emerald-500/30 text-emerald-600 dark:text-emerald-400`}>
                      <CheckCircle2 className="w-3 h-3" />
                      {p.installedVersion ? t('registry.installedVersion', { version: p.installedVersion }) : t('registry.installed')}
                    </span>
                  )}
                  {p.updateAvailable && (
                    <span className={`${badge} border-blue-500/30 text-blue-600 dark:text-blue-400`}>
                      <ArrowUpCircle className="w-3 h-3" />{t('registry.updateAvailable')}
                    </span>
                  )}
                  <span
                    className={`${badge} ${p.compatible ? 'border-emerald-500/20 text-muted-foreground' : 'border-amber-500/30 text-amber-700 dark:text-amber-400'}`}
                    title={p.incompatible ?? undefined}
                  >
                    {p.compatible ? t('registry.compatible') : t('registry.incompatible')}
                    <span className="font-mono opacity-70">{p.nodepress}</span>
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mb-3">
                  {p.author && t('registry.byAuthor', { author: p.author })}
                  {p.license && <span className="ml-1.5">· {p.license}</span>}
                </div>
                {p.incompatible && (
                  <div className="mb-3 flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-400">
                    <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /><span>{p.incompatible}</span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground leading-relaxed">{p.description}</p>
                {p.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {p.tags.map((tag) => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="px-5 py-3 border-t border-border/60 bg-muted/10 flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 text-[11px]">
                  {p.homepage && (
                    <a href={p.homepage} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
                      <ExternalLink className="w-3 h-3" />{t('registry.homepage')}
                    </a>
                  )}
                  {p.repository && (
                    <a href={p.repository} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
                      <GitBranch className="w-3 h-3" />{t('registry.source')}
                    </a>
                  )}
                </div>
                {p.installable ? (
                  <Button size="sm" className="h-7 text-xs px-2.5" onClick={() => onInstall(p)}>
                    <Download className="w-3.5 h-3.5 mr-1" />
                    {p.updateAvailable ? t('registry.update') : t('registry.install')}
                  </Button>
                ) : p.bundled ? (
                  <span className="text-[11px] text-muted-foreground">{t('registry.bundledHint')}</span>
                ) : !p.latest?.downloadUrl && p.homepage ? (
                  <a href={p.homepage} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'outline', size: 'sm', className: 'h-7 text-xs px-2.5' })}>
                    <ExternalLink className="w-3.5 h-3.5 mr-1" />
                    {p.pricing === 'paid' ? t('registry.getIt') : t('registry.learnMore')}
                  </a>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
