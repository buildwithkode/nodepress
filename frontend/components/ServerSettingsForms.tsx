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
import { PasswordInput } from '@/components/ui/password-input';

/** GET /api/server-settings */
type StorageDriver = 'local' | 's3' | 'r2' | 'imagekit';

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
    driver: StorageDriver;
    bucket: string | null;
    region: string | null;
    endpoint: string | null;
    publicUrl: string | null;
    accessKey: string | null;
    accountId?: string | null;
    urlEndpoint?: string | null;
    folder?: string | null;
    hasSecret: boolean;
    active: StorageDriver | null;
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

  // The setup wizard shows this form in a narrow card: one column there.
  const wide = !compact;

  return (
    <div className="space-y-5">
      {readOnly && <EnvNotice what="SMTP_*" />}
      {!compact && !readOnly && (
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={enabled} onCheckedChange={setEnabled} />
          {t('server.mail.enabled')}
        </label>
      )}
      {enabled && (
        <fieldset disabled={readOnly} className={cn('m-0 grid min-w-0 gap-x-3 gap-y-4 border-0 p-0', wide && 'sm:grid-cols-4')}>
          <div className={cn(wide && 'sm:col-span-2')}>
            <Field label={t('server.mail.host')}>
              <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.example.com" />
            </Field>
          </div>
          <div className={cn('grid grid-cols-2 gap-3', wide && 'sm:col-span-2')}>
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
          <div className={cn(wide && 'sm:col-span-2')}>
            <Field label={t('server.mail.user')}>
              <Input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="off" />
            </Field>
          </div>
          <div className={cn(wide && 'sm:col-span-2')}>
            <Field label={t('server.mail.password')} hint={settings.hasPassword ? t('server.keepSecret') : undefined}>
              <PasswordInput value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" placeholder={settings.hasPassword ? '••••••••' : ''} />
            </Field>
          </div>
          <div className={cn(wide && 'sm:col-span-4')}>
            <Field label={t('server.mail.from')} hint={t('server.mail.fromHint')}>
              <Input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Acme <noreply@acme.com>" />
            </Field>
          </div>
        </fieldset>
      )}
      {enabled && (
        <div className="space-y-1.5 rounded-md border border-border bg-muted/30 p-3">
          <Label className="text-xs">{t('server.mail.testTo')}</Label>
          <div className={cn('flex flex-col gap-2', wide && 'sm:flex-row')}>
            <Input className="min-w-0 flex-1" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" />
            <Button type="button" variant="outline" onClick={test} disabled={!!busy || !testTo || (!readOnly && !host.trim())} className="shrink-0">
              {busy === 'test' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
              {t('server.mail.sendTest')}
            </Button>
          </div>
        </div>
      )}
      {!readOnly && (
        <div className="flex justify-end">
          <Button type="button" onClick={save} disabled={!!busy || (enabled && !host.trim())} className={cn(compact && 'w-full')}>
            {busy === 'save' && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {t('server.save')}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Storage ────────────────────────────────────────────────────────────────

const R2_ENDPOINT = /^https:\/\/([a-f0-9]{32})\.r2\.cloudflarestorage\.com\/?$/i;
// S3 and R2 share one kind of key. Keep in step with sameStorageSecret in the backend.
const sameSecret = (a: StorageDriver, b: StorageDriver) =>
  a === b || ((a === 's3' || a === 'r2') && (b === 's3' || b === 'r2'));

const PROVIDERS = {
  aws: { endpoint: '', region: 'us-east-1' },
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
  // R2 set up earlier as S3-compatible storage opens as R2.
  const legacyR2 = settings.driver === 's3' ? settings.endpoint?.match(R2_ENDPOINT)?.[1] : undefined;
  const [driver, setDriver] = useState<StorageDriver>(legacyR2 ? 'r2' : settings.driver);
  const [provider, setProvider] = useState<Provider>(
    settings.endpoint?.includes('digitaloceanspaces') ? 'spaces'
      : settings.endpoint ? 'other' : 'aws',
  );
  const [accountId, setAccountId] = useState(settings.accountId ?? legacyR2 ?? '');
  const [urlEndpoint, setUrlEndpoint] = useState(settings.urlEndpoint ?? '');
  const [folder, setFolder] = useState(settings.folder ?? '');
  const [bucket, setBucket] = useState(settings.bucket ?? '');
  const [region, setRegion] = useState(settings.region ?? '');
  const [endpoint, setEndpoint] = useState(settings.endpoint ?? '');
  const [accessKey, setAccessKey] = useState(settings.accessKey ?? '');
  const [secretKey, setSecretKey] = useState('');
  const [publicUrl, setPublicUrl] = useState(settings.publicUrl ?? '');
  const [busy, setBusy] = useState<'save' | 'test' | 'restart' | null>(null);
  const [tested, setTested] = useState(false);

  useEffect(() => setTested(false), [driver, bucket, region, endpoint, accessKey, secretKey, accountId, publicUrl, urlEndpoint, folder]);

  // A saved secret only stands in for one of the same kind.
  const secretSaved = settings.hasSecret && sameSecret(settings.driver, driver);

  const body = () => {
    const secret = { secretKey: secretKey || undefined };
    if (driver === 's3') {
      return {
        driver,
        ...secret,
        bucket: bucket.trim(),
        region: region.trim() || undefined,
        endpoint: endpoint.trim() || undefined,
        accessKey: accessKey.trim(),
        publicUrl: publicUrl.trim() || undefined,
      };
    }
    if (driver === 'r2') {
      return { driver, ...secret, accountId: accountId.trim(), bucket: bucket.trim(), accessKey: accessKey.trim(), publicUrl: publicUrl.trim() };
    }
    if (driver === 'imagekit') {
      return { driver, ...secret, urlEndpoint: urlEndpoint.trim(), folder: folder.trim() || undefined };
    }
    return { driver };
  };

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

  const driverItems: Record<StorageDriver, string> = {
    local: t('server.storage.local'), s3: t('server.storage.s3'), r2: 'Cloudflare R2', imagekit: 'ImageKit',
  };
  const providerItems: Record<Provider, string> = {
    aws: 'Amazon S3', spaces: 'DigitalOcean Spaces', other: t('server.storage.otherProvider'),
  };
  // Spaces and others need their endpoint, filled in (not the <region> example).
  const endpointOk = provider === 'aws' || (!!endpoint.trim() && !/[<>]/.test(endpoint));
  const hasSecret = !!secretKey || secretSaved;
  const canSave =
    driver === 'local'
    || (driver === 'imagekit' && !!urlEndpoint.trim() && hasSecret)
    || (driver === 'r2' && /^[a-f0-9]{32}$/i.test(accountId.trim()) && !!bucket.trim() && !!accessKey.trim() && !!publicUrl.trim() && hasSecret)
    || (driver === 's3' && !!bucket.trim() && !!accessKey.trim() && endpointOk && hasSecret);
  const secretHint = secretSaved ? t('server.keepSecret') : undefined;
  const secretPlaceholder = secretSaved ? '••••••••' : '';

  return (
    <div className="space-y-4">
      {readOnly && <EnvNotice what="STORAGE_*" />}
      <fieldset disabled={readOnly} className="m-0 min-w-0 space-y-3 border-0 p-0">
        <Field label={t('server.storage.where')}>
          <Select value={driver} items={driverItems} onValueChange={(v) => setDriver((v as StorageDriver) ?? 'local')}>
            <SelectTrigger className="w-full sm:w-72"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="local">{driverItems.local}</SelectItem>
              <SelectItem value="s3">{driverItems.s3}</SelectItem>
              <SelectItem value="r2">{driverItems.r2}</SelectItem>
              <SelectItem value="imagekit">{driverItems.imagekit}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {driver === 'local' && (
          <p className={cn('text-xs', settings.production ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
            {settings.production ? t('server.storage.localProductionWarning') : t('server.storage.localHint')}
          </p>
        )}
        {driver === 's3' && (
          <div className="grid gap-x-3 gap-y-4 pt-1 sm:grid-cols-2">
            <Field label={t('server.storage.provider')}>
              <Select
                value={provider}
                items={providerItems}
                onValueChange={(v) => {
                  const p = (v as Provider) ?? 'aws';
                  setProvider(p);
                  setRegion(PROVIDERS[p].region);
                  // The provider's endpoint is only an example (placeholder): it has the account or region to fill in.
                  if (Object.values(PROVIDERS).some((x) => x.endpoint === endpoint)) setEndpoint('');
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
            <Field label={t('server.storage.region')}>
              <Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder={PROVIDERS[provider].region} />
            </Field>
            {provider !== 'aws' && (
              <div className="sm:col-span-2">
                <Field label={t('server.storage.endpoint')}>
                  <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder={PROVIDERS[provider].endpoint} />
                </Field>
              </div>
            )}
            <Field label={t('server.storage.accessKey')}>
              <Input value={accessKey} onChange={(e) => setAccessKey(e.target.value)} autoComplete="off" />
            </Field>
            <Field label={t('server.storage.secretKey')} hint={secretHint}>
              <PasswordInput value={secretKey} onChange={(e) => setSecretKey(e.target.value)} autoComplete="new-password" placeholder={secretPlaceholder} />
            </Field>
            <Field label={t('server.storage.bucket')}>
              <Input value={bucket} onChange={(e) => setBucket(e.target.value)} placeholder="my-site-media" />
            </Field>
            <Field label={t('server.storage.publicUrl')} hint={t('server.storage.publicUrlHint')}>
              <Input value={publicUrl} onChange={(e) => setPublicUrl(e.target.value)} placeholder="https://media.example.com" />
            </Field>
          </div>
        )}
        {driver === 'r2' && (
          <div className="grid gap-x-3 gap-y-4 pt-1 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label={t('server.storage.accountId')} hint={t('server.storage.accountIdHint')}>
                <Input value={accountId} onChange={(e) => setAccountId(e.target.value)} autoComplete="off" />
              </Field>
            </div>
            <Field label={t('server.storage.accessKey')}>
              <Input value={accessKey} onChange={(e) => setAccessKey(e.target.value)} autoComplete="off" />
            </Field>
            <Field label={t('server.storage.secretKey')} hint={secretHint}>
              <PasswordInput value={secretKey} onChange={(e) => setSecretKey(e.target.value)} autoComplete="new-password" placeholder={secretPlaceholder} />
            </Field>
            <Field label={t('server.storage.bucket')}>
              <Input value={bucket} onChange={(e) => setBucket(e.target.value)} placeholder="my-site-media" />
            </Field>
            <Field label={t('server.storage.r2PublicUrl')} hint={t('server.storage.r2PublicUrlHint')}>
              <Input value={publicUrl} onChange={(e) => setPublicUrl(e.target.value)} placeholder="https://media.example.com" />
            </Field>
          </div>
        )}
        {driver === 'imagekit' && (
          <div className="grid gap-x-3 gap-y-4 pt-1 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label={t('server.storage.urlEndpoint')} hint={t('server.storage.urlEndpointHint')}>
                <Input value={urlEndpoint} onChange={(e) => setUrlEndpoint(e.target.value)} placeholder="https://ik.imagekit.io/your_id" />
              </Field>
            </div>
            <Field label={t('server.storage.privateKey')} hint={secretHint}>
              <PasswordInput value={secretKey} onChange={(e) => setSecretKey(e.target.value)} autoComplete="new-password" placeholder={secretPlaceholder} />
            </Field>
            <Field label={t('server.storage.folder')} hint={t('server.storage.folderHint')}>
              <Input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="my-site" />
            </Field>
          </div>
        )}
      </fieldset>
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {driver !== 'local' && (
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

