'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Layers, FileText, Image, Key, ArrowRight, LayoutGrid,
  Clock, Globe, Copy, Check, ClipboardList, Inbox, ToggleRight, ToggleLeft,
} from 'lucide-react';
import api from '../../lib/axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface ContentType { id: number; name: string; schema: any[] }
interface Entry       { id: number; slug: string; contentTypeId: number; createdAt: string }
interface MediaFile   { id: number; filename: string; url: string; mimetype: string; createdAt: string }
interface FormRow     { id: number; name: string; slug: string; isActive: boolean; fields: any[]; _count: { submissions: number } }
interface RecentSub   { id: number; createdAt: string; data: Record<string, unknown>; form: { id: number; name: string; slug: string } }

function StatCard({ label, sub, value, icon: Icon, loading, href }: {
  label: string; sub: string; value: number; icon: React.ElementType; loading: boolean; href: string;
}) {
  const router = useRouter();
  return (
    <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => router.push(href)}>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <p className="text-sm text-muted-foreground font-medium">{label}</p>
          <div className="size-9 rounded-md bg-secondary flex items-center justify-center shrink-0">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
        {loading
          ? <Skeleton className="h-8 w-16" />
          : <p className="text-3xl font-bold text-foreground leading-none">{value}</p>}
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [entries,      setEntries]      = useState<Entry[]>([]);
  const [media,        setMedia]        = useState<MediaFile[]>([]);
  const [apiKeyCount,  setApiKeyCount]  = useState(0);
  const [forms,        setForms]        = useState<FormRow[]>([]);
  const [recentSubs,   setRecentSubs]   = useState<RecentSub[]>([]);
  const [ctEntryCounts, setCtEntryCounts] = useState<Record<number, number>>({});
  const [selectedCT,  setSelectedCT]   = useState<ContentType | null>(null);
  const [copiedUrl,   setCopiedUrl]    = useState<string | null>(null);

  useEffect(() => {
    Promise.allSettled([
      api.get('/content-types'),
      api.get('/entries'),
      api.get('/media'),
      api.get('/api-keys'),
      api.get('/forms'),
      api.get('/forms/submissions/recent'),
    ]).then(([ct, en, med, keys, frms, subs]) => {
      const cts:  ContentType[] = ct.status   === 'fulfilled' && Array.isArray(ct.value.data)   ? ct.value.data   : [];
      const ens:  Entry[]       = en.status   === 'fulfilled' && Array.isArray(en.value.data)   ? en.value.data   : [];
      const meds: MediaFile[]   = med.status  === 'fulfilled' && Array.isArray(med.value.data)  ? med.value.data  : [];
      const fms:  FormRow[]     = frms.status === 'fulfilled' && Array.isArray(frms.value.data) ? frms.value.data : [];
      const rss:  RecentSub[]   = subs.status === 'fulfilled' && Array.isArray(subs.value.data) ? subs.value.data : [];

      setContentTypes(cts);
      if (cts.length > 0) setSelectedCT(cts[0]);
      setEntries(ens);
      setMedia(meds);
      setApiKeyCount(keys.status === 'fulfilled' && Array.isArray(keys.value.data) ? keys.value.data.length : 0);
      setForms(fms);
      setRecentSubs(rss);

      const counts: Record<number, number> = {};
      ens.forEach((e) => { counts[e.contentTypeId] = (counts[e.contentTypeId] ?? 0) + 1; });
      setCtEntryCounts(counts);
    }).finally(() => setLoading(false));
  }, []);

  const recentMedia = [...media]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);

  const totalSubmissions = forms.reduce((sum, f) => sum + f._count.submissions, 0);
  const activeForms      = forms.filter((f) => f.isActive).length;

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  // first field value of a submission (preview)
  const subPreview = (data: Record<string, unknown>) => {
    const first = Object.values(data)[0];
    if (first === null || first === undefined) return '—';
    const str = String(first);
    return str.length > 40 ? str.slice(0, 40) + '…' : str;
  };

  return (
    <div className="space-y-8">

      {/* ── Stat cards (6) ── */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">Overview</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <StatCard label="Content Types"    sub="total schemas"      value={contentTypes.length} icon={Layers}        loading={loading} href="/content-types" />
          <StatCard label="Total Entries"    sub="across all types"   value={entries.length}      icon={FileText}      loading={loading} href="/entries" />
          <StatCard label="Media Files"      sub="uploaded files"     value={media.length}        icon={Image}         loading={loading} href="/media" />
          <StatCard label="API Keys"         sub="active keys"        value={apiKeyCount}         icon={Key}           loading={loading} href="/api-keys" />
          <StatCard label="Forms"            sub="active forms"       value={activeForms}         icon={ClipboardList} loading={loading} href="/forms" />
          <StatCard label="Submissions"      sub="total responses"    value={totalSubmissions}    icon={Inbox}         loading={loading} href="/forms" />
        </div>
      </div>

      {/* ── Content Types + Recent Entries ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <LayoutGrid className="h-4 w-4 text-muted-foreground" /> Content Types
            </CardTitle>
            <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => router.push('/content-types')}>
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : contentTypes.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No content types yet.{' '}
                <button className="text-primary underline underline-offset-2" onClick={() => router.push('/content-types/new')}>Create one</button>
              </div>
            ) : (
              <div className="space-y-1">
                {contentTypes.map((ct) => (
                  <div
                    key={ct.id}
                    className="flex items-center justify-between px-3 py-2.5 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => router.push(`/entries?ct=${ct.name}`)}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="size-2 rounded-full bg-primary/60" />
                      <span className="text-sm font-medium">{ct.name.replace(/_/g, ' ')}</span>
                      <span className="text-xs text-muted-foreground">{ct.schema.length} field{ct.schema.length !== 1 ? 's' : ''}</span>
                    </div>
                    <Badge variant="secondary">{ctEntryCounts[ct.id] ?? 0} entries</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" /> Recent Entries
            </CardTitle>
            <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => router.push('/entries')}>
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : entries.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No entries yet.{' '}
                <button className="text-primary underline underline-offset-2" onClick={() => router.push('/entries/new')}>Create one</button>
              </div>
            ) : (
              <div className="space-y-1">
                {[...entries]
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .slice(0, 6)
                  .map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between px-3 py-2.5 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => router.push(`/entries/${entry.id}/edit`)}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="size-2 rounded-full bg-blue-400/70" />
                        <span className="text-sm font-medium font-mono">{entry.slug}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Forms + Recent Submissions ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Forms breakdown */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-muted-foreground" /> Forms
            </CardTitle>
            <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => router.push('/forms')}>
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : forms.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No forms yet.{' '}
                <button className="text-primary underline underline-offset-2" onClick={() => router.push('/forms/new')}>Create one</button>
              </div>
            ) : (
              <div className="space-y-1">
                {forms.map((form) => (
                  <div
                    key={form.id}
                    className="flex items-center justify-between px-3 py-2.5 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => router.push(`/forms/${form.id}/submissions`)}
                  >
                    <div className="flex items-center gap-2.5">
                      {form.isActive
                        ? <ToggleRight className="h-4 w-4 text-emerald-400 shrink-0" />
                        : <ToggleLeft  className="h-4 w-4 text-muted-foreground/40 shrink-0" />}
                      <span className="text-sm font-medium">{form.name}</span>
                      <span className="text-xs text-muted-foreground">{form.fields.length} field{form.fields.length !== 1 ? 's' : ''}</span>
                    </div>
                    <Badge variant="secondary">{form._count.submissions} {form._count.submissions === 1 ? 'submission' : 'submissions'}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Submissions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Inbox className="h-4 w-4 text-muted-foreground" /> Recent Submissions
            </CardTitle>
            <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => router.push('/forms')}>
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : recentSubs.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No submissions yet. Share a form to start collecting responses.
              </div>
            ) : (
              <div className="space-y-1">
                {recentSubs.map((sub) => (
                  <div
                    key={sub.id}
                    className="flex items-center justify-between px-3 py-2.5 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => router.push(`/forms/${sub.form.id}/submissions`)}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="size-2 rounded-full bg-violet-400/70 shrink-0" />
                      <span className="text-sm font-medium truncate">{subPreview(sub.data)}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <Badge variant="outline" className="text-xs">{sub.form.name}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(sub.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── API Endpoints ── */}
      {(loading || contentTypes.length > 0) && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" /> API Endpoints
            </CardTitle>
            <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => router.push('/docs')}>
              Full docs <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
            ) : contentTypes.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No content types yet.{' '}
                <button className="text-primary underline underline-offset-2" onClick={() => router.push('/content-types/new')}>Create one</button>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {contentTypes.map((ct) => (
                    <button
                      key={ct.id}
                      onClick={() => setSelectedCT(ct)}
                      className={`px-3 py-1 rounded-md text-xs font-medium border transition-colors ${
                        selectedCT?.id === ct.id
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {ct.name.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
                {selectedCT && (
                  <div className="rounded-lg border border-border overflow-hidden">
                    {[
                      { method: 'GET',    path: `/api/${selectedCT.name.replace(/_/g, '-')}`,        auth: false },
                      { method: 'GET',    path: `/api/${selectedCT.name.replace(/_/g, '-')}/{slug}`, auth: false },
                      { method: 'POST',   path: `/api/${selectedCT.name.replace(/_/g, '-')}`,        auth: true  },
                      { method: 'PUT',    path: `/api/${selectedCT.name.replace(/_/g, '-')}/{slug}`, auth: true  },
                      { method: 'DELETE', path: `/api/${selectedCT.name.replace(/_/g, '-')}/{slug}`, auth: true  },
                    ].map(({ method, path, auth }) => {
                      const fullUrl = `${origin}${path}`;
                      const copied  = copiedUrl === fullUrl;
                      const colors: Record<string, string> = {
                        GET: 'text-emerald-400', POST: 'text-blue-400',
                        PUT: 'text-amber-400',   DELETE: 'text-red-400',
                      };
                      return (
                        <div key={method + path} className="flex items-center gap-3 px-3 py-2.5 border-b border-border last:border-0 hover:bg-muted/30 transition-colors group">
                          <span className={`text-xs font-bold font-mono w-14 shrink-0 ${colors[method]}`}>{method}</span>
                          <code className="text-xs font-mono text-foreground flex-1 truncate">{path}</code>
                          {auth && <span className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5 shrink-0">Auth</span>}
                          <button
                            onClick={() => copyUrl(fullUrl)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted shrink-0"
                            title="Copy URL"
                          >
                            {copied
                              ? <Check className="h-3.5 w-3.5 text-green-400" />
                              : <Copy  className="h-3.5 w-3.5 text-muted-foreground" />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Recent Media ── */}
      {(loading || recentMedia.length > 0) && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Image className="h-4 w-4 text-muted-foreground" /> Recent Media
            </CardTitle>
            <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => router.push('/media')}>
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-md" />)}
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {recentMedia.map((file) => (
                  <div
                    key={file.id}
                    className="aspect-square rounded-md overflow-hidden border bg-muted cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => router.push('/media')}
                    title={file.filename}
                  >
                    {file.mimetype?.startsWith('image/') ? (
                      <img src={file.url} alt={file.filename} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground font-mono px-1 text-center">
                        {file.filename.split('.').pop()?.toUpperCase()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
