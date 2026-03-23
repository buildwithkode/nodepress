'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Layers, FileText, Image, Key, ArrowRight, LayoutGrid, Clock, Globe, Copy, Check } from 'lucide-react';
import api from '../../lib/axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface ContentType { id: number; name: string; schema: any[] }
interface Entry { id: number; slug: string; contentTypeId: number; createdAt: string; contentType?: { name: string } }
interface MediaFile { id: number; filename: string; url: string; mimetype: string; createdAt: string }

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
  const [entries, setEntries] = useState<Entry[]>([]);
  const [media, setMedia] = useState<MediaFile[]>([]);
  const [apiKeyCount, setApiKeyCount] = useState(0);
  const [ctEntryCounts, setCtEntryCounts] = useState<Record<number, number>>({});
  const [selectedCT, setSelectedCT] = useState<ContentType | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  useEffect(() => {
    Promise.allSettled([
      api.get('/content-types'),
      api.get('/entries'),
      api.get('/media'),
      api.get('/api-keys'),
    ]).then(([ct, en, med, keys]) => {
      const cts: ContentType[] = ct.status === 'fulfilled' && Array.isArray(ct.value.data) ? ct.value.data : [];
      const ens: Entry[] = en.status === 'fulfilled' && Array.isArray(en.value.data) ? en.value.data : [];
      const meds: MediaFile[] = med.status === 'fulfilled' && Array.isArray(med.value.data) ? med.value.data : [];

      setContentTypes(cts);
      if (cts.length > 0) setSelectedCT(cts[0]);
      setEntries(ens);
      setMedia(meds);
      setApiKeyCount(keys.status === 'fulfilled' && Array.isArray(keys.value.data) ? keys.value.data.length : 0);

      // Count entries per content type
      const counts: Record<number, number> = {};
      ens.forEach((e) => { counts[e.contentTypeId] = (counts[e.contentTypeId] ?? 0) + 1; });
      setCtEntryCounts(counts);
    }).finally(() => setLoading(false));
  }, []);

  const recentEntries = [...entries]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);

  const recentMedia = [...media]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);

  const ctById = Object.fromEntries(contentTypes.map((ct) => [ct.id, ct]));

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="space-y-8">

      {/* Stat cards */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">Overview</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="Content Types" sub="total schemas"     value={contentTypes.length} icon={Layers}   loading={loading} href="/content-types" />
          <StatCard label="Total Entries" sub="across all types"  value={entries.length}      icon={FileText} loading={loading} href="/entries" />
          <StatCard label="Media Files"   sub="uploaded files"    value={media.length}        icon={Image}    loading={loading} href="/media" />
          <StatCard label="API Keys"      sub="active keys"       value={apiKeyCount}         icon={Key}      loading={loading} href="/api-keys" />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Content Types breakdown */}
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
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
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
                      <span className="text-sm font-medium">{ct.name}</span>
                      <span className="text-xs text-muted-foreground">{ct.schema.length} field{ct.schema.length !== 1 ? 's' : ''}</span>
                    </div>
                    <Badge variant="secondary">{ctEntryCounts[ct.id] ?? 0} entries</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Entries */}
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
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : recentEntries.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No entries yet.{' '}
                <button className="text-primary underline underline-offset-2" onClick={() => router.push('/entries/new')}>Create one</button>
              </div>
            ) : (
              <div className="space-y-1">
                {recentEntries.map((entry) => {
                  const ct = ctById[entry.contentTypeId];
                  return (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between px-3 py-2.5 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => router.push(`/entries/${entry.id}/edit`)}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="size-2 rounded-full bg-blue-400/70" />
                        <span className="text-sm font-medium font-mono">{entry.slug}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {ct && <Badge variant="outline" className="text-xs">{ct.name}</Badge>}
                        <span className="text-xs text-muted-foreground">
                          {new Date(entry.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* API Endpoints */}
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
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
              </div>
            ) : contentTypes.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No content types yet.{' '}
                <button className="text-primary underline underline-offset-2" onClick={() => router.push('/content-types/new')}>Create one</button>
              </div>
            ) : (
              <>
                {/* Content type tabs */}
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
                      {ct.name}
                    </button>
                  ))}
                </div>

                {/* Endpoint rows */}
                {selectedCT && (
                  <div className="rounded-lg border border-border overflow-hidden">
                    {[
                      { method: 'GET',    path: `/api/${selectedCT.name}`,          desc: `List all ${selectedCT.name} entries`, auth: false },
                      { method: 'GET',    path: `/api/${selectedCT.name}/{slug}`,   desc: 'Get single entry by slug',            auth: false },
                      { method: 'POST',   path: `/api/${selectedCT.name}`,          desc: 'Create a new entry',                  auth: true  },
                      { method: 'PUT',    path: `/api/${selectedCT.name}/{slug}`,   desc: 'Update an entry',                     auth: true  },
                      { method: 'DELETE', path: `/api/${selectedCT.name}/{slug}`,   desc: 'Delete an entry',                     auth: true  },
                    ].map(({ method, path, desc, auth }) => {
                      const fullUrl = `${origin}${path}`;
                      const copied = copiedUrl === fullUrl;
                      const methodColors: Record<string, string> = {
                        GET: 'text-emerald-400', POST: 'text-blue-400',
                        PUT: 'text-amber-400', DELETE: 'text-red-400',
                      };
                      return (
                        <div key={method + path} className="flex items-center gap-3 px-3 py-2.5 border-b border-border last:border-0 hover:bg-muted/30 transition-colors group">
                          <span className={`text-xs font-bold font-mono w-14 shrink-0 ${methodColors[method]}`}>{method}</span>
                          <code className="text-xs font-mono text-foreground flex-1 truncate">{path}</code>
                          {auth && <span className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5 shrink-0">Auth</span>}
                          <button
                            onClick={() => copyUrl(fullUrl)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted shrink-0"
                            title="Copy URL"
                          >
                            {copied
                              ? <Check className="h-3.5 w-3.5 text-green-400" />
                              : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
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

      {/* Recent Media */}
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
