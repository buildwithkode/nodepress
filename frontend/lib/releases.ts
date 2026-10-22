/** Shared shapes and styles for content releases (GET /api/releases). Labels live in messages/<locale>/releases.json. */
export type ReleaseStatus = 'open' | 'scheduled' | 'publishing' | 'published' | 'failed';
export type ReleaseAction = 'publish' | 'unpublish' | 'archive';

export interface ReleaseSummary {
  id: number;
  name: string;
  description: string | null;
  status: ReleaseStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  error: string | null;
  createdAt: string;
  itemCount?: number;
}

export interface ReleaseItem {
  id: number;
  entryId: number;
  action: ReleaseAction;
  entry: {
    id: number;
    slug: string;
    locale: string;
    status: string;
    deletedAt: string | null;
    data: Record<string, any>;
    contentType: { id: number; name: string; displayName: string | null };
  };
  conflicts: Array<{ id: number; name: string; scheduledAt: string | null; action: ReleaseAction }>;
}

export interface Release extends ReleaseSummary {
  items: ReleaseItem[];
}

export const EDITABLE_STATUSES: ReleaseStatus[] = ['open', 'scheduled', 'failed'];

export const RELEASE_STATUS_STYLES: Record<ReleaseStatus, string> = {
  open: 'bg-muted text-muted-foreground border border-border',
  scheduled: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20',
  publishing: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20',
  published: 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20',
  failed: 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20',
};

/** Every release action, in display order — label with t(`actions.${action}`) (releases namespace). */
export const RELEASE_ACTIONS: ReleaseAction[] = ['publish', 'unpublish', 'archive'];
