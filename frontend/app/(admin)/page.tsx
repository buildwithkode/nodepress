'use client';

import { useEffect, useState } from 'react';
import { Layers, FileText, Image, Key } from 'lucide-react';
import api from '../../lib/axios';
import { Card, CardContent } from '@/components/ui/card';

interface Stats {
  contentTypes: number;
  entries: number;
  media: number;
  apiKeys: number;
}

function StatCard({
  label,
  sub,
  value,
  icon: Icon,
}: {
  label: string;
  sub: string;
  value: number;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <p className="text-sm text-muted-foreground font-medium">{label}</p>
          <div className="size-9 rounded-md bg-secondary flex items-center justify-center shrink-0">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
        <p className="text-3xl font-bold text-foreground leading-none">{value}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({ contentTypes: 0, entries: 0, media: 0, apiKeys: 0 });

  useEffect(() => {
    Promise.all([
      api.get('/content-types'),
      api.get('/entries'),
      api.get('/media'),
      api.get('/api-keys'),
    ]).then(([ct, en, med, keys]) => {
      setStats({
        contentTypes: Array.isArray(ct.data) ? ct.data.length : (ct.data?.total ?? 0),
        entries:      Array.isArray(en.data) ? en.data.length : (en.data?.total ?? 0),
        media:        Array.isArray(med.data) ? med.data.length : (med.data?.total ?? 0),
        apiKeys:      Array.isArray(keys.data) ? keys.data.length : (keys.data?.total ?? 0),
      });
    }).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      {/* OVERVIEW */}
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">Overview</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-10">
        <StatCard label="Content Types" sub="total schemas"    value={stats.contentTypes} icon={Layers} />
        <StatCard label="Total Entries"  sub="across all types" value={stats.entries}      icon={FileText} />
        <StatCard label="Media Files"    sub="uploaded files"   value={stats.media}        icon={Image} />
        <StatCard label="API Keys"       sub="active keys"      value={stats.apiKeys}      icon={Key} />
      </div>

      {/* CONFIGURATION */}
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">Configuration</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground font-medium">API Endpoint</p>
            <code className="text-xs text-foreground font-mono">GET /api/:type</code>
            <p className="text-xs text-muted-foreground">Public REST API for all content types</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground font-medium">Authentication</p>
            <code className="text-xs text-foreground font-mono">X-API-Key: np_…</code>
            <p className="text-xs text-muted-foreground">Use API keys for external write access</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground font-medium">Media uploads</p>
            <code className="text-xs text-foreground font-mono">POST /api/media</code>
            <p className="text-xs text-muted-foreground">Images, PDFs, videos up to 10MB</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
