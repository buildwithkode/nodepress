'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import { toast } from 'sonner';
import { HardDrive, Loader2, Mail, RefreshCw, Search } from 'lucide-react';
import api from '@/lib/axios';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmailSettingsForm, ServerSettings, StorageSettingsForm } from '@/components/ServerSettingsForms';

/** Settings → Email & storage (admin): SMTP, file storage and the search engine. */
export default function ServerSettingsPage() {
  const t = useTranslations('settings');
  const { user } = useAuth();
  const [settings, setSettings] = useState<ServerSettings | null>(null);
  const [search, setSearch] = useState<{ driver: string; index: string | null } | null>(null);
  const [reindexing, setReindexing] = useState(false);

  const load = useCallback(() => {
    api.get('/server-settings').then((r) => setSettings(r.data)).catch(() => toast.error(t('server.loadFailed')));
    api.get('/search/status').then((r) => setSearch(r.data)).catch(() => setSearch(null));
  }, [t]);
  useEffect(load, [load]);

  const reindex = async () => {
    setReindexing(true);
    try {
      await api.post('/search/reindex');
      toast.success(t('server.search.reindexQueued'));
    } catch {
      toast.error(t('server.saveFailed'));
    } finally {
      setReindexing(false);
    }
  };

  if (!settings) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('server.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('server.subtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Mail className="h-4 w-4" />{t('server.mail.title')}</CardTitle>
          <CardDescription>{t('server.mail.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <EmailSettingsForm settings={settings.mail} onSaved={setSettings} defaultTestTo={user?.email ?? ''} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><HardDrive className="h-4 w-4" />{t('server.storage.title')}</CardTitle>
          <CardDescription>{t('server.storage.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <StorageSettingsForm settings={settings.storage} onSaved={setSettings} />
        </CardContent>
      </Card>

      {search && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Search className="h-4 w-4" />{t('server.search.title')}</CardTitle>
            <CardDescription>
              {search.driver === 'meilisearch'
                ? t('server.search.meilisearch', { index: search.index ?? '' })
                : t.rich('server.search.postgres', { code: (c) => <code className="font-mono text-xs">{c}</code> })}
            </CardDescription>
          </CardHeader>
          {search.driver === 'meilisearch' && (
            <CardContent>
              <Button variant="outline" onClick={reindex} disabled={reindexing}>
                {reindexing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
                {t('server.search.reindex')}
              </Button>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
