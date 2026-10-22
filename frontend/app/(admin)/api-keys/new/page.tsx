'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Copy, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useTranslations } from 'use-intl';

interface ContentType { id: number; name: string }

export default function NewApiKeyPage() {
  const t = useTranslations('developer');
  const tc = useTranslations('common');
  const router = useRouter();
  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formAccess, setFormAccess] = useState<'read' | 'write' | 'all'>('read');
  const [formCTs, setFormCTs] = useState<string[]>(['*']);
  const [formNameError, setFormNameError] = useState('');

  useEffect(() => {
    api.get('/content-types')
      .then((res) => setContentTypes(res.data))
      .catch(() => {});
  }, []);

  const toggleCT = (val: string) => {
    if (val === '*') { setFormCTs(['*']); return; }
    setFormCTs((prev) => {
      const without = prev.filter((v) => v !== '*');
      if (without.includes(val)) {
        const next = without.filter((v) => v !== val);
        return next.length === 0 ? ['*'] : next;
      }
      return [...without, val];
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success(t('apiKeys.copiedToClipboard'));
  };

  const handleCreate = async () => {
    if (!formName.trim()) { setFormNameError(t('apiKeys.nameRequired')); return; }
    setFormNameError('');
    setSubmitting(true);
    try {
      const res = await api.post('/api-keys', {
        name: formName.trim(),
        permissions: {
          access: formAccess,
          contentTypes: formCTs.includes('*') ? ['*'] : formCTs,
        },
      });
      setCreatedKey(res.data.key);
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('apiKeys.createFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Show the created key ── */
  if (createdKey) {
    return (
      <div className="max-w-lg space-y-4">
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => router.push('/api-keys')}>
          <ArrowLeft className="h-4 w-4" /> {t('apiKeys.backToList')}
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <CardTitle>{t('apiKeys.createdTitle')}</CardTitle>
            </div>
            <CardDescription>{t('apiKeys.createdDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <code className="block w-full rounded-md border border-border bg-muted px-3 py-2.5 text-xs font-mono break-all">
              {createdKey}
            </code>
            <Button className="w-full" onClick={() => copyToClipboard(createdKey)}>
              <Copy className="h-4 w-4 mr-2" /> {t('apiKeys.copyKey')}
            </Button>
          </CardContent>
          <CardFooter className="justify-end">
            <Button variant="outline" onClick={() => router.push('/api-keys')}>{t('apiKeys.done')}</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-4">
      <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => router.push('/api-keys')}>
        <ArrowLeft className="h-4 w-4" /> {t('apiKeys.backToList')}
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>{t('apiKeys.newKey')}</CardTitle>
          <CardDescription>
            {t.rich('apiKeys.headerHint', {
              header: 'X-API-Key: <key>',
              code: (chunks) => <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">{chunks}</code>,
            })}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Name */}
          <div className="space-y-1.5">
            <Label>{t('apiKeys.keyName')} <span className="text-destructive">*</span></Label>
            <Input
              placeholder={t('apiKeys.keyNamePlaceholder')}
              value={formName}
              onChange={(e) => { setFormName(e.target.value); setFormNameError(''); }}
            />
            {formNameError && <p className="text-xs text-destructive">{formNameError}</p>}
          </div>

          {/* Access level */}
          <div className="space-y-1.5">
            <Label>{t('apiKeys.accessLevel')}</Label>
            <Select value={formAccess} onValueChange={(v) => setFormAccess(v as any)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="read">{t('apiKeys.accessRead')}</SelectItem>
                <SelectItem value="write">{t('apiKeys.accessWrite')}</SelectItem>
                <SelectItem value="all">{t('apiKeys.accessAll')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Content types */}
          <div className="space-y-1.5">
            <Label>{t('apiKeys.allowedContentTypes')}</Label>
            <ScrollArea className="h-40 rounded-md border border-input bg-background p-2">
              <div className="space-y-1">
                <label className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted/50 cursor-pointer select-none">
                  <Checkbox checked={formCTs.includes('*')} onCheckedChange={() => toggleCT('*')} />
                  <span className="text-sm font-medium">{t('apiKeys.allContentTypes')}</span>
                </label>
                {contentTypes.map((ct) => (
                  <label key={ct.id} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted/50 cursor-pointer select-none">
                    <Checkbox checked={formCTs.includes(ct.name)} onCheckedChange={() => toggleCT(ct.name)} />
                    <span className="text-sm">{ct.name}</span>
                  </label>
                ))}
                {contentTypes.length === 0 && (
                  <p className="text-xs text-muted-foreground px-1 py-1">{t('apiKeys.noContentTypes')}</p>
                )}
              </div>
            </ScrollArea>
            <p className="text-xs text-muted-foreground">{t('apiKeys.contentTypesHint')}</p>
          </div>
        </CardContent>

        <CardFooter className="justify-end gap-2">
          <Button variant="outline" onClick={() => router.push('/api-keys')}>{tc('cancel')}</Button>
          <Button onClick={handleCreate} disabled={submitting}>
            {submitting ? t('apiKeys.creating') : t('apiKeys.createKey')}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
