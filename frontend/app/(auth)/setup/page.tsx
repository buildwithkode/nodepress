'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useBrand } from '../../../context/BrandContext';
import api from '../../../lib/axios';
import Cookies from 'js-cookie';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'use-intl';
import { EmailSettingsForm, ServerSettings, StorageSettingsForm } from '@/components/ServerSettingsForms';

/* ─── Password strength ─────────────────────────────────────── */
function getStrength(pw: string) {
  if (!pw) return { label: '', bar: 'w-0', color: '' };
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (s <= 1) return { label: 'veryWeak',   bar: 'w-1/5',  color: 'bg-red-500'    };
  if (s === 2) return { label: 'weak',        bar: 'w-2/5',  color: 'bg-orange-500' };
  if (s === 3) return { label: 'medium',      bar: 'w-3/5',  color: 'bg-yellow-500' };
  if (s === 4) return { label: 'strong',      bar: 'w-4/5',  color: 'bg-green-500'  };
  return       { label: 'veryStrong', bar: 'w-full', color: 'bg-emerald-500' };
}

/* ─── Input field ───────────────────────────────────────────── */
const inputCls = (err: boolean) =>
  cn(
    'w-full rounded-lg bg-[#2a2a2a] border px-3 py-2.5 text-sm text-white placeholder:text-white/25 outline-none transition-colors focus:ring-1 focus:ring-white/20',
    err ? 'border-red-500/60' : 'border-white/10 focus:border-white/30',
  );

