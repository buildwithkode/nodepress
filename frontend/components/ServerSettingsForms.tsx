'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import { toast } from 'sonner';
import { CheckCircle2, HardDrive, Loader2, Lock, RotateCcw, Send } from 'lucide-react';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

/** GET /api/server-settings */
export interface ServerSettings {
  mail: {
    source: 'env' | 'database' | null;
    enabled: boolean;
    host: string | null;
    port: number;
    secure: boolean;
    user: string | null;
    from: string | null;
    hasPassword: boolean;
  };
  storage: {
    source: 'env' | 'database' | null;
    driver: 'local' | 's3';
    bucket: string | null;
    region: string | null;
    endpoint: string | null;
    publicUrl: string | null;
    accessKey: string | null;
    hasSecret: boolean;
    active: 'local' | 's3' | null;
    restartRequired: boolean;
    production?: boolean;
  };
}

const errorText = (err: any, fallback: string) => {
  const m = err?.response?.data?.message;
  return Array.isArray(m) ? m.join(', ') : m || fallback;
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function EnvNotice({ what }: { what: string }) {
  const t = useTranslations('settings');
  return (
    <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <Lock className="h-3.5 w-3.5 mt-px shrink-0" />
      {t.rich('server.envNotice', { what, code: (c) => <code className="font-mono">{c}</code> })}
    </p>
  );
}

// ── Email ──────────────────────────────────────────────────────────────────

export function EmailSettingsForm({
  settings,
  onSaved,
  defaultTestTo = '',
  compact = false,
}: {
  settings: ServerSettings['mail'];
  onSaved: (next: ServerSettings) => void;
  defaultTestTo?: string;
  /** Setup wizard: email is being turned on, so no on/off switch. */
  compact?: boolean;
}) {
  const t = useTranslations('settings');
  const readOnly = settings.source === 'env';
  const [enabled, setEnabled] = useState(compact || settings.enabled);
  const [host, setHost] = useState(settings.host ?? '');
  const [port, setPort] = useState(String(settings.port || 587));
  const [security, setSecurity] = useState(settings.secure ? 'ssl' : 'starttls');
  const [user, setUser] = useState(settings.user ?? '');
  const [pass, setPass] = useState('');
  const [from, setFrom] = useState(settings.from ?? '');
  const [testTo, setTestTo] = useState(defaultTestTo);
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);

  const body = () => ({
    enabled,
    host: host.trim(),
    port: Number(port) || 587,
    secure: security === 'ssl',
    user: user.trim() || undefined,
    pass: pass || undefined,
    from: from.trim() || undefined,
  });

  const save = async () => {
    setBusy('save');
    try {
      const res = await api.put('/server-settings/mail', body());
      toast.success(enabled ? t('server.mail.saved') : t('server.mail.turnedOff'));
      setPass('');
      onSaved(res.data);
    } catch (err) {
      toast.error(errorText(err, t('server.saveFailed')));
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy('test');
    try {
      await api.post('/server-settings/mail/test', readOnly ? { to: testTo } : { ...body(), to: testTo });
      toast.success(t('server.mail.testSent', { to: testTo }));
    } catch (err) {
      toast.error(errorText(err, t('server.mail.testFailed')));
    } finally {
      setBusy(null);
    }
  };

  const items = { starttls: t('server.mail.starttls'), ssl: t('server.mail.ssl') };

  return (
    <div className="space-y-4">
      {readOnly && <EnvNotice what="SMTP_*" />}
      {!compact && !readOnly && (
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={enabled} onCheckedChange={setEnabled} />
          {t('server.mail.enabled')}
        </label>
      )}
      {enabled && (
        <fieldset disabled={readOnly} className="grid gap-3 sm:grid-cols-2">
          <Field label={t('server.mail.host')}>
            <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.example.com" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('server.mail.port')}>
              <Input value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />
            </Field>
            <Field label={t('server.mail.security')}>
              <Select
                value={security}
                items={items}
                onValueChange={(v) => {
                  setSecurity(v ?? 'starttls');
                  setPort(v === 'ssl' ? '465' : '587');
                }}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="starttls">{items.starttls}</SelectItem>
                  <SelectItem value="ssl">{items.ssl}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label={t('server.mail.user')}>
            <Input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="off" />
          </Field>
          <Field label={t('server.mail.password')} hint={settings.hasPassword ? t('server.keepSecret') : undefined}>
            <Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" placeholder={settings.hasPassword ? '••••••••' : ''} />
          </Field>
          <div className="sm:col-span-2">
            <Field label={t('server.mail.from')} hint={t('server.mail.fromHint')}>
              <Input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Acme <noreply@acme.com>" />
            </Field>
          </div>
        </fieldset>
      )}
      <div className="flex flex-wrap items-end gap-2">
        {enabled && (
          <>
            <Field label={t('server.mail.testTo')}>
              <Input className="w-56" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" />
            </Field>
            <Button type="button" variant="outline" onClick={test} disabled={!!busy || !testTo || (!readOnly && !host.trim())}>
              {busy === 'test' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
              {t('server.mail.sendTest')}
            </Button>
          </>
        )}
        {!readOnly && (
          <Button type="button" onClick={save} disabled={!!busy || (enabled && !host.trim())} className="ml-auto">
            {busy === 'save' && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {t('server.save')}
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Storage ────────────────────────────────────────────────────────────────

const PROVIDERS = {
  aws: { endpoint: '', region: 'us-east-1' },
  r2: { endpoint: 'https://<account-id>.r2.cloudflarestorage.com', region: 'auto' },
  spaces: { endpoint: 'https://<region>.digitaloceanspaces.com', region: 'nyc3' },
  other: { endpoint: 'https://minio.example.com', region: 'us-east-1' },
} as const;
type Provider = keyof typeof PROVIDERS;

export function StorageSettingsForm({
  settings,
  onSaved,
  showRestart = true,
}: {
  settings: ServerSettings['storage'];
  onSaved: (next: ServerSettings) => void;
  showRestart?: boolean;
}) {
  const t = useTranslations('settings');
  const readOnly = settings.source === 'env';
  const [driver, setDriver] = useState<'local' | 's3'>(settings.driver);
  const [provider, setProvider] = useState<Provider>(
    settings.endpoint?.includes('r2.cloudflarestorage') ? 'r2'
      : settings.endpoint?.includes('digitaloceanspaces') ? 'spaces'
        : settings.endpoint ? 'other' : 'aws',
  );
  const [bucket, setBucket] = useState(settings.bucket ?? '');
  const [region, setRegion] = useState(settings.region ?? '');
  const [endpoint, setEndpoint] = useState(settings.endpoint ?? '');
  const [accessKey, setAccessKey] = useState(settings.accessKey ?? '');
  const [secretKey, setSecretKey] = useState('');
  const [publicUrl, setPublicUrl] = useState(settings.publicUrl ?? '');
  const [busy, setBusy] = useState<'save' | 'test' | 'restart' | null>(null);
  const [tested, setTested] = useState(false);

  useEffect(() => setTested(false), [driver, bucket, region, endpoint, accessKey, secretKey]);

  const body = () => ({
    driver,
    ...(driver === 's3'
      ? {
          bucket: bucket.trim(),
          region: region.trim() || undefined,
          endpoint: endpoint.trim() || undefined,
          accessKey: accessKey.trim(),
          secretKey: secretKey || undefined,
          publicUrl: publicUrl.trim() || undefined,
        }
      : {}),
  });

  const run = async (kind: 'save' | 'test') => {
    setBusy(kind);
    try {
      if (kind === 'test') {
        await api.post('/server-settings/storage/test', body());
        setTested(true);
        toast.success(t('server.storage.testOk'));
      } else {
        const res = await api.put('/server-settings/storage', body());
        toast.success(t('server.storage.saved'));
        setSecretKey('');
        onSaved(res.data);
      }
    } catch (err) {
      toast.error(errorText(err, kind === 'test' ? t('server.storage.testFailed') : t('server.saveFailed')));
    } finally {
      setBusy(null);
    }
  };

  const restart = async () => {
    setBusy('restart');
    try {
      await api.post('/plugins/restart');
      toast.success(t('server.storage.restarting'));
    } catch (err) {
      toast.error(errorText(err, t('server.saveFailed')));
    } finally {
      setBusy(null);
    }
  };

  const driverItems = { local: t('server.storage.local'), s3: t('server.storage.s3') };
  const providerItems: Record<Provider, string> = {
    aws: 'Amazon S3', r2: 'Cloudflare R2', spaces: 'DigitalOcean Spaces', other: t('server.storage.otherProvider'),
  };
  const canSave = driver === 'local' || (bucket.trim() && accessKey.trim() && (secretKey || settings.hasSecret));

  return (
    <div className="space-y-4">
      {readOnly && <EnvNotice what="STORAGE_*" />}
      <fieldset disabled={readOnly} className="space-y-3">
        <Field label={t('server.storage.where')}>
          <Select value={driver} items={driverItems} onValueChange={(v) => setDriver((v as 'local' | 's3') ?? 'local')}>
            <SelectTrigger className="w-full sm:w-72"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="local">{driverItems.local}</SelectItem>
              <SelectItem value="s3">{driverItems.s3}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {driver === 'local' && (
          <p className={cn('text-xs', settings.production ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
            {settings.production ? t('server.storage.localProductionWarning') : t('server.storage.localHint')}
          </p>
        )}
        {driver === 's3' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('server.storage.provider')}>
              <Select
                value={provider}
                items={providerItems}
                onValueChange={(v) => {
                  const p = (v as Provider) ?? 'aws';
                  setProvider(p);
                  setRegion(PROVIDERS[p].region);
                  if (!endpoint || Object.values(PROVIDERS).some((x) => x.endpoint === endpoint)) setEndpoint(PROVIDERS[p].endpoint);
                }}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(providerItems) as Provider[]).map((p) => (
                    <SelectItem key={p} value={p}>{providerItems[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t('server.storage.bucket')}>
              <Input value={bucket} onChange={(e) => setBucket(e.target.value)} placeholder="my-site-media" />
            </Field>
            {provider !== 'aws' && (
              <Field label={t('server.storage.endpoint')}>
                <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder={PROVIDERS[provider].endpoint} />
              </Field>
            )}
            <Field label={t('server.storage.region')}>
              <Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder={PROVIDERS[provider].region} />
            </Field>
            <Field label={t('server.storage.accessKey')}>
              <Input value={accessKey} onChange={(e) => setAccessKey(e.target.value)} autoComplete="off" />
            </Field>
            <Field label={t('server.storage.secretKey')} hint={settings.hasSecret ? t('server.keepSecret') : undefined}>
              <Input type="password" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} autoComplete="new-password" placeholder={settings.hasSecret ? '••••••••' : ''} />
            </Field>
            <div className="sm:col-span-2">
              <Field label={t('server.storage.publicUrl')} hint={t('server.storage.publicUrlHint')}>
                <Input value={publicUrl} onChange={(e) => setPublicUrl(e.target.value)} placeholder="https://media.example.com" />
              </Field>
            </div>
          </div>
        )}
      </fieldset>
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          {driver === 's3' && (
            <Button type="button" variant="outline" onClick={() => run('test')} disabled={!!busy || !canSave}>
              {busy === 'test' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : tested ? <CheckCircle2 className="h-4 w-4 mr-1.5 text-emerald-500" /> : <HardDrive className="h-4 w-4 mr-1.5" />}
              {t('server.storage.test')}
            </Button>
          )}
          <Button type="button" onClick={() => run('save')} disabled={!!busy || !canSave} className="ml-auto">
            {busy === 'save' && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {t('server.save')}
          </Button>
        </div>
      )}
      {settings.restartRequired && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <span className="flex-1">{t('server.storage.restartRequired')}</span>
          {showRestart && (
            <Button type="button" size="sm" variant="outline" onClick={restart} disabled={!!busy}>
              {busy === 'restart' ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5 mr-1" />}
              {t('server.storage.restart')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

