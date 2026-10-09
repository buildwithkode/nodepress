'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Search,
  CloudIcon,
  Eye,
  Copy,
  Check,
  ThumbsUp,
  Undo2,
  History,
  RotateCcw,
  Loader2,
  Braces,
  PanelRight,
  WrapText,
  ExternalLink,
  Rocket,
  Globe,
  Sparkles,
  Shield,
  Settings,
  Users,
  Lock,
  Unlock,
  AlertTriangle,
  Languages,
  CopyCheck,
  Plus,
  X,
  Clock,
} from 'lucide-react';
import { useAutosave } from '@/lib/useAutosave';
import { useEntryPresence } from '@/lib/useEntryPresence';
import api from '@/lib/axios';
import { highlightCode } from '@/lib/highlight';
import { useAuth } from '@/context/AuthContext';
import { canManageSettings } from '@/lib/roles';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn, ctLabel, formatSlugInput, cleanSlug } from '@/lib/utils';
import DynamicFormField from '../../DynamicFormField';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const SUPPORTED_LOCALES = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'es', label: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', label: 'French', flag: '🇫🇷' },
  { code: 'de', label: 'German', flag: '🇩🇪' },
  { code: 'zh', label: 'Chinese', flag: '🇨🇳' },
  { code: 'ja', label: 'Japanese', flag: '🇯🇵' },
  { code: 'pt', label: 'Portuguese', flag: '🇵🇹' },
  { code: 'ar', label: 'Arabic', flag: '🇸🇦' },
];

interface Field { name: string; type: string; options?: any; label?: string }
interface ContentType { id: number; name: string; displayName?: string | null; schema: Field[] }
interface TranslationItem {
  id: number;
  locale: string;
  status: string;
  updatedAt: string;
}
interface Entry {
  id: number;
  slug: string;
  status: string;
  locale?: string;
  contentTypeId: number;
  data: Record<string, any>;
  seo?: { title?: string; description?: string; image?: string; noIndex?: boolean } | null;
  publishAt?: string | null;
  translations?: TranslationItem[];
}

