'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, ShieldCheck, Settings2, Mail } from 'lucide-react';
import AdminGuard from '@/components/AdminGuard';
import api from '@/lib/axios';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogFooter, AlertDialogTitle, AlertDialogDescription,
  AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

interface User {
  id: number;
  email: string;
  role: string;
  createdAt: string;
}

const ROLE_COLORS: Record<string, string> = {
  admin:       'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  editor:      'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  contributor: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  viewer:      'bg-muted text-muted-foreground',
};

export default function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // New user form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('editor');
  const [creating, setCreating] = useState(false);

  // Per-user invite loading state
  const [inviting, setInviting] = useState<number | null>(null);

  // Change own password form
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [changingPw, setChangingPw] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/users')
      .then((r) => setUsers(r.data))
      .catch(() => toast.error('Failed to load users'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post('/users', { email, password, role });
      toast.success(`User ${email} created`);
      setEmail(''); setPassword(''); setRole('editor');
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const handleRoleChange = async (id: number, newRole: string) => {
    try {
      await api.put(`/users/${id}/role`, { role: newRole });
      toast.success('Role updated');
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update role');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/users/${id}`);
      toast.success('User deleted');
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete user');
    }
  };

  const handleSendInvite = async (id: number, email: string) => {
    setInviting(id);
    try {
      await api.post(`/users/${id}/invite`);
      toast.success(`Invitation sent to ${email}`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to send invitation');
    } finally {
      setInviting(null);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangingPw(true);
    try {
      await api.put('/users/me/password', { currentPassword: currentPw, newPassword: newPw });
      toast.success('Password updated');
      setCurrentPw(''); setNewPw('');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update password');
    } finally {
      setChangingPw(false);
    }
  };

  return (
    <AdminGuard>
    <div className="space-y-6 max-w-4xl">

      {/* ── User list ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
          <CardDescription>Manage who has access to the admin panel and what they can do.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
              )}
              {!loading && users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    {u.email}
                    {u.id === me?.id && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                  </TableCell>
                  <TableCell>
                    {u.id === me?.id ? (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[u.role] ?? ROLE_COLORS.viewer}`}>
                        {u.role}
                      </span>
                    ) : (
                      <Select value={u.role} onValueChange={(v: string | null) => v && handleRoleChange(u.id, v)}>
                        <SelectTrigger className="h-7 w-28 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="editor">Editor</SelectItem>
                          <SelectItem value="contributor">Contributor</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {u.id !== me?.id && (
                      <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Send invitation email"
                        disabled={inviting === u.id}
                        onClick={() => handleSendInvite(u.id, u.email)}
                      >
                        <Mail className="h-3.5 w-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger render={
                          <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" />
                        }>
                          <Trash2 className="h-3.5 w-3.5" />
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete {u.email}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently remove their access. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction variant="destructive" onClick={() => handleDelete(u.id)}>
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Role guide ────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Role Permissions</CardTitle>
            <a href="/users/permissions" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
              <Settings2 className="h-3.5 w-3.5" /> Manage permissions
            </a>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            {[
              { role: 'Admin',       perms: ['Full access to everything', 'Manage users & roles', 'Content types & API keys', 'Audit log & webhooks'] },
              { role: 'Editor',      perms: ['Create / edit / delete entries', 'Publish & archive entries', 'Forms, media upload/delete', 'Read content types'] },
              { role: 'Contributor', perms: ['Create & edit entries', 'Cannot delete entries', 'Cannot publish or archive', 'Media upload only'] },
              { role: 'Viewer',      perms: ['Read-only dashboard', 'View entries & forms', 'View media library', 'Cannot modify anything'] },
            ].map(({ role: r, perms }) => (
              <div key={r} className="space-y-2">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[r.toLowerCase()] ?? ROLE_COLORS.viewer}`}>
                  {r}
                </span>
                <ul className="space-y-1">
                  {perms.map((p) => (
                    <li key={p} className="text-xs text-muted-foreground">• {p}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Invite user ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Plus className="h-4 w-4" /> Add User</CardTitle>
          <CardDescription>Create a new account with a specific role.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div className="sm:col-span-2 space-y-1">
              <Label>Email</Label>
              <Input type="email" placeholder="editor@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>Password</Label>
              <Input type="password" placeholder="Min 8 chars" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v: string | null) => v && setRole(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="contributor">Contributor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-4 flex justify-end">
              <Button type="submit" disabled={creating}>
                <Plus className="h-4 w-4 mr-1.5" />
                {creating ? 'Creating…' : 'Create User'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ── Change own password ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Change Your Password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div className="space-y-1">
              <Label>Current Password</Label>
              <Input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>New Password</Label>
              <Input type="password" placeholder="Min 8 chars" value={newPw} onChange={(e) => setNewPw(e.target.value)} required minLength={8} />
            </div>
            <Button type="submit" disabled={changingPw}>
              {changingPw ? 'Updating…' : 'Update Password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
    </AdminGuard>
  );
}
