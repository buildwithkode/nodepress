'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Blocks, Lock } from 'lucide-react';
import { useTranslations } from 'use-intl';
import api from '@/lib/axios';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface ComponentField { name: string; type: string; label?: string; required?: boolean; options?: any }
export interface ReusableComponent {
  id: number;
  name: string;
  displayName?: string | null;
  description?: string | null;
  fields: ComponentField[];
}

/** The field the content type editors insert: a group (one) or repeater (many) using the component. */
export interface ComponentFieldDraft {
  name: string;
  type: 'group' | 'repeater';
  required: boolean;
  options: { component: string; subFields: ComponentField[] };
}

/**
 * "Add component" for the content type editors. The server copies the
 * component's fields into `options.subFields` on save; the copy here is only
 * for display and the JSON preview.
 */
export function AddComponentButton({ onAdd, disabled }: { onAdd: (field: ComponentFieldDraft) => void; disabled?: boolean }) {
  const tcm = useTranslations('components');
  const [open, setOpen] = useState(false);
  const [components, setComponents] = useState<ReusableComponent[] | null>(null);
  const [selected, setSelected] = useState('');
  const [kind, setKind] = useState<'group' | 'repeater'>('group');
  const [fieldName, setFieldName] = useState('');

  useEffect(() => {
    if (!open || components) return;
    api.get('/components').then((r) => setComponents(r.data ?? [])).catch(() => setComponents([]));
  }, [open, components]);

  const component = components?.find((c) => c.name === selected);

  const pick = (name: string) => {
    setSelected(name);
    const c = components?.find((x) => x.name === name);
    setFieldName(c?.displayName || c?.name || '');
  };

  const add = () => {
    if (!component || !fieldName.trim()) return;
    onAdd({
      name: fieldName.trim(),
      type: kind,
      required: false,
      options: { component: component.name, subFields: component.fields.map((f) => ({ ...f })) },
    });
    setOpen(false);
    setSelected('');
    setFieldName('');
    setKind('group');
  };

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)} disabled={disabled}>
        <Blocks className="h-4 w-4 mr-1.5" /> {tcm('add.button')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tcm('add.title')}</DialogTitle>
            <DialogDescription>{tcm('add.description')}</DialogDescription>
          </DialogHeader>
          {components && components.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {tcm.rich('add.none', { link: (chunks) => <Link href="/components" className="text-primary underline">{chunks}</Link> })}
            </p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{tcm('add.component')}</Label>
                <Select value={selected} onValueChange={(v) => pick(String(v ?? ''))}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={tcm('add.choose')} /></SelectTrigger>
                  <SelectContent>
                    {(components ?? []).map((c) => (
                      <SelectItem key={c.name} value={c.name}>{c.displayName || c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {component?.description && <p className="text-xs text-muted-foreground">{component.description}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>{tcm('add.kind')}</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(['group', 'repeater'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKind(k)}
                      className={cn(
                        'rounded-md border px-3 py-2 text-left text-sm transition-colors',
                        kind === k ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
                      )}
                    >
                      <span className="font-medium">{tcm(`add.${k}`)}</span>
                      <span className="block text-xs text-muted-foreground">{tcm(`add.${k}Hint`)}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{tcm('add.fieldName')}</Label>
                <Input value={fieldName} onChange={(e) => setFieldName(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{tcm('cancel')}</Button>
            <Button type="button" onClick={add} disabled={!component || !fieldName.trim()}>{tcm('add.confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Read-only sub-fields of a group/repeater field that uses a component. */
export function ComponentSubFields({ component, subFields }: { component: string; subFields: ComponentField[] }) {
  const tcm = useTranslations('components');
  const tft = useTranslations('contentTypes');
  return (
    <div className="pl-7">
      <div className="border-l-2 border-emerald-400 pl-3 space-y-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Blocks className="h-3.5 w-3.5" />
          {tcm('readOnly.usesComponent')} <code className="rounded bg-muted px-1 py-0.5 font-mono">{component}</code>
        </p>
        <div className="space-y-1">
          {subFields.map((sf) => (
            <div key={sf.name} className="flex items-center gap-2 rounded border bg-background/60 px-2 py-1 text-sm">
              <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="flex-1 truncate">{sf.label || sf.name}</span>
              <code className="text-xs text-muted-foreground font-mono">{sf.name}</code>
              <span className="text-xs text-muted-foreground w-24 text-right">{tft(`fieldTypes.${sf.type}`)}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {tcm.rich('readOnly.note', {
            link: (chunks) => (
              <Link href={`/components?edit=${encodeURIComponent(component)}`} className="text-primary underline">{chunks}</Link>
            ),
          })}
        </p>
      </div>
    </div>
  );
}
