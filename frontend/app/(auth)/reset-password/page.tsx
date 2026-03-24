'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '../../../lib/axios';
import { Button } from '@/components/ui/button';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) setError('Missing or invalid reset token. Request a new one.');
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
      setTimeout(() => router.replace('/login'), 2000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid or expired token. Request a new reset link.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d0d0d] px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-white/10 bg-[#1a1a1a] px-8 py-10 shadow-2xl">

          <div className="text-center mb-8">
            <h1 className="text-xl font-bold text-white">Set new password</h1>
            <p className="text-sm text-white/40 mt-1">
              {done ? 'Password updated! Redirecting to login…' : 'Choose a new password (min 8 characters).'}
            </p>
          </div>

          {!done && (
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-sm font-medium text-white/80">
                  New password
                </label>
                <input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  autoFocus
                  className="w-full rounded-lg bg-[#2a2a2a] border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="confirm" className="block text-sm font-medium text-white/80">
                  Confirm password
                </label>
                <input
                  id="confirm"
                  type="password"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  className="w-full rounded-lg bg-[#2a2a2a] border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-colors"
                />
              </div>

              {error && (
                <p className="text-sm text-red-400 text-center">{error}</p>
              )}

              <Button type="submit" disabled={loading || !token} className="w-full">
                {loading ? 'Updating…' : 'Update password'}
              </Button>
            </form>
          )}

          <p className="mt-5 text-center text-xs text-white/30">
            <a href="/login" className="hover:text-white/60 transition-colors">
              Back to sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
