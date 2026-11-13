'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { KeyRound, LogOut, Monitor, Moon, Sun, UserRound } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useFormatter, useTranslations } from 'use-intl';
import api from '@/lib/axios';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogFooter, AlertDialogTitle, AlertDialogDescription,
  AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChangePasswordSheet } from '@/components/ChangePasswordSheet';
import { TwoFactorCard } from '@/components/TwoFactorCard';
import { AdminLanguageSwitcher } from '@/components/AdminLanguageSwitcher';
import { roleBadgeColor } from '@/lib/custom-roles';

interface Profile {
  id: number;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
  twoFactorEnabled: boolean;
}

const NAME_MAX = 100;

/** Your own account — open to every signed-in user, whatever their module access. */
export default function ProfilePage() {
  const tp = useTranslations('users');
  const tc = useTranslations('common');
  const format = useFormatter();
  const router = useRouter();
  const { user, updateUser, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [signingOutAll, setSigningOutAll] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    api.get<Profile>('/users/me')
      .then((r) => { setProfile(r.data); setName(r.data.name ?? ''); })
      .catch(() => toast.error(tp('profile.loadFailed')));
  }, [tp]);

  const dirty = !!profile && name.trim() !== (profile.name ?? '');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty) return;
    setSaving(true);
    try {
      const res = await api.put<Profile>('/users/me', { name: name.trim() });
      setProfile(res.data);
      setName(res.data.name ?? '');
      updateUser({ name: res.data.name });
      toast.success(tp('profile.saved'));
    } catch (err: any) {
      toast.error(err.response?.data?.message || tp('profile.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  // Every login token and refresh cookie of this account stops working, this browser's included.
  const handleSignOutAll = async () => {
    setSigningOutAll(true);
    try {
      await api.post('/auth/logout-all');
      toast.success(tp('toasts.signedOutAll'));
      logout();
      router.push('/login');
    } catch (err: any) {
      toast.error(err.response?.data?.message || tp('toasts.signOutAllFailed'));
      setSigningOutAll(false);
    }
  };

  const displayName = profile?.name || profile?.email.split('@')[0] || '';
  const initials = (profile?.name || profile?.email || '?')
    .split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
  // A custom role's name is data — shown as stored
  const roleText = user?.customRole ?? tc(`roles.${user?.role ?? 'viewer'}`);

  const themeOptions = {
    light: tp('profile.themeLight'),
    dark: tp('profile.themeDark'),
    system: tp('profile.themeSystem'),
  };
  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      {/* ── Who you are ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <div
          aria-hidden="true"
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/15 text-lg font-semibold text-primary"
        >
          {profile ? initials : <UserRound className="h-6 w-6" />}
        </div>
        <div className="min-w-0">
          {profile ? (
            <>
              {/* A person's name is data — shown as stored */}
              <h2 className="truncate text-xl font-semibold">{displayName}</h2>
              <p className="truncate text-sm text-muted-foreground">{profile.email}</p>
            </>
          ) : (
            <>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="mt-1.5 h-4 w-56" />
            </>
          )}
        </div>
      </div>

      {/* ── Basic info ────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{tp('profile.infoTitle')}</CardTitle>
          <CardDescription>{tp('profile.infoDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {!profile ? (
            <div className="space-y-4">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="profile-name">{tp('profile.name')}</Label>
                <Input
                  id="profile-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={tp('profile.namePlaceholder')}
                  maxLength={NAME_MAX}
                  autoComplete="name"
                  aria-describedby="profile-name-help"
                />
                <p id="profile-name-help" className="text-xs text-muted-foreground">{tp('profile.nameHelp')}</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="profile-email">{tp('profile.email')}</Label>
                <Input id="profile-email" value={profile.email} readOnly disabled aria-describedby="profile-email-help" />
                <p id="profile-email-help" className="text-xs text-muted-foreground">{tp('profile.emailHelp')}</p>
              </div>

              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <dt className="text-sm font-medium">{tp('profile.role')}</dt>
                  <dd>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${roleBadgeColor(user?.customRole ?? profile.role)}`}>
                      {roleText}
                    </span>
                  </dd>
                </div>
                <div className="space-y-1.5">
                  <dt className="text-sm font-medium">{tp('profile.joined')}</dt>
                  <dd className="text-sm text-muted-foreground">
                    {format.dateTime(new Date(profile.createdAt), { dateStyle: 'long' })}
                  </dd>
                </div>
              </dl>

              <div className="flex justify-end">
                <Button type="submit" disabled={!dirty || saving}>
                  {saving ? tc('saving') : tc('save')}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* ── Password ──────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-amber-500" />
              {tp('profile.passwordTitle')}
            </CardTitle>
            <CardDescription>{tp('profile.passwordDescription')}</CardDescription>
          </div>
          <Button variant="outline" size="sm" className="shrink-0" onClick={() => setPasswordOpen(true)}>
            {tp('password.open')}
          </Button>
        </CardHeader>
      </Card>

      {/* ── Two-step sign-in ──────────────────────────────────────────────── */}
      <TwoFactorCard />

      {/* ── Sessions ──────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <LogOut className="h-4 w-4 text-muted-foreground" />
              {tp('profile.sessionsTitle')}
            </CardTitle>
            <CardDescription>
              {tp('password.signOutAllTitle')} {tp('password.signOutAllHint')}
            </CardDescription>
          </div>
          <AlertDialog>
            <AlertDialogTrigger render={
              <Button variant="outline" size="sm" className="shrink-0 text-destructive hover:text-destructive" disabled={signingOutAll} />
            }>
              {signingOutAll ? tp('password.signingOutAll') : tp('password.signOutAll')}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{tp('profile.signOutAllConfirmTitle')}</AlertDialogTitle>
                <AlertDialogDescription>{tp('password.signOutAllHint')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={handleSignOutAll}>
                  {tp('password.signOutAll')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardHeader>
      </Card>

      {/* ── Preferences ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{tp('profile.preferencesTitle')}</CardTitle>
          <CardDescription>{tp('profile.preferencesDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{tp('profile.language')}</Label>
            <AdminLanguageSwitcher className="h-9 w-full text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label>{tp('profile.theme')}</Label>
            {mounted ? (
              <Select value={theme ?? 'system'} onValueChange={(v) => v && setTheme(v)} items={themeOptions}>
                <SelectTrigger className="w-full" aria-label={tp('profile.theme')}>
                  <ThemeIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(themeOptions) as Array<keyof typeof themeOptions>).map((key) => (
                    <SelectItem key={key} value={key}>{themeOptions[key]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Skeleton className="h-9 w-full" />
            )}
          </div>
        </CardContent>
      </Card>

      <ChangePasswordSheet open={passwordOpen} onOpenChange={setPasswordOpen} />
    </div>
  );
}
