'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../../context/AuthContext';
import { useBrand } from '../../../context/BrandContext';
import api from '../../../lib/axios';
import Cookies from 'js-cookie';
import { Button } from '@/components/ui/button';
import { Shield, KeyRound, ArrowLeft } from 'lucide-react';

function loginErrorMessage(err: any): string {
  if (!err.response) return 'Cannot connect to the server. Is the backend running?';
  if (err.response.status === 401) return err.response?.data?.message || 'Invalid email or password.';
  if (err.response.status === 429) return 'Too many attempts. Please wait a minute and try again.';
  if (err.response.status >= 500) return 'Server error. Please try again later.';
  return err.response?.data?.message || 'Something went wrong. Please try again.';
}

function LoginForm() {
  const { login, user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams?.get('reason');

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
      if (res.data.required) {
        Cookies.remove('np_initialized');
        router.replace('/setup');
        return;
      }
      setChecking(false);
    }).catch(() => {
      setChecking(false);
    });
  }, []);

  if (checking) {
    return <div className="min-h-screen bg-[#0d0d0d]" />;
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      if (res.data.requires2fa) {
        setRequires2fa(true);
        setTempToken(res.data.tempToken);
        setTwoFactorCode('');
      } else {
        login(res.data.access_token, res.data.user);
        router.push('/');
      }
    } catch (err: any) {
      setError(loginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handle2faSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!twoFactorCode.trim()) {
      setError(useRecoveryCode ? 'Please enter a backup recovery code.' : 'Please enter your 6-digit code.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/2fa/verify-login', {
        tempToken,
        code: twoFactorCode.trim(),
      });
      login(res.data.access_token, res.data.user);
      router.push('/');
    } catch (err: any) {
      setError(loginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-[#0d0d0d] px-4">
      {/* Docs link */}
      <a
        href="/docs"
        className="absolute top-4 right-4 flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
        Docs
      </a>

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
              {requires2fa ? 'Two-Factor Authentication' : 'Sign in to your admin account'}
            </p>
          </div>

          {/* Session expired banner */}
          {!requires2fa && reason === 'expired' && (
            <div className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-300 text-center">
              Your session expired. Please sign in again.
            </div>
          )}

          {!requires2fa ? (
            /* Standard Login Form */
            <form onSubmit={handlePasswordSubmit} noValidate className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-sm font-medium text-white/80">
                  Email
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
                  Password
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
                {loading ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          ) : (
            /* 2FA Verification Form */
            <form onSubmit={handle2faSubmit} noValidate className="space-y-5">
              <div className="flex items-center justify-center p-3 rounded-full bg-blue-500/10 text-blue-400 w-12 h-12 mx-auto mb-2">
                {useRecoveryCode ? <KeyRound className="w-6 h-6" /> : <Shield className="w-6 h-6" />}
              </div>

              <p className="text-xs text-white/60 text-center">
                {useRecoveryCode
                  ? 'Enter one of your 8-character backup recovery codes.'
                  : 'Enter the 6-digit code from your authenticator app (Google Authenticator, 1Password, Authy).'
                }
              </p>

              <div className="space-y-1.5">
                <label htmlFor="2fa-code" className="block text-xs font-medium text-white/80 text-center">
                  {useRecoveryCode ? 'Recovery Code' : '6-Digit Verification Code'}
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
                {loading ? 'Verifying…' : 'Verify & Sign In'}
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
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
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
                  {useRecoveryCode ? 'Use Authenticator App' : 'Use Recovery Code'}
                </button>
              </div>
            </form>
          )}

          {!requires2fa && (
            <p className="mt-5 text-center text-xs text-white/30">
              <a href="/forgot-password" className="hover:text-white/60 transition-colors">
                Forgot password?
              </a>
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
