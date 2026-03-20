'use client';

import { useEffect, useState } from 'react';
import { Layers, FileText, Image, Key } from 'lucide-react';
import api from '../../lib/axios';

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
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
      <p className="text-3xl font-bold text-foreground leading-none">{value}</p>
      <p className="text-xs text-muted-foreground mt-1.5">{sub}</p>
    </div>
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
    <div className="p-6">
      {/* Page title */}
      <h1 className="text-xl font-bold text-foreground mb-6">Dashboard</h1>

      {/* Overview section */}
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Overview</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Content Types" sub="total schemas" value={stats.contentTypes} icon={Layers} />
        <StatCard label="Total Entries"  sub="across all types"  value={stats.entries}      icon={FileText} />
        <StatCard label="Media Files"    sub="uploaded files"    value={stats.media}        icon={Image} />
        <StatCard label="API Keys"       sub="active keys"       value={stats.apiKeys}      icon={Key} />
      </div>
    </div>
  );
}
