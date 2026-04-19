'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../../context/AuthContext';
import api from '../../../lib/axios';
import { Button } from '@/components/ui/button';

function loginErrorMessage(err: any): string {
  if (!err.response) return 'Cannot connect to the server. Is the backend running?';
  if (err.response.status === 401) return 'Invalid email or password.';
  if (err.response.status === 429) return 'Too many attempts. Please wait a minute and try again.';
  if (err.response.status >= 500) return 'Server error. Please try again later.';
  return err.response?.data?.message || 'Something went wrong. Please try again.';
}

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams?.get('reason');

  const [siteName, setSiteName] = useState('NodePress Admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('np_site_name');
    if (stored) setSiteName(`${stored} Admin`);
    api.get('/auth/setup-status').then((res) => {
      if (res.data.required) router.replace('/setup');
    }).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
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
            <h1 className="text-xl font-bold text-white">{siteName}</h1>
            <p className="text-sm text-white/40 mt-1">Sign in to your admin account</p>
          </div>

          {/* Session expired banner */}
          {reason === 'expired' && (
            <div className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-300 text-center">
              Your session expired. Please sign in again.
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
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

            {error && (
              <p className="text-sm text-red-400 text-center">{error}</p>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="mt-5 text-center text-xs text-white/30">
            <a href="/forgot-password" className="hover:text-white/60 transition-colors">
              Forgot password?
            </a>
          </p>
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
