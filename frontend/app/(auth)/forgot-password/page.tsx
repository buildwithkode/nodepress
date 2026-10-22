'use client';

import { useState } from 'react';
import Link from 'next/link';
import api from '../../../lib/axios';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'use-intl';

export default function ForgotPasswordPage() {
  const t = useTranslations('auth');
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) {
      setError(t('forgot.emailRequired'));
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/forgot-password', { email });
      if (res.data.devResetUrl) setDevResetUrl(res.data.devResetUrl);
      setSubmitted(true);
    } catch (err: any) {
      if (!err.response) {
        setError(t('forgot.unreachable'));
      } else if (err.response.status === 429) {
        setError(t('forgot.tooManyAttempts'));
      } else {
        setError(t('forgot.generic'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(devResetUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d0d0d] px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-white/10 bg-[#1a1a1a] px-8 py-10 shadow-2xl">

          <div className="text-center mb-8">
            <h1 className="text-xl font-bold text-white">{t('forgot.title')}</h1>
            <p className="text-sm text-white/40 mt-1">
              {submitted
                ? devResetUrl
                  ? t('forgot.subtitleDevLink')
                  : t('forgot.subtitleSent')
                : t('forgot.subtitle')}
            </p>
          </div>

          {submitted ? (
            <div className="space-y-4">
              {devResetUrl ? (
                /* Dev mode: no SMTP — show the link directly */
                <div className="space-y-3">
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-300">
                    {t.rich('forgot.devModeNotice', { strong: (chunks) => <strong>{chunks}</strong> })}
                  </div>
                  <div className="rounded-lg bg-[#2a2a2a] border border-white/10 px-3 py-2 text-xs text-white/60 break-all">
                    {devResetUrl}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={handleCopy}
                    >
                      {copied ? t('forgot.copied') : t('forgot.copyLink')}
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => window.open(devResetUrl, '_self')}
                    >
                      {t('forgot.openLink')}
                    </Button>
                  </div>
                </div>
              ) : (
                /* Production mode: SMTP configured */
                <p className="text-center text-sm text-white/50">
                  {t('forgot.sentNotice')}
                </p>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
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

              {error && (
                <p className="text-sm text-red-400 text-center">{error}</p>
              )}

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? t('forgot.sending') : t('forgot.send')}
              </Button>
            </form>
          )}

          <p className="mt-5 text-center text-xs text-white/30">
            <Link href="/login" className="hover:text-white/60 transition-colors">
              {t('backToSignIn')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
