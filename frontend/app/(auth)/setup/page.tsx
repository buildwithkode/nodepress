'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import api from '../../../lib/axios';
import { cn } from '@/lib/utils';

/* ─── Password strength helper ─────────────────────────────── */
type Strength = { label: string; color: string; widthClass: string };

function getStrength(pw: string): Strength {
  if (!pw) return { label: '', color: '', widthClass: 'w-0' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { label: 'Very Weak', color: 'bg-red-500 text-red-600', widthClass: 'w-1/5' };
  if (score === 2) return { label: 'Weak', color: 'bg-yellow-500 text-yellow-600', widthClass: 'w-2/5' };
  if (score === 3) return { label: 'Medium', color: 'bg-yellow-400 text-yellow-600', widthClass: 'w-3/5' };
  if (score === 4) return { label: 'Strong', color: 'bg-green-500 text-green-600', widthClass: 'w-4/5' };
  return { label: 'Very Strong', color: 'bg-green-600 text-green-700', widthClass: 'w-full' };
}

/* ─── Reusable row for the WordPress-style table layout ────── */
function FormRow({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-0 py-2">
      <label
        htmlFor={htmlFor}
        className="sm:w-40 sm:text-right sm:pr-4 pt-1.5 text-sm font-semibold text-gray-800 shrink-0"
      >
        {label}
      </label>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

/* ─── Shared input className ────────────────────────────────── */
function fieldCls(hasError: boolean) {
  return cn(
    'w-full h-9 px-2.5 text-sm border rounded text-gray-800 bg-white outline-none transition-colors',
    'focus:border-blue-500 focus:ring-1 focus:ring-blue-400',
    hasError ? 'border-red-500' : 'border-gray-400',
  );
}

/* ─── Component ─────────────────────────────────────────────── */
export default function SetupPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const [siteName, setSiteName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [createdEmail, setCreatedEmail] = useState('');

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
    if (!email.trim()) e.email = 'Email address is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Enter a valid email address.';
    if (!password) e.password = 'Password is required.';
    else if (password.length < 8) e.password = 'Password must be at least 8 characters.';
    if (password !== confirm) e.confirm = 'Passwords do not match.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setServerError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/register', { email, password });
      login(res.data.access_token, res.data.user);
      if (siteName) localStorage.setItem('np_site_name', siteName);
      setCreatedEmail(email);
      setDone(true);
    } catch (err: any) {
      setServerError(err.response?.data?.message || 'Installation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-[#f0f0f1] flex items-center justify-center">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f0f1] font-sans text-sm text-gray-800">

      {/* Logo header */}
      <div className="flex flex-col items-center pt-9 pb-5">
        <div className="w-[72px] h-[72px] rounded-full bg-[#2271b1] flex items-center justify-center shadow-[0_4px_16px_rgba(34,113,177,0.35)]">
          <span className="text-white text-4xl font-extrabold tracking-tight leading-none">N</span>
        </div>
        <span className="block mt-3 text-[13px] text-gray-500 tracking-[2px] uppercase font-semibold">
          NodePress
        </span>
      </div>

      {/* Main card */}
      <div className="bg-white border border-gray-300 rounded mx-auto max-w-[530px] mb-10 px-9 pt-6 pb-9 shadow-sm">

        {!done ? (
          <>
            <h1 className="text-[23px] font-normal text-gray-800 mt-0 mb-5 pb-3.5 border-b border-gray-200">
              Information needed
            </h1>
            <p className="text-gray-500 leading-relaxed mb-6">
              Please provide the following information. Don't worry, you can always change these settings later.
            </p>

            {/* Server error */}
            {serverError && (
              <div className="bg-red-50 border border-red-400 border-l-4 border-l-red-500 px-4 py-3 mb-5 rounded-sm text-red-600 text-[13px]">
                <strong>Error:</strong> {serverError}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <div className="divide-y divide-transparent">

                {/* Site Name */}
                <FormRow label="Site Title" htmlFor="siteName">
                  <input
                    id="siteName"
                    className={fieldCls(!!errors.siteName)}
                    value={siteName}
                    onChange={(e) => setSiteName(e.target.value)}
                    placeholder="My Awesome Site"
                    autoFocus
                  />
                  {errors.siteName && (
                    <p className="text-[12px] text-red-600 mt-1">{errors.siteName}</p>
                  )}
                </FormRow>

                {/* Email */}
                <FormRow label="Admin Email" htmlFor="email">
                  <input
                    id="email"
                    type="email"
                    className={fieldCls(!!errors.email)}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                  {errors.email ? (
                    <p className="text-[12px] text-red-600 mt-1">{errors.email}</p>
                  ) : (
                    <p className="text-[12px] text-gray-500 mt-1 leading-snug">
                      Double-check your email address before continuing.
                    </p>
                  )}
                </FormRow>

                {/* Password */}
                <FormRow label="Password" htmlFor="password">
                  <input
                    id="password"
                    type="password"
                    className={fieldCls(!!errors.password)}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                  />
                  {/* Strength bar */}
                  {password && (
                    <div className="mt-1.5">
                      <div className="h-1 w-full bg-gray-200 rounded overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded transition-all duration-300',
                            strength.widthClass,
                            strength.color.split(' ')[0], // bg-* part
                          )}
                        />
                      </div>
                      <p className={cn('text-[12px] font-semibold mt-0.5', strength.color.split(' ')[1])}>
                        Strength: {strength.label}
                      </p>
                    </div>
                  )}
                  {errors.password && (
                    <p className="text-[12px] text-red-600 mt-1">{errors.password}</p>
                  )}
                </FormRow>

                {/* Confirm Password */}
                <FormRow label="Confirm Password" htmlFor="confirm">
                  <input
                    id="confirm"
                    type="password"
                    className={fieldCls(!!errors.confirm)}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repeat password"
                  />
                  {errors.confirm && (
                    <p className="text-[12px] text-red-600 mt-1">{errors.confirm}</p>
                  )}
                </FormRow>

              </div>

              {/* Submit */}
              <div className="mt-6">
                <button
                  type="submit"
                  disabled={loading}
                  className={cn(
                    'inline-block px-[22px] py-1.5 text-sm font-semibold text-white rounded-[3px]',
                    'bg-[#2271b1] hover:bg-[#135e96] transition-colors',
                    'disabled:opacity-70 disabled:cursor-not-allowed',
                  )}
                >
                  {loading ? 'Installing…' : 'Install NodePress'}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            {/* Success screen */}
            <h1 className="text-[23px] font-normal text-green-600 mt-0 mb-5 pb-3.5 border-b border-gray-200">
              Success!
            </h1>
            <p className="text-gray-500 leading-relaxed mb-6">
              NodePress has been installed. Thank you, and enjoy!
            </p>

            <div className="bg-[#fcf9e8] border border-[#dba617] border-l-4 border-l-[#dba617] px-4 py-3 mb-5 rounded-sm text-[13px] text-gray-600">
              <strong>Note:</strong> Save your login details in a safe place. If you lose your password, you will need to reset it manually.
            </div>

            {/* Summary table */}
            <div className="w-full mb-5 divide-y divide-gray-100">
              <div className="flex py-2">
                <span className="w-36 text-right pr-4 text-sm font-semibold text-gray-700 shrink-0">Site Title</span>
                <span className="text-sm text-gray-800">{siteName}</span>
              </div>
              <div className="flex py-2">
                <span className="w-36 text-right pr-4 text-sm font-semibold text-gray-700 shrink-0">Email</span>
                <span className="text-sm text-gray-800">{createdEmail}</span>
              </div>
              <div className="flex py-2">
                <span className="w-36 text-right pr-4 text-sm font-semibold text-gray-700 shrink-0">Password</span>
                <span className="text-sm text-gray-800">
                  <code className="bg-gray-100 px-2 py-0.5 rounded text-[13px] font-mono">
                    Your chosen password
                  </code>
                </span>
              </div>
            </div>

            <button
              onClick={() => router.push('/')}
              className="inline-block px-[22px] py-1.5 text-sm font-semibold text-white rounded-[3px] bg-[#2271b1] hover:bg-[#135e96] transition-colors"
            >
              Log In to Dashboard
            </button>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="text-center text-[13px] text-gray-500 pb-6">
        NodePress &mdash; Headless CMS &mdash; v1.0
      </div>
    </div>
  );
}
