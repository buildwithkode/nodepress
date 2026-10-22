'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'use-intl';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors');
  const router = useRouter();

  useEffect(() => {
    // Log to console in dev; Sentry captures it automatically in prod via the global filter
    console.error('[Admin Error Boundary]', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <CardTitle>{t('page.title')}</CardTitle>
          </div>
          <CardDescription>
            {t('page.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {process.env.NODE_ENV === 'development' && (
            <pre className="rounded-md bg-muted p-3 text-xs text-muted-foreground overflow-auto max-h-40 whitespace-pre-wrap break-all">
              {error.message}
              {error.stack ? `\n\n${error.stack}` : ''}
            </pre>
          )}
          {error.digest && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t('page.errorId')} <span className="font-mono">{error.digest}</span>
            </p>
          )}
        </CardContent>
        <CardFooter className="gap-2">
          <Button variant="outline" onClick={() => router.push('/')}>
            {t('page.goToDashboard')}
          </Button>
          <Button onClick={reset}>{t('page.tryAgain')}</Button>
        </CardFooter>
      </Card>
    </div>
  );
}
