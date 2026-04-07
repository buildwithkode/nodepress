'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { canManageSettings } from '@/lib/roles';

/**
 * Wrap any admin-only page with this component.
 * Redirects editors and viewers to the dashboard immediately.
 */
export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user && !canManageSettings(user.role)) {
      router.replace('/');
    }
  }, [user, router]);

  if (!user || !canManageSettings(user.role)) return null;

  return <>{children}</>;
}
