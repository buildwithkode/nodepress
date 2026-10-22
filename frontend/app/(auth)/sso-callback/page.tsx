'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import api from '../../../lib/axios';
import { useAuth } from '../../../context/AuthContext';
import { useTranslations } from 'use-intl';

/** Same-site paths only — never redirect to another origin. */
function safeReturnTo(raw: string | null | undefined): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\') ? raw : '/';
}

/**
 * Last step of single sign-on. The backend redirects here with a one-time code
 * in the URL fragment (#code=…, never sent to a server); it is swapped for the
 * normal access token + refresh cookie.
 */
function SsoCallback() {
  const t = useTranslations('auth');
  const { login } = useAuth();
  const searchParams = useSearchParams();
  const [error, setError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // React strict mode runs effects twice; the code is single-use
    started.current = true;
    const code = new URLSearchParams(window.location.hash.slice(1)).get('code');
    // Drop the code from the address bar and history right away.
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    if (!code) {
      setError(t('sso.incomplete'));
      return;
    }
    api
      .post('/auth/oidc/exchange', { code })
      .then((res) => {
        login(res.data.access_token, res.data.user);
        window.location.href = safeReturnTo(searchParams?.get('returnTo'));
      })
      .catch((err) => setError(err?.response?.data?.message ?? t('sso.failed')));
  }, []);

  return (
    <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center px-4">
      <div className="text-center text-sm text-white/70 space-y-3">
        {error ? (
          <>
            <p className="text-red-300">{error}</p>
            <Link href="/login" className="text-blue-400 hover:underline">{t('backToSignIn')}</Link>
          </>
        ) : (
          <p>{t('sso.signingIn')}</p>
        )}
      </div>
    </div>
  );
}

export default function SsoCallbackPage() {
  return (
    <Suspense>
      <SsoCallback />
    </Suspense>
  );
}