function toLocalDatetimeString(dateStr?: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EditEntryPage() {
  const router = useRouter();
  const params = useParams() ?? {};
  const id = (params.id ?? '') as string;
  const { user: me } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [entry, setEntry] = useState<Entry | null>(null);
  const [contentType, setContentType] = useState<ContentType | null>(null);
  const [status, setStatus] = useState<string>('published');
  const [locale, setLocale] = useState<string>('en');
  const [seoOpen, setSeoOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewCopied, setPreviewCopied] = useState(false);

  // Real-time Collaborative Presence & Soft-Locking
  const {
    activeUsers,
    lock,
    isLockedByOther,
    hasLock,
    takeoverLock,
  } = useEntryPresence(id ? parseInt(id, 10) : null, me?.id);

  // Multilingual translations and live reference state
  const [translations, setTranslations] = useState<TranslationItem[]>([]);
  const [creatingTranslation, setCreatingTranslation] = useState(false);
  const [sidePanel, setSidePanel] = useState<'none' | 'reference' | 'json'>('json');
  const [baseLocale, setBaseLocale] = useState('en');
  const [baseEntry, setBaseEntry] = useState<Entry | null>(null);
  const [loadingBase, setLoadingBase] = useState(false);

  // Split pane sizing & drag
  const [jsonCopied, setJsonCopied] = useState(false);
  const [jsonWrap, setJsonWrap] = useState(true);
  const [leftPct, setLeftPct] = useState(58);
  const containerRef = useRef<HTMLDivElement>(null);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setLeftPct(Math.min(Math.max(pct, 30), 75));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  // Version history
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState<any[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);

  // SEO fields
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [seoImage, setSeoImage] = useState('');
  const [seoNoIndex, setSeoNoIndex] = useState(false);
  const [publishAt, setPublishAt] = useState('');

  const { register, control, handleSubmit, reset, setValue, watch, getValues, formState: { errors } } = useForm<Record<string, any>>();

  // ── Autosave ──────────────────────────────────────────────────────────────
  const watchedValues = watch();
  const watchedSlug = watch('slug') || '';
  const previewSlug = cleanSlug(watchedSlug);

  const autosaveFn = useCallback(async () => {
    if (!entry) return;
    setAutosaveStatus('saving');
    try {
      const values = getValues();
      const { slug, ...rest } = values;
      const cleanFinalSlug = cleanSlug(slug || '');
      const seo = {
        title: seoTitle.trim() || undefined,
        description: seoDescription.trim() || undefined,
        image: seoImage.trim() || undefined,
        noIndex: seoNoIndex || undefined,
      };
      const hasSeo = Object.values(seo).some((v) => v !== undefined);
      await api.put(`/entries/${entry.id}`, {
        slug: cleanFinalSlug,
        status,
        data: rest,
        seo: hasSeo ? seo : null,
        publishAt: status === 'draft' && publishAt ? new Date(publishAt).toISOString() : null,
      });
      setAutosaveStatus('saved');
      setTimeout(() => setAutosaveStatus('idle'), 2000);
    } catch {
      setAutosaveStatus('idle');
    }
  }, [entry, getValues, status, seoTitle, seoDescription, seoImage, seoNoIndex, publishAt]);

  useAutosave(
    JSON.stringify({ watchedValues, status, seoTitle, seoDescription, seoImage, seoNoIndex, publishAt }),
    autosaveFn,
    3000,      // 3-second debounce
    !loading,  // only autosave after entry is fully loaded
  );

  useEffect(() => {
    api.get(`/entries/${id}`)
      .then(async (res) => {
        const e: Entry = res.data;
        setEntry(e);
        setStatus(e.status ?? 'published');
        const entryLocale = e.locale ?? 'en';
        setLocale(entryLocale);
        const transList: TranslationItem[] = e.translations ?? [];
        setTranslations(transList);
        // Default reference language to English if current is non-English, or first sibling if current is English
        const defaultRef = entryLocale === 'en'
          ? (transList.find((t) => t.locale !== 'en')?.locale || 'es')
          : 'en';
        setBaseLocale(defaultRef);
        setSeoTitle(e.seo?.title ?? '');
        setSeoDescription(e.seo?.description ?? '');
        setSeoImage(e.seo?.image ?? '');
        setSeoNoIndex(e.seo?.noIndex ?? false);
        setPublishAt(toLocalDatetimeString(e.publishAt));
        const ctRes = await api.get(`/content-types/${e.contentTypeId}`);
        setContentType(ctRes.data);
        reset({ slug: e.slug, ...e.data });
      })
      .catch(() => { toast.error('Failed to load entry'); router.push('/entries'); })
      .finally(() => setLoading(false));
  }, [id]);

  const onSubmit = async (values: Record<string, any>) => {
    if (!entry) return;
    setSubmitting(true);
    try {
      const { slug, ...rest } = values;
      const cleanFinalSlug = cleanSlug(slug || '');

      const seo = {
        title: seoTitle.trim() || undefined,
        description: seoDescription.trim() || undefined,
        image: seoImage.trim() || undefined,
        noIndex: seoNoIndex || undefined,
      };
      const hasSeo = Object.values(seo).some((v) => v !== undefined);

      await api.put(`/entries/${entry.id}`, {
        slug: cleanFinalSlug,
        status,
        data: rest,
        seo: hasSeo ? seo : null,
        publishAt: status === 'draft' && publishAt ? new Date(publishAt).toISOString() : null,
      });
      toast.success('Entry updated');
      router.push('/entries');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const canApprove = me?.role === 'admin' || me?.role === 'editor';

  const handleApprove = async () => {
    if (!entry) return;
    setSubmitting(true);
    try {
      await api.put(`/entries/${entry.id}`, { status: 'published' });
      setStatus('published');
      setEntry((e) => e ? { ...e, status: 'published' } : e);
      toast.success('Entry approved and published');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to approve entry');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReturnToDraft = async () => {
    if (!entry) return;
    setSubmitting(true);
    try {
      await api.put(`/entries/${entry.id}`, { status: 'draft' });
      setStatus('draft');
      setEntry((e) => e ? { ...e, status: 'draft' } : e);
      toast.success('Entry returned to draft');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to return entry to draft');
    } finally {
      setSubmitting(false);
    }
  };

  const loadVersions = async () => {
    if (!entry) return;
    setVersionsLoading(true);
    try {
      const res = await api.get(`/entries/${entry.id}/versions`);
      setVersions(res.data ?? []);
    } catch {
      toast.error('Failed to load version history');
    } finally {
      setVersionsLoading(false);
    }
  };

  const handleRestoreVersion = async (versionId: number) => {
    if (!entry) return;
    setRestoringVersion(versionId);
    try {
      const res = await api.post(`/entries/${entry.id}/versions/${versionId}/restore`);
      const restored = res.data;
      setEntry(restored);
      setStatus(restored.status ?? 'published');
      reset({ slug: restored.slug, ...restored.data });
      toast.success('Version restored');
      await loadVersions();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to restore version');
    } finally {
      setRestoringVersion(null);
    }
  };

  const handleAddTranslation = async (targetLocale: string) => {
    if (!entry) return;
    setCreatingTranslation(true);
    try {
      const res = await api.post(`/entries/${entry.id}/translate`, {
        targetLocale,
        copyData: true,
      });
      toast.success(`Created ${targetLocale.toUpperCase()} translation draft`);
      router.push(`/entries/${res.data.id}/edit`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create translation draft');
    } finally {
      setCreatingTranslation(false);
    }
  };

  const fetchBaseLocale = async (loc: string, currentEntry?: Entry | null) => {
    const active = currentEntry ?? entry;
    if (!active) return;
    setLoadingBase(true);
    try {
      const transList = active.translations || translations;
      const sibling = transList.find((t) => t.locale === loc && t.id !== active.id);
      if (sibling) {
        const res = await api.get(`/entries/${sibling.id}`);
        setBaseEntry(res.data);
      } else {
        const res = await api.get('/entries', {
          params: { contentTypeId: active.contentTypeId, slug: active.slug, locale: loc, limit: 1 },
        });
        const items = res.data.data ?? res.data;
        const found = Array.isArray(items) ? items[0] : null;
        setBaseEntry(found || null);
      }
    } catch {
      setBaseEntry(null);
    } finally {
      setLoadingBase(false);
    }
  };

  useEffect(() => {
    if (sidePanel === 'reference' && entry) {
      fetchBaseLocale(baseLocale, entry);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidePanel, baseLocale, entry?.id]);

  const copyFieldsFromBase = () => {
    if (!baseEntry?.data) return;
    const currentVals = getValues();
    const updated = { ...currentVals };
    let copiedCount = 0;
    for (const [k, v] of Object.entries(baseEntry.data)) {
      if (updated[k] === undefined || updated[k] === null || updated[k] === '') {
        updated[k] = v;
        copiedCount++;
      }
    }
    reset(updated);
    toast.success(`Copied ${copiedCount} field(s) from ${baseLocale.toUpperCase()} reference`);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32" />
        <Card><CardContent className="space-y-4 pt-4">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top breadcrumbs and active user presence */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => router.push(contentType ? `/entries?ct=${contentType.name}` : '/entries')}>
          <ArrowLeft className="h-4 w-4" /> Back to {contentType ? ctLabel(contentType) : 'Entries'}
        </Button>

        <div className="flex items-center gap-2">
          {/* Active Presence Avatars */}
          {activeUsers.length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-card text-xs">
              <span className="relative flex h-2 w-2 mr-0.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[11px] text-muted-foreground font-medium mr-1">
                {activeUsers.length} online
              </span>
              <div className="flex -space-x-1.5 overflow-hidden">
                {activeUsers.slice(0, 4).map((u) => (
                  <div
                    key={u.id || u.email}
                    title={`${u.email} (${u.role})`}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white ring-2 ring-background uppercase"
                  >
                    {u.email.charAt(0)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {contentType && canManageSettings(me?.role) && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-8 text-xs"
                onClick={() => router.push(`/content-types/${contentType.id}/edit`)}
                title="Edit Content Type Schema"
              >
                <Settings className="h-3.5 w-3.5 text-indigo-400" />
                Edit Schema
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-8 text-xs"
                onClick={() => router.push(`/users/permissions?tab=fields&ct=${contentType.name}`)}
                title="Configure Field-Level Permissions"
              >
                <Shield className="h-3.5 w-3.5 text-amber-400" />
                Field Permissions
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Real-time Conflict Soft-Lock Banner */}
      {isLockedByOther && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-amber-200">
          <div className="flex items-center gap-2.5 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
            <span>
              <strong>{lock?.email}</strong> is actively editing this entry. Simultaneous saves may conflict.
            </span>
          </div>
          {(me?.role === 'admin' || me?.role === 'editor') && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5 border-amber-500/50 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 shrink-0"
              onClick={takeoverLock}
            >
              <Lock className="h-3 w-3" />
              Take Over Lock
            </Button>
          )}
        </div>
      )}

      {/* Pending review approval banner — shown to admins and editors only */}
      {status === 'pending_review' && canApprove && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-950/40">
          <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
            <ThumbsUp className="h-4 w-4 shrink-0" />
            <span>This entry is awaiting review. Approve to publish it, or return to draft.</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" variant="outline" disabled={submitting} onClick={handleReturnToDraft}>
              <Undo2 className="h-3.5 w-3.5 mr-1.5" />
              Return to Draft
            </Button>
            <Button size="sm" disabled={submitting} onClick={handleApprove}>
              <ThumbsUp className="h-3.5 w-3.5 mr-1.5" />
              Approve & Publish
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Edit Entry{contentType ? ` — ${ctLabel(contentType)}` : ''}</CardTitle>
              <CardDescription>Editing the slug changes the entry's public URL. Change status to control visibility.</CardDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {autosaveStatus !== 'idle' && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground mr-1">
                  <CloudIcon className="h-3.5 w-3.5" />
                  {autosaveStatus === 'saving' ? 'Saving…' : 'Saved'}
                </span>
              )}

              {/* Editorial Multilingual Locale Switcher */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs font-medium border-border/80 bg-background/80"
                    disabled={creatingTranslation}
                  >
                    <Globe className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                    <span className="font-semibold">
                      {SUPPORTED_LOCALES.find((l) => l.code === locale)?.label || locale.toUpperCase()} ({locale.toUpperCase()})
                    </span>
                    <ChevronDown className="h-3 w-3 opacity-50 ml-0.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
                    Translations ({translations.length || 1})
                  </DropdownMenuLabel>
                  {(translations.length > 0 ? translations : [{ id: entry?.id ?? 0, locale, status, updatedAt: '' }]).map((t) => {
                    const isCurrent = (entry && t.id === entry.id) || t.locale === locale;
                    const loc = SUPPORTED_LOCALES.find((l) => l.code === t.locale);
                    return (
                      <DropdownMenuItem
                        key={t.id}
                        className={cn(
                          "flex items-center justify-between cursor-pointer text-xs py-1.5",
                          isCurrent && "bg-accent/60 font-medium"
                        )}
                        onClick={() => {
                          if (!isCurrent) router.push(`/entries/${t.id}/edit`);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{loc?.flag || '🌐'}</span>
                          <span>{loc?.label || t.locale.toUpperCase()}</span>
                          <span className="text-[10px] text-muted-foreground font-mono uppercase">({t.locale})</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[9px] px-1.5 py-0 capitalize",
                              t.status === 'published' && "border-emerald-500/40 text-emerald-500 bg-emerald-500/10",
                              t.status === 'draft' && "border-amber-500/40 text-amber-500 bg-amber-500/10",
                              t.status === 'pending_review' && "border-blue-500/40 text-blue-500 bg-blue-500/10",
                              t.status === 'staging' && "border-purple-500/40 text-purple-500 bg-purple-500/10",
                            )}
                          >
                            {t.status}
                          </Badge>
                          {isCurrent && <Check className="h-3.5 w-3.5 text-primary ml-0.5" />}
                        </div>
                      </DropdownMenuItem>
                    );
                  })}

                  {(() => {
                    const existingLocales = new Set((translations.length > 0 ? translations : [{ locale }]).map((t) => t.locale));
                    const untranslated = SUPPORTED_LOCALES.filter((l) => !existingLocales.has(l.code));
                    if (untranslated.length === 0) return null;
                    return (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
                          Add Translation
                        </DropdownMenuLabel>
                        {untranslated.map((loc) => (
                          <DropdownMenuItem
                            key={loc.code}
                            className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground hover:text-foreground py-1.5"
                            onClick={() => handleAddTranslation(loc.code)}
                          >
                            <Plus className="h-3.5 w-3.5 text-blue-400" />
                            <span className="text-sm">{loc.flag}</span>
                            <span>{loc.label}</span>
                            <span className="text-[10px] font-mono text-muted-foreground ml-auto uppercase">{loc.code}</span>
                          </DropdownMenuItem>
                        ))}
                      </>
                    );
                  })()}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Status Selector */}
              <Select value={status} onValueChange={(v) => { if (v) setStatus(v); }}>
                <SelectTrigger className="h-8 w-36 text-xs font-medium border-border/80 bg-background/80">
                  <div className="flex items-center gap-2 truncate">
                    <span
                      className={cn(
                        'h-2 w-2 rounded-full shrink-0',
                        status === 'published' && 'bg-emerald-500 ring-2 ring-emerald-500/20',
                        status === 'staging' && 'bg-purple-500 ring-2 ring-purple-500/20',
                        status === 'pending_review' && 'bg-blue-500 ring-2 ring-blue-500/20',
                        status === 'draft' && 'bg-amber-500 ring-2 ring-amber-500/20',
                        status === 'archived' && 'bg-zinc-500 ring-2 ring-zinc-500/20',
                      )}
                    />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="draft">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                      <span>Draft</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="pending_review">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-blue-500" />
                      <span>In Review</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="staging">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-purple-500" />
                      <span>Staging</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="published">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      <span>Published</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="archived">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-zinc-500" />
                      <span>Archived</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>

              {/* Top Quick Save / Update Button */}
              <Button type="submit" form="entry-form" size="sm" className="h-8 text-xs font-medium gap-1.5" disabled={submitting}>
                {submitting ? 'Saving…' : status === 'published' ? 'Update' : 'Save'}
              </Button>

              {/* Segmented Side Panel Toggle: JSON vs Reference */}
              <div className="inline-flex items-center rounded-md border border-border/80 p-0.5 bg-muted/40 shadow-xs">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-7 px-2.5 text-xs gap-1.5 transition-all font-medium",
                    sidePanel === 'json'
                      ? "bg-background text-foreground shadow-xs border border-border/60"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setSidePanel((p) => (p === 'json' ? 'none' : 'json'))}
                  title="Live JSON Output"
                >
                  <Braces className="h-3.5 w-3.5" />
                  JSON
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-7 px-2.5 text-xs gap-1.5 transition-all font-medium",
                    sidePanel === 'reference'
                      ? "bg-background text-blue-500 shadow-xs border border-border/60"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setSidePanel((p) => (p === 'reference' ? 'none' : 'reference'))}
                  title="Side-by-side Multilingual Translation Reference"
                >
                  <Languages className="h-3.5 w-3.5" />
                  Reference
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>

        <div ref={containerRef} className="flex items-start border-t border-border">
          {/* Left pane: form */}
          <div style={{ width: sidePanel !== 'none' ? `${leftPct}%` : '100%' }} className="min-w-0 px-6 py-4">
          <form id="entry-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">

            {/* Slug (editable — changing it breaks existing links/SEO) */}
            <div className="space-y-1.5 mb-4.5">
              <Label htmlFor="slug" className="text-xs font-semibold text-foreground/90 block">Slug</Label>
              {(() => {
                const slugReg = register('slug', {
                  validate: (v) => {
                    const cleaned = cleanSlug(v || '');
                    if (!cleaned) return 'Slug is required';
                    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cleaned)) {
                      return 'Lowercase letters, numbers and hyphens only';
                    }
                    return true;
                  },
                });
                return (
                  <Input
                    id="slug"
                    {...slugReg}
                    onChange={(e) => {
                      const target = e.target;
                      const start = target.selectionStart;
                      const end = target.selectionEnd;
                      const oldVal = target.value;
                      const formatted = formatSlugInput(oldVal);
                      target.value = formatted;
                      if (start !== null && end !== null && formatted.length === oldVal.length) {
                        target.setSelectionRange(start, end);
                      }
                      slugReg.onChange(e);
                    }}
                    onBlur={(e) => {
                      const cleaned = cleanSlug(e.target.value);
                      if (e.target.value !== cleaned) {
                        e.target.value = cleaned;
                        setValue('slug', cleaned, { shouldValidate: true });
                      }
                      slugReg.onBlur(e);
                    }}
                    className={cn(errors.slug && 'border-destructive focus-visible:ring-destructive')}
                  />
                );
              })()}
              <div className="flex items-center gap-2 text-xs bg-muted/30 px-3 py-1.5 rounded-md border border-border/50 font-mono mt-1.5 text-muted-foreground">
                <span className="text-[11px] font-sans font-medium text-muted-foreground/70 select-none shrink-0">
                  Preview URL:
                </span>
                <span className="truncate text-foreground font-medium">
                  /api/<span className="text-muted-foreground">{contentType ? contentType.name : 'content-type'}</span>/<span className="text-primary font-semibold">{previewSlug || '…'}</span>
                </span>
              </div>
              {errors.slug ? (
                <p className="mt-1 text-xs text-destructive">{errors.slug.message as string}</p>
              ) : (
                <p className="text-[11px] text-amber-500">Changing the slug breaks existing links and SEO pointing to the old URL.</p>
              )}
            </div>

            {/* Scheduled publish */}
            {status === 'draft' && (
              <div className="mb-4 p-3.5 rounded-xl border border-border/80 bg-muted/20 backdrop-blur-xs">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-primary" />
                    Scheduled Publish
                  </Label>
                  {publishAt && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 font-medium">
                      Active schedule
                    </span>
                  )}
                </div>
                <DateTimePicker
                  value={publishAt}
                  onChange={setPublishAt}
                  placeholder="Pick date & time to auto-publish…"
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  {publishAt ? (
                    <span className="text-foreground/90 font-medium">
                      Will automatically publish on{' '}
                      <span className="text-primary font-semibold">
                        {new Date(publishAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}{' '}
                        at{' '}
                        {new Date(publishAt).toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </span>
                  ) : (
                    'Set a date and time to automatically publish this draft. Leave empty to publish manually.'
                  )}
                </p>
              </div>
            )}

            {contentType && contentType.schema.length > 0 && (
              <div className="pt-6">
                <div className="flex items-center justify-between pb-2 mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold text-foreground">Fields</span>
                    {contentType.displayName && (
                      <span className="text-xs text-muted-foreground font-normal">
                        ({contentType.displayName})
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {contentType.schema.length} field{contentType.schema.length === 1 ? '' : 's'}
                  </span>
                </div>
                <Separator className="mt-1 mb-5 bg-border/70" />

                <div>
                  {contentType.schema.map((field) => (
                    <DynamicFormField key={field.name} field={field} control={control} register={register} errors={errors} watch={watch} />
                  ))}
                </div>
              </div>
            )}

            {/* SEO Panel */}
            <div className="mt-6">
              <div className="pt-3 pb-2 mb-1">
                <span className="text-base font-semibold text-foreground">SEO</span>
                <Separator className="mt-2 bg-foreground/15" />
              </div>
              <button
                type="button"
                onClick={() => setSeoOpen((v) => !v)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-left px-1 py-1.5"
              >
                <Search className="h-3.5 w-3.5" />
                <span>SEO &amp; Open Graph</span>
                {(seoTitle || seoDescription || seoImage || seoNoIndex) && (
                  <span className="ml-auto text-[10px] bg-blue-500/15 text-blue-400 rounded px-1.5 py-0.5">customized</span>
                )}
                {seoOpen
                  ? <ChevronDown className="h-3.5 w-3.5 ml-auto" />
                  : <ChevronRight className="h-3.5 w-3.5 ml-auto" />
                }
              </button>

              {seoOpen && (
                <div className="rounded-md border border-border bg-muted/20 p-4 space-y-3 mt-1">
                  <div className="space-y-1.5">
                    <Label htmlFor="seo-title" className="text-xs">SEO Title</Label>
                    <Input
                      id="seo-title"
                      placeholder="Overrides the page title in search results"
                      value={seoTitle}
                      onChange={(e) => setSeoTitle(e.target.value)}
                      maxLength={70}
                    />
                    <p className="text-[10px] text-muted-foreground">{seoTitle.length}/70 characters</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="seo-desc" className="text-xs">Meta Description</Label>
                    <textarea
                      id="seo-desc"
                      placeholder="Short description shown in search results (120–160 chars recommended)"
                      value={seoDescription}
                      onChange={(e) => setSeoDescription(e.target.value)}
                      maxLength={160}
                      rows={2}
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                    />
                    <p className="text-[10px] text-muted-foreground">{seoDescription.length}/160 characters</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="seo-image" className="text-xs">OG Image URL</Label>
                    <Input
                      id="seo-image"
                      placeholder="https://example.com/og-image.jpg (1200×630 recommended)"
                      value={seoImage}
                      onChange={(e) => setSeoImage(e.target.value)}
                    />
                  </div>

                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={seoNoIndex}
                      onChange={(e) => setSeoNoIndex(e.target.checked)}
                      className="h-4 w-4 rounded border border-input"
                    />
                    <span className="text-xs text-foreground">Exclude from search engines (noindex)</span>
                  </label>
                </div>
              )}
            </div>
          </form>
          </div>

          {/* Drag handle */}
          {sidePanel !== 'none' && (
            <div
              onMouseDown={onDragStart}
              className="relative w-px self-stretch shrink-0 cursor-col-resize group select-none bg-border hover:bg-primary/40 transition-colors"
            >
              <div className="absolute inset-y-0 -left-2 -right-2" />
            </div>
          )}

          {/* Right pane: Translation Workspace or JSON Preview */}
          {sidePanel !== 'none' && (() => {
            if (sidePanel === 'reference') {
              return (
                <div style={{ width: `${100 - leftPct}%` }} className="min-w-0 border-l border-border bg-muted/10">
                  <div className="sticky top-4 px-4 py-4 space-y-3">
                    <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
                      <div className="flex items-center gap-1.5">
                        <Languages className="h-4 w-4 text-blue-400" />
                        <span className="text-xs font-semibold">Reference Language</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Select
                          value={baseLocale}
                          onValueChange={(val) => {
                            if (val) {
                              setBaseLocale(val);
                              fetchBaseLocale(val);
                            }
                          }}
                        >
                          <SelectTrigger className="h-7 w-32 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent align="end">
                            {SUPPORTED_LOCALES.map((l) => {
                              const exists = translations.some((t) => t.locale === l.code);
                              return (
                                <SelectItem key={l.code} value={l.code}>
                                  <div className="flex items-center gap-1.5">
                                    <span>{l.flag}</span>
                                    <span>{l.code.toUpperCase()}</span>
                                    {exists && (
                                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 ml-1 shrink-0" title="Translation available" />
                                    )}
                                  </div>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => setSidePanel('none')}
                          title="Close Reference Panel"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full h-7 text-xs gap-1.5 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                      onClick={copyFieldsFromBase}
                      disabled={loadingBase || !baseEntry}
                    >
                      <CopyCheck className="h-3.5 w-3.5" />
                      Copy Empty Fields from {baseLocale.toUpperCase()}
                    </Button>

                    {loadingBase ? (
                      <div className="py-8 flex items-center justify-center text-muted-foreground text-xs gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                        Loading {baseLocale.toUpperCase()} reference...
                      </div>
                    ) : !baseEntry ? (
                      <div className="py-8 text-center text-xs text-muted-foreground px-4 space-y-2 border border-dashed rounded-md">
                        <p>No <strong>{baseLocale.toUpperCase()}</strong> translation exists to reference.</p>
                        <p className="text-[11px] opacity-75">
                          Choose a language with an active translation (marked with a green dot) or add one via the 🌐 menu above.
                        </p>
                      </div>
                    ) : !contentType?.schema ? (
                      <p className="text-xs text-muted-foreground">No schema fields</p>
                    ) : (
                      <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
                        <div className="rounded-md border border-border bg-card p-2.5">
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                            <span className="font-semibold uppercase">Slug</span>
                            <span className="font-mono text-[10px]">core</span>
                          </div>
                          <p className="text-xs font-mono bg-muted/40 p-1.5 rounded text-foreground break-all">
                            {baseEntry?.slug || '—'}
                          </p>
                        </div>

                        {contentType.schema.map((field) => {
                          const val = baseEntry?.data?.[field.name];
                          const displayVal = typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val ?? '—');
                          return (
                            <div key={field.name} className="rounded-md border border-border bg-card p-2.5">
                              <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                                <span className="font-semibold">{field.label || field.name}</span>
                                <Badge variant="outline" className="text-[9px] font-mono px-1 py-0 uppercase">
                                  {field.type}
                                </Badge>
                              </div>
                              <div className="text-xs text-foreground bg-muted/40 p-2 rounded max-h-36 overflow-y-auto whitespace-pre-wrap leading-relaxed font-sans">
                                {displayVal}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            const { slug, ...fieldData } = watchedValues;
            const seo = {
              title: seoTitle.trim() || undefined,
              description: seoDescription.trim() || undefined,
              image: seoImage.trim() || undefined,
              noIndex: seoNoIndex || undefined,
            };
            const hasSeo = Object.values(seo).some((v) => v !== undefined);
            const liveJson = {
              id: entry?.id,
              slug: slug ?? entry?.slug,
              status,
              locale,
              contentTypeId: entry?.contentTypeId,
              data: fieldData,
              seo: hasSeo ? seo : null,
              publishAt: status === 'draft' && publishAt ? new Date(publishAt).toISOString() : null,
            };
            const jsonStr = JSON.stringify(liveJson, null, 2);
            return (
              <div style={{ width: `${100 - leftPct}%` }} className="min-w-0 border-l border-border">
                <div className="sticky top-4 px-4 py-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Braces className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium">JSON Preview</span>
                      <span className="text-[10px] bg-emerald-500/15 text-emerald-500 rounded px-1.5 py-0.5">live</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setJsonWrap((w) => !w)}
                        className={`flex items-center gap-1 text-[11px] transition-colors ${jsonWrap ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                        title={jsonWrap ? 'Disable line wrap' : 'Wrap long lines'}
                      >
                        <WrapText className="h-3.5 w-3.5" />
                        Wrap
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(jsonStr);
                          setJsonCopied(true);
                          setTimeout(() => setJsonCopied(false), 2000);
                        }}
                        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                        title="Copy raw JSON"
                      >
                        {jsonCopied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        {jsonCopied ? 'Copied' : 'Copy'}
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground ml-1"
                        onClick={() => setSidePanel('none')}
                        title="Close JSON Panel"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <pre className={`overflow-auto max-h-[75vh] p-3 rounded-md border border-border bg-muted/20 text-[11px] leading-relaxed text-foreground font-mono ${jsonWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'}`}><code dangerouslySetInnerHTML={{ __html: highlightCode(jsonStr, 'json') }} /></pre>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Version History Panel */}
        <div className="border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={() => {
              const next = !versionsOpen;
              setVersionsOpen(next);
              if (next && versions.length === 0) loadVersions();
            }}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-left"
          >
            <History className="h-3.5 w-3.5" />
            <span>Version History</span>
            {versionsOpen
              ? <ChevronDown className="h-3.5 w-3.5 ml-auto" />
              : <ChevronRight className="h-3.5 w-3.5 ml-auto" />
            }
          </button>

          {versionsOpen && (
            <div className="mt-3 space-y-1">
              {versionsLoading && (
                <p className="text-xs text-muted-foreground py-2">Loading…</p>
              )}
              {!versionsLoading && versions.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">No versions yet — versions are created on each save.</p>
              )}
              {versions.map((v: any) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between gap-3 rounded-md px-3 py-2 text-xs hover:bg-muted/50 transition-colors"
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="font-medium text-foreground">
                      {new Date(v.createdAt).toLocaleString()}
                    </span>
                    {v.createdBy && (
                      <span className="text-muted-foreground truncate">by {v.createdBy.email}</span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-xs shrink-0"
                    disabled={restoringVersion === v.id}
                    onClick={() => handleRestoreVersion(v.id)}
                  >
                    {restoringVersion === v.id
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <RotateCcw className="h-3 w-3" />
                    }
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <CardFooter className="justify-between gap-2 flex-wrap">
          {/* Preview URL panel */}
          {previewUrl && (
            <div className="flex items-center gap-2 flex-1 min-w-0 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
              <span className="text-muted-foreground shrink-0 font-medium">Draft View:</span>
              <span className="truncate font-mono text-foreground flex-1 min-w-0">{previewUrl}</span>
              <button
                type="button"
                onClick={() => {
                  window.open(previewUrl, '_blank');
                }}
                className="shrink-0 text-primary hover:underline flex items-center gap-1 font-medium px-1.5 py-0.5 rounded hover:bg-primary/10 transition-colors"
                title="Open in new tab"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>Open</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(window.location.origin + previewUrl);
                  setPreviewCopied(true);
                  setTimeout(() => setPreviewCopied(false), 2000);
                }}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors p-1"
                title="Copy Preview URL"
              >
                {previewCopied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={!entry}
              onClick={async () => {
                if (!entry || !contentType) return;
                try {
                  const res = await api.post(`/entries/${entry.id}/preview-url`);
                  const draftUrl = `/api/draft?secret=${encodeURIComponent(res.data.token)}&slug=${encodeURIComponent(entry.slug)}&type=${encodeURIComponent(contentType.name)}`;
                  setPreviewUrl(draftUrl);
                  window.open(draftUrl, '_blank');
                  toast.success('Live preview mode launched in new tab');
                } catch {
                  toast.error('Failed to generate preview URL');
                }
              }}
            >
              <Eye className="h-3.5 w-3.5" />
              Live Preview
            </Button>
            <Button variant="outline" onClick={() => router.push('/entries')}>Cancel</Button>
            <Button type="submit" form="entry-form" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