export default function SetupPage() {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const router = useRouter();
  const { login } = useAuth();
  const { refresh: refreshBrand } = useBrand();

  const [checking, setChecking] = useState(true);
  const [loading,  setLoading]  = useState(false);
  // account → email (optional) → storage (optional) → done
  const [step,     setStep]     = useState<'account' | 'email' | 'storage' | 'done'>('account');
  const [server,   setServer]   = useState<ServerSettings | null>(null);
  const done = step === 'done';

  const [siteName,  setSiteName]  = useState('');
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [errors,    setErrors]    = useState<Record<string, string>>({});
  const [serverErr, setServerErr] = useState('');
  const [savedEmail, setSavedEmail] = useState('');

  const strength = getStrength(password);

  useEffect(() => {
    api.get('/auth/setup-status').then((res) => {
      if (!res.data.required) router.replace('/login');
      else setChecking(false);
    }).catch(() => setChecking(false));
  }, []);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!siteName.trim()) e.siteName = t('setup.siteNameRequired');
    if (!email.trim()) e.email = t('setup.emailRequired');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = t('setup.emailInvalid');
    if (!password) e.password = t('setup.passwordRequired');
    else if (password.length < 8) e.password = t('setup.passwordTooShort');
    if (password !== confirm) e.confirm = t('setup.passwordMismatch');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setServerErr('');
    setLoading(true);
    try {
      const res = await api.post('/auth/register', { email, password });
      login(res.data.access_token, res.data.user);
      // Mark setup as complete so the middleware routes future unauthenticated
      // visits to /login instead of /setup (persists across reinstalls).
      Cookies.set('np_initialized', '1', { expires: 3650, sameSite: 'lax' });
      // Seed the install brand with the site name entered here (admin token is
      // now set, so this PUT is authorized). Non-fatal if it fails.
      if (siteName) {
        try {
          await api.put('/brand', { brandName: siteName });
          await refreshBrand();
        } catch { /* brand can still be set later from the Brand page */ }
      }
      setSavedEmail(email);
      // Email and storage are optional steps; skip straight to the end if they can't load.
      try {
        setServer((await api.get('/server-settings')).data);
        setStep('email');
      } catch {
        setStep('done');
      }
    } catch (err: any) {
      setServerErr(err.response?.data?.message || t('setup.failed'));
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center">
        <p className="text-sm text-white/40">{tc('loading')}</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#0d0d0d] flex items-center justify-center px-4 py-12">

      {/* Docs link */}
      <a
        href="/docs"
        className="absolute top-4 right-4 flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
        {t('docs')}
      </a>

      <div className="w-full max-w-sm">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-xl font-extrabold">N</span>
          </div>
          <h1 className="text-xl font-bold text-white">
            {done ? t('setup.completeTitle') : step === 'email' ? t('setup.emailStep.title') : step === 'storage' ? t('setup.storageStep.title') : t('setup.title')}
          </h1>
          <p className="text-sm text-white/40 mt-1">
            {done ? t('setup.completeSubtitle') : step === 'email' ? t('setup.emailStep.subtitle') : step === 'storage' ? t('setup.storageStep.subtitle') : t('setup.subtitle')}
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#1a1a1a] px-8 py-8 shadow-2xl">

          {(step === 'email' || step === 'storage') && server ? (
            // The admin forms use theme tokens; .dark matches this page's look.
            <div className="dark space-y-5 text-foreground">
              <p className="text-[11px] uppercase tracking-widest text-white/40">
                {t('setup.stepOf', { step: step === 'email' ? 2 : 3, total: 3 })}
              </p>
              {step === 'email' ? (
                <EmailSettingsForm
                  compact
                  settings={server.mail}
                  defaultTestTo={savedEmail}
                  onSaved={(next) => { setServer(next); setStep('storage'); }}
                />
              ) : (
                <StorageSettingsForm
                  settings={server.storage}
                  showRestart={false}
                  onSaved={(next) => { setServer(next); setStep('done'); }}
                />
              )}
              <div className="flex justify-between gap-2 border-t border-white/10 pt-4">
                <p className="text-xs text-white/40">{t('setup.laterHint')}</p>
                <Button variant="ghost" size="sm" onClick={() => setStep(step === 'email' ? 'storage' : 'done')}>
                  {t('setup.skip')}
                </Button>
              </div>
            </div>
          ) : !done ? (
            <form onSubmit={handleSubmit} noValidate className="space-y-4">

              {serverErr && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-400">
                  {serverErr}
                </div>
              )}

              {/* Site name */}
              <div className="space-y-1.5">
                <label htmlFor="siteName" className="block text-sm font-medium text-white/80">{t('setup.siteName')}</label>
                <input
                  id="siteName"
                  className={inputCls(!!errors.siteName)}
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                  placeholder={t('setup.siteNamePlaceholder')}
                  autoFocus
                />
                {errors.siteName && <p className="text-xs text-red-400">{errors.siteName}</p>}
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-sm font-medium text-white/80">{t('setup.adminEmail')}</label>
                <input
                  id="email"
                  type="email"
                  className={inputCls(!!errors.email)}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
                {errors.email && <p className="text-xs text-red-400">{errors.email}</p>}
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-sm font-medium text-white/80">{t('setup.password')}</label>
                <input
                  id="password"
                  type="password"
                  className={inputCls(!!errors.password)}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('setup.passwordPlaceholder')}
                />
                {password && (
                  <div className="mt-1">
                    <div className="h-1 w-full bg-white/10 rounded overflow-hidden">
                      <div className={cn('h-full rounded transition-all duration-300', strength.bar, strength.color)} />
                    </div>
                    <p className="text-xs text-white/40 mt-0.5">{t(`setup.strength.${strength.label}`)}</p>
                  </div>
                )}
                {errors.password && <p className="text-xs text-red-400">{errors.password}</p>}
              </div>

              {/* Confirm */}
              <div className="space-y-1.5">
                <label htmlFor="confirm" className="block text-sm font-medium text-white/80">{t('setup.confirmPassword')}</label>
                <input
                  id="confirm"
                  type="password"
                  className={inputCls(!!errors.confirm)}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder={t('setup.confirmPlaceholder')}
                />
                {errors.confirm && <p className="text-xs text-red-400">{errors.confirm}</p>}
              </div>

              <Button type="submit" disabled={loading} className="w-full mt-2">
                {loading ? t('setup.installing') : t('setup.install')}
              </Button>
            </form>

          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300">
                {t('setup.installed')}
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/40">{t('setup.siteName')}</span>
                  <span className="text-white font-medium">{siteName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">{t('setup.adminEmail')}</span>
                  <span className="text-white font-medium">{savedEmail}</span>
                </div>
              </div>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-300">
                {t.rich('setup.saveCredentials', {
                  strong: (chunks) => <strong>{chunks}</strong>,
                  code: (chunks) => <code className="opacity-70">{chunks}</code>,
                })}
              </div>
              {server?.storage.restartRequired && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-300">
                  {t('setup.restartForStorage')}
                </div>
              )}
              <Button onClick={() => router.push('/')} className="w-full">
                {t('setup.goToAdmin')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
