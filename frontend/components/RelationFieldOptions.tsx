'use client';

import { useTranslations } from 'use-intl';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface RelationOptions {
  relatedContentType?: string;
  cardinality?: string;
  mappedBy?: string;
}

interface ContentTypeSummary {
  id: number;
  name: string;
  schema?: Array<{ name: string; label?: string; type: string; options?: RelationOptions }>;
}

const NONE = '__none__';

/**
 * Options for a relation field: the related type, one/many, and optionally
 * "reverse of" — which turns it into a read-only list of the entries whose
 * relation field points here (stored on the other side only).
 */
export function RelationFieldOptions({
  options,
  onChange,
  contentTypes,
  currentType,
}: {
  options: RelationOptions | undefined;
  onChange: (options: RelationOptions) => void;
  contentTypes: ContentTypeSummary[];
  /** snake_case name of the content type being edited */
  currentType: string;
}) {
  const t = useTranslations('contentTypes');
  const related = contentTypes.find((ct) => ct.name === options?.relatedContentType);
  const backFields = (related?.schema ?? []).filter(
    (f) => f.type === 'relation' && !f.options?.mappedBy && f.options?.relatedContentType === currentType,
  );

  return (
    <div className="pl-7 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t('relation.relatedType')}</Label>
          <Select
            value={options?.relatedContentType ?? ''}
            onValueChange={(v) => onChange({ ...options, relatedContentType: v ?? '', mappedBy: undefined })}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t('relation.selectType')} /></SelectTrigger>
            <SelectContent>
              {contentTypes.map((ct) => (
                <SelectItem key={ct.id} value={ct.name} className="text-xs capitalize">{ct.name.replace(/_/g, ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t('relation.cardinality')}</Label>
          <Select
            value={options?.cardinality ?? 'one'}
            onValueChange={(v) => onChange({ ...options, cardinality: v ?? 'one' })}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="one" className="text-xs">{t('relation.one')}</SelectItem>
              <SelectItem value="many" className="text-xs">{t('relation.many')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {options?.relatedContentType && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t('relation.reverseOf')}</Label>
          <Select
            value={options.mappedBy || NONE}
            onValueChange={(v) => onChange({ ...options, mappedBy: !v || v === NONE ? undefined : v })}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE} className="text-xs">{t('relation.reverseNone')}</SelectItem>
              {backFields.map((f) => (
                <SelectItem key={f.name} value={f.name} className="text-xs">
                  {t('relation.reverseOption', { source: `${options.relatedContentType}.${f.name}` })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {options.mappedBy ? (
            <p className="text-[11px] text-muted-foreground">
              {t.rich('relation.readOnly', {
                source: `${options.relatedContentType}.${options.mappedBy}`,
                param: '?populate=',
                code: (chunks) => <span className="font-mono">{chunks}</span>,
              })}
            </p>
          ) : backFields.length === 0 && currentType ? (
            <p className="text-[11px] text-muted-foreground">
              {t.rich('relation.reverseHint', {
                type: options.relatedContentType,
                code: (chunks) => <span className="font-mono">{chunks}</span>,
              })}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
