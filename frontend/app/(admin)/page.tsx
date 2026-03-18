'use client';

import { useEffect, useState } from 'react';
import { Layers, FileText, Image, Key } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '../../lib/axios';

interface Stats {
  contentTypes: number;
  entries: number;
  media: number;
  apiKeys: number;
}

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
}

function StatCard({ label, value, icon: Icon, iconBg, iconColor }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 flex items-center gap-5">
      <div className={cn('w-12 h-12 rounded-lg flex items-center justify-center shrink-0', iconBg)}>
        <Icon className={cn('h-6 w-6', iconColor)} />
      </div>
      <div>
        <p className="text-sm text-gray-500 font-medium">{label}</p>
        <p className="text-3xl font-bold text-gray-900 leading-tight mt-0.5">{value}</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    contentTypes: 0,
    entries: 0,
    media: 0,
    apiKeys: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [ctRes, entriesRes, mediaRes, keysRes] = await Promise.all([
          api.get('/content-types'),
          api.get('/entries'),
          api.get('/media'),
          api.get('/api-keys'),
        ]);
        setStats({
          contentTypes: Array.isArray(ctRes.data) ? ctRes.data.length : (ctRes.data?.total ?? 0),
          entries:      Array.isArray(entriesRes.data) ? entriesRes.data.length : (entriesRes.data?.total ?? 0),
          media:        Array.isArray(mediaRes.data) ? mediaRes.data.length : (mediaRes.data?.total ?? 0),
          apiKeys:      Array.isArray(keysRes.data) ? keysRes.data.length : (keysRes.data?.total ?? 0),
        });
      } catch (_) {
        // silently ignore — stats default to 0
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  return (
    <div>
      {/* Page title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Overview of your NodePress CMS</p>
      </div>

      {/* Stat cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Content Types"
          value={stats.contentTypes}
          icon={Layers}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
        />
        <StatCard
          label="Total Entries"
          value={stats.entries}
          icon={FileText}
          iconBg="bg-violet-50"
          iconColor="text-violet-600"
        />
        <StatCard
          label="Media Files"
          value={stats.media}
          icon={Image}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
        />
        <StatCard
          label="API Keys"
          value={stats.apiKeys}
          icon={Key}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
        />
      </div>

      {/* Skeleton shimmer while loading */}
      {loading && (
        <div className="mt-4 text-sm text-gray-400 animate-pulse">Fetching stats…</div>
      )}
    </div>
  );
}
