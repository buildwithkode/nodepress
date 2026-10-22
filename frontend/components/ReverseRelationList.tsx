'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Link2 } from 'lucide-react';
import { useTranslations } from 'use-intl';
import api from '@/lib/axios';
import { Badge } from '@/components/ui/badge';
import { firstTextField } from '@/components/RelationPicker';

interface Linked {
  id: number;
  slug: string;
  locale: string;
  status: string;
  data: Record<string, any>;
}

/** Read-only view of a reverse relation field: the entries that link to this one. */
export function ReverseRelationList({
  entryId,
  field,
  relatedContentType,
  mappedBy,
}: {
  entryId?: number;
  field: string;
  relatedContentType: string;
  mappedBy: string;
}) {
  const t = useTranslations('entryEditor');
  const tc = useTranslations('common');
  const [linked, setLinked] = useState<Linked[] | null>(null);

  useEffect(() => {
    if (!entryId) return;
    api
      .get(`/entries/${entryId}`, { params: { populate: field } })
      .then((r) => {
        const value = r.data?.data?.[field];
        setLinked(Array.isArray(value) ? value : value ? [value] : []);
      })
      .catch(() => setLinked([]));
  }, [entryId, field]);

  const hint = (
    <p className="text-[11px] text-muted-foreground">
      {t.rich('reverseRelation.hint', {
        field: mappedBy,
        type: relatedContentType.replace(/_/g, ' '),
        code: (chunks) => <span className="font-mono">{chunks}</span>,
      })}
    </p>
  );

  if (!entryId) {
    return <div className="space-y-1"><p className="text-xs text-muted-foreground">{t('reverseRelation.saveFirst')}</p>{hint}</div>;
  }
  if (linked === null) return <p className="text-xs text-muted-foreground">{tc('loading')}</p>;

  return (
    <div className="space-y-1.5">
      {linked.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('reverseRelation.empty')}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {linked.map((e) => (
            <Link key={e.id} href={`/entries/${e.id}/edit`}>
              <Badge variant="secondary" className="gap-1 text-xs hover:bg-secondary/70">
                <Link2 className="h-3 w-3 text-muted-foreground" />
                {e.slug}
                {firstTextField(e.data ?? {}) && (
                  <span className="text-muted-foreground/60 max-w-[120px] truncate"> · {firstTextField(e.data)}</span>
                )}
                {e.status !== 'published' && <span className="text-muted-foreground/60">({tc.has(`statuses.${e.status}`) ? tc(`statuses.${e.status}`) : e.status})</span>}
              </Badge>
            </Link>
          ))}
        </div>
      )}
      {hint}
    </div>
  );
}
