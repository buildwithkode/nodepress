'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../context/AuthContext';
import { useBrand } from '../../../context/BrandContext';
import api from '../../../lib/axios';
import Cookies from 'js-cookie';
import { Button } from '@/components/ui/button';
import { Shield, KeyRound, ArrowLeft } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { AdminLanguageSwitcher } from '@/components/AdminLanguageSwitcher';

function loginErrorMessage(err: any, t: ReturnType<typeof useTranslations>): string {
  if (!err.response) {
    return t('login.errors.unreachable');
  }
  const status = err.response.status;
  const backendMsg = err.response?.data?.message;

  if (status === 401) {
    return backendMsg || t('login.errors.invalidCredentials');
  }
  if (status === 429) {
    return t('login.errors.tooManyAttempts');
  }
  if (status === 502 || status === 503 || status === 504) {
    return t('login.errors.offline');
  }
  if (status >= 500) {
    if (backendMsg && typeof backendMsg === 'string') {
      return t('login.errors.serverError', { message: backendMsg });
    }
    return t('login.errors.connectionFailed');
  }
  return backendMsg || t('login.errors.generic');
}

function LoginForm() {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const { login, user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams?.get('reason');
  const ssoError = searchParams?.get('sso_error');
  const [sso, setSso] = useState<{ enabled: boolean; providerName: string | null }>({ enabled: false, providerName: null });

  const { brand } = useBrand();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // 2FA state
  const [requires2fa, setRequires2fa] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);

  // Redirect away if the AuthContext silently restored the session via refresh token
  useEffect(() => {
    if (!authLoading && user) router.replace('/');
  }, [authLoading, user]);

  useEffect(() => {
    api.get('/auth/setup-status').then((res) => {
      if (res.data?.required) {
        Cookies.remove('np_initialized');
        router.replace('/setup');
        return;
      }
      setChecking(false);
    }).catch(() => {
      setChecking(false);
    });
    api.get('/auth/oidc/config').then((res) => setSso(res.data)).catch(() => { /* SSO optional */ });
  }, []);

  if (checking) {
    return <div className="min-h-screen bg-[#0d0d0d]" />;
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setError(t('login.errors.missingCredentials'));
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email: normalizedEmail, password });
      if (res.data.requires2fa) {
        setRequires2fa(true);
        setTempToken(res.data.tempToken);
        setTwoFactorCode('');
      } else {
        login(res.data.access_token, res.data.user);
        window.location.href = '/';
      }
    } catch (err: any) {
      setError(loginErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  };

  const handle2faSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!twoFactorCode.trim()) {
      setError(useRecoveryCode ? t('login.errors.missingRecoveryCode') : t('login.errors.missingCode'));
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/2fa/verify-login', {
        tempToken,
        code: twoFactorCode.trim(),
      });
      login(res.data.access_token, res.data.user);
      window.location.href = '/';
    } catch (err: any) {
      setError(loginErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-[#0d0d0d] px-4">
      {/* Language + docs link */}
      <div className="absolute top-4 right-4 flex items-center gap-3">
      <AdminLanguageSwitcher className="border-white/10 bg-transparent text-white/60 hover:text-white/80" />
      <a
        href="/docs"
        className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
        {t('docs')}
      </a>
      </div>

      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-white/10 bg-[#1a1a1a] px-8 py-10 shadow-2xl">
          {/* Title */}
          <div className="text-center mb-8">
            {brand.brandLogoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.brandLogoUrl} alt={brand.brandName} className="h-10 mx-auto mb-3 object-contain" />
            )}
            <h1 className="text-xl font-bold text-white">{brand.brandName}</h1>
            <p className="text-sm text-white/40 mt-1">
              {requires2fa ? t('login.twoFactorTitle') : t('login.subtitle')}
            </p>
          </div>

          {/* Session expired banner */}
          {!requires2fa && reason === 'expired' && (
            <div className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-xs text-amber-300 text-center space-y-1">
              <p className="font-medium">{t('login.sessionExpired')}</p>
              <p className="text-amber-400/80 text-[11px]">{t('login.sessionExpiredHint')}</p>
            </div>
          )}

          {!requires2fa && ssoError && (
            <div className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-3 text-xs text-red-300 text-center">
              {ssoError}
            </div>
          )}

          {!requires2fa ? (
            /* Standard Login Form */
            <form onSubmit={handlePasswordSubmit} noValidate className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-sm font-medium text-white/80">
                  {t('login.email')}
                </label>
                <input
                  id="email"
                  type="email"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                  className="w-full rounded-lg bg-[#2a2a2a] border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-sm font-medium text-white/80">
                  {t('login.password')}
                </label>
                <input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full rounded-lg bg-[#2a2a2a] border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-colors"
                />
              </div>

              {error && <p className="text-sm text-red-400 text-center">{error}</p>}

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? t('login.signingIn') : t('login.signIn')}
              </Button>

              {sso.enabled && (
                <>
                  <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-white/30">
                    <span className="h-px flex-1 bg-white/10" /> {t('login.or')} <span className="h-px flex-1 bg-white/10" />
                  </div>
                  {/* Full-page navigation: the backend redirects to the identity provider. */}
                  <a
                    href="/api/auth/oidc/login?returnTo=%2F"
                    className="flex w-full items-center justify-center rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm font-medium text-white hover:bg-white/10 transition-colors"
                  >
                    {t('login.continueWith', { provider: sso.providerName ?? '' })}
                  </a>
                </>
              )}
            </form>
          ) : (
            /* 2FA Verification Form */
            <form onSubmit={handle2faSubmit} noValidate className="space-y-5">
              <div className="flex items-center justify-center p-3 rounded-full bg-blue-500/10 text-blue-400 w-12 h-12 mx-auto mb-2">
                {useRecoveryCode ? <KeyRound className="w-6 h-6" /> : <Shield className="w-6 h-6" />}
              </div>

              <p className="text-xs text-white/60 text-center">
                {useRecoveryCode
                  ? t('login.recoveryCodeHint')
                  : t('login.codeHint')
                }
              </p>

              <div className="space-y-1.5">
                <label htmlFor="2fa-code" className="block text-xs font-medium text-white/80 text-center">
                  {useRecoveryCode ? t('login.recoveryCodeLabel') : t('login.codeLabel')}
                </label>
                <input
                  id="2fa-code"
                  type="text"
                  placeholder={useRecoveryCode ? 'XXXX-XXXX' : '123456'}
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value)}
                  autoFocus
                  maxLength={useRecoveryCode ? 12 : 6}
                  className="w-full text-center tracking-widest text-lg font-mono rounded-lg bg-[#2a2a2a] border border-white/10 px-3 py-2.5 text-white placeholder:text-white/25 outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-colors"
                />
              </div>

              {error && <p className="text-sm text-red-400 text-center">{error}</p>}

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? t('login.verifying') : t('login.verify')}
              </Button>

              <div className="flex items-center justify-between text-xs pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setRequires2fa(false);
                    setError('');
                  }}
                  className="inline-flex items-center gap-1 text-white/40 hover:text-white/80 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> {tc('back')}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setUseRecoveryCode(!useRecoveryCode);
                    setTwoFactorCode('');
                    setError('');
                  }}
                  className="text-blue-400 hover:underline"
                >
                  {useRecoveryCode ? t('login.useAuthenticator') : t('login.useRecoveryCode')}
                </button>
              </div>
            </form>
          )}

          {!requires2fa && (
            <p className="mt-5 text-center text-xs text-white/30">
              <Link href="/forgot-password" className="hover:text-white/60 transition-colors">
                {t('login.forgotPassword')}
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
