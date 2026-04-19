'use client';

import { useState } from 'react';
import api from '../../../lib/axios';
import { Button } from '@/components/ui/button';

export default function ForgotPasswordPage() {
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
      setError('Please enter your email address.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/forgot-password', { email });
      if (res.data.devResetUrl) setDevResetUrl(res.data.devResetUrl);
      setSubmitted(true);
    } catch (err: any) {
      if (!err.response) {
        setError('Cannot connect to the server. Is the backend running?');
      } else if (err.response.status === 429) {
        setError('Too many attempts. Please wait a minute and try again.');
      } else {
        setError('Something went wrong. Please try again.');
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
            <h1 className="text-xl font-bold text-white">Reset your password</h1>
            <p className="text-sm text-white/40 mt-1">
              {submitted
                ? devResetUrl
                  ? 'SMTP not configured — use the link below.'
                  : 'Check your email for the reset link.'
                : "Enter your email and we'll send you a reset link."}
            </p>
          </div>

          {submitted ? (
            <div className="space-y-4">
              {devResetUrl ? (
                /* Dev mode: no SMTP — show the link directly */
                <div className="space-y-3">
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-300">
                    <strong>Development mode:</strong> No SMTP is configured, so no email was sent.
                    Use this link to reset your password (valid 15 minutes):
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
                      {copied ? 'Copied!' : 'Copy link'}
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => window.open(devResetUrl, '_self')}
                    >
                      Open link
                    </Button>
                  </div>
                </div>
              ) : (
                /* Production mode: SMTP configured */
                <p className="text-center text-sm text-white/50">
                  If that email is registered, a reset link valid for 15 minutes has been sent.
                </p>
              )}
            </div>
          ) : (
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

              {error && (
                <p className="text-sm text-red-400 text-center">{error}</p>
              )}

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Sending…' : 'Send reset link'}
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
