'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ADMIN_ONLY, canView } from '@/lib/access';

/**
 * Wrap an admin page with this component. Without `module` only admins see it;
 * with one, any role that can view that module (Users → Permissions → Module
 * access). Everyone else is sent to the dashboard.
 */
export default function AdminGuard({ module = ADMIN_ONLY, children }: { module?: string; children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const allowed = canView(user, module);

  useEffect(() => {
    if (user && !allowed) router.replace('/');
  }, [user, allowed, router]);

  if (!user || !allowed) return null;

  return <>{children}</>;
}
