'use client';

import { useEffect } from 'react';

/**
 * global-error.tsx — catches errors in the root layout itself.
 * Must include its own <html> and <body> since the root layout is unavailable.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Global Error Boundary]', error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', margin: 0, background: '#0a0a0a', color: '#fafafa' }}>
        <div style={{ textAlign: 'center', maxWidth: 480, padding: '2rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>Application Error</h1>
          <p style={{ color: '#888', marginBottom: '1.5rem' }}>
            A critical error occurred. Please refresh the page.
          </p>
          {error.digest && (
            <p style={{ fontSize: '0.75rem', color: '#555', marginBottom: '1rem', fontFamily: 'monospace' }}>
              ID: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{ padding: '0.5rem 1.25rem', borderRadius: '0.375rem', border: 'none', background: '#fff', color: '#000', cursor: 'pointer', fontWeight: 600 }}
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
