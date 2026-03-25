'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import api from '../../../lib/axios';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/* ─── Password strength ─────────────────────────────────────── */
function getStrength(pw: string) {
  if (!pw) return { label: '', bar: 'w-0', color: '' };
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (s <= 1) return { label: 'Very Weak',   bar: 'w-1/5',  color: 'bg-red-500'    };
  if (s === 2) return { label: 'Weak',        bar: 'w-2/5',  color: 'bg-orange-500' };
  if (s === 3) return { label: 'Medium',      bar: 'w-3/5',  color: 'bg-yellow-500' };
  if (s === 4) return { label: 'Strong',      bar: 'w-4/5',  color: 'bg-green-500'  };
  return       { label: 'Very Strong', bar: 'w-full', color: 'bg-emerald-500' };
}

/* ─── Input field ───────────────────────────────────────────── */
const inputCls = (err: boolean) =>
  cn(
    'w-full rounded-lg bg-[#2a2a2a] border px-3 py-2.5 text-sm text-white placeholder:text-white/25 outline-none transition-colors focus:ring-1 focus:ring-white/20',
    err ? 'border-red-500/60' : 'border-white/10 focus:border-white/30',
  );

export default function SetupPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [checking, setChecking] = useState(true);
  const [loading,  setLoading]  = useState(false);
  const [done,     setDone]     = useState(false);

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
    if (!siteName.trim()) e.siteName = 'Site name is required.';
    if (!email.trim()) e.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Enter a valid email.';
    if (!password) e.password = 'Password is required.';
    else if (password.length < 8) e.password = 'At least 8 characters.';
    if (password !== confirm) e.confirm = 'Passwords do not match.';
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
      if (siteName) localStorage.setItem('np_site_name', siteName);
      setSavedEmail(email);
      setDone(true);
    } catch (err: any) {
      setServerErr(err.response?.data?.message || 'Setup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center">
        <p className="text-sm text-white/40">Loading…</p>
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
        Docs
      </a>

      <div className="w-full max-w-sm">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-xl font-extrabold">N</span>
          </div>
          <h1 className="text-xl font-bold text-white">
            {done ? 'Setup complete!' : 'Set up NodePress'}
          </h1>
          <p className="text-sm text-white/40 mt-1">
            {done ? 'Your CMS is ready to use.' : 'Create your admin account to get started.'}
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#1a1a1a] px-8 py-8 shadow-2xl">

          {!done ? (
            <form onSubmit={handleSubmit} noValidate className="space-y-4">

              {serverErr && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-400">
                  {serverErr}
                </div>
              )}

              {/* Site name */}
              <div className="space-y-1.5">
                <label htmlFor="siteName" className="block text-sm font-medium text-white/80">Site Name</label>
                <input
                  id="siteName"
                  className={inputCls(!!errors.siteName)}
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                  placeholder="My Awesome Site"
                  autoFocus
                />
                {errors.siteName && <p className="text-xs text-red-400">{errors.siteName}</p>}
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-sm font-medium text-white/80">Admin Email</label>
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
                <label htmlFor="password" className="block text-sm font-medium text-white/80">Password</label>
                <input
                  id="password"
                  type="password"
                  className={inputCls(!!errors.password)}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                />
                {password && (
                  <div className="mt-1">
                    <div className="h-1 w-full bg-white/10 rounded overflow-hidden">
                      <div className={cn('h-full rounded transition-all duration-300', strength.bar, strength.color)} />
                    </div>
                    <p className="text-xs text-white/40 mt-0.5">{strength.label}</p>
                  </div>
                )}
                {errors.password && <p className="text-xs text-red-400">{errors.password}</p>}
              </div>

              {/* Confirm */}
              <div className="space-y-1.5">
                <label htmlFor="confirm" className="block text-sm font-medium text-white/80">Confirm Password</label>
                <input
                  id="confirm"
                  type="password"
                  className={inputCls(!!errors.confirm)}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repeat password"
                />
                {errors.confirm && <p className="text-xs text-red-400">{errors.confirm}</p>}
              </div>

              <Button type="submit" disabled={loading} className="w-full mt-2">
                {loading ? 'Installing…' : 'Install NodePress'}
              </Button>
            </form>

          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300">
                NodePress has been installed successfully!
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/40">Site Name</span>
                  <span className="text-white font-medium">{siteName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Email</span>
                  <span className="text-white font-medium">{savedEmail}</span>
                </div>
              </div>
              <Button onClick={() => router.push('/')} className="w-full">
                Go to Admin Panel
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
