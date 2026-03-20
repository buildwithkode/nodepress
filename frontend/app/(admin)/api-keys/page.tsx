'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, Copy, Key, CheckCircle2, X } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/axios';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ApiKey {
  id: number;
  name: string;
  key: string;
  permissions: { access: 'read' | 'write' | 'all'; contentTypes: string[] };
  createdAt: string;
  lastUsedAt: string | null;
}

interface ContentType {
  id: number;
  name: string;
}

const ACCESS_BADGE: Record<string, 'blue' | 'orange' | 'green'> = {
  read:  'blue',
  write: 'orange',
  all:   'green',
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function ApiKeysPage() {
  const [keys, setKeys]               = useState<ApiKey[]>([]);
  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [loading, setLoading]         = useState(false);
  const [modalOpen, setModalOpen]     = useState(false);
  const [newKey, setNewKey]           = useState<string | null>(null);

  // form state
  const [formName, setFormName]           = useState('');
  const [formAccess, setFormAccess]       = useState<'read' | 'write' | 'all'>('read');
  const [formCTs, setFormCTs]             = useState<string[]>(['*']);
  const [formNameError, setFormNameError] = useState('');

  // ---- data ----
  const load = async () => {
    setLoading(true);
    try {
      const [keysRes, ctRes] = await Promise.all([
        api.get('/api-keys'),
        api.get('/content-types'),
      ]);
      setKeys(keysRes.data);
      setContentTypes(ctRes.data);
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ---- helpers ----
  const resetForm = () => {
    setFormName('');
    setFormAccess('read');
    setFormCTs(['*']);
    setFormNameError('');
  };

  const openModal = () => { resetForm(); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); resetForm(); };

  const toggleCT = (val: string) => {
    if (val === '*') {
      setFormCTs(['*']);
      return;
    }
    setFormCTs((prev) => {
      const withoutStar = prev.filter((v) => v !== '*');
      if (withoutStar.includes(val)) {
        const next = withoutStar.filter((v) => v !== val);
        return next.length === 0 ? ['*'] : next;
      }
      return [...withoutStar, val];
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  // ---- create ----
  const handleCreate = async () => {
    if (!formName.trim()) { setFormNameError('Name is required'); return; }
    setFormNameError('');

    const payload = {
      name: formName.trim(),
      permissions: {
        access: formAccess,
        contentTypes: formCTs.includes('*') ? ['*'] : formCTs,
      },
    };

    try {
      const res = await api.post('/api-keys', payload);
      setNewKey(res.data.key);
      closeModal();
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create key');
    }
  };

  // ---- revoke ----
  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/api-keys/${id}`);
      toast.success('API key revoked');
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to revoke key');
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <TooltipProvider>
      <div className="p-6">
        {/* Page header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-foreground">API Keys</h1>
          <Button onClick={openModal}>
            <Plus className="h-4 w-4 mr-2" />
            New API Key
          </Button>
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground mb-5">
          API keys let external applications access your content without a user login.{' '}
          Use{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">
            X-API-Key: &lt;key&gt;
          </code>{' '}
          in the request header. Read-only keys can only call GET endpoints; write/all keys can
          also POST, PUT, DELETE.
        </p>

        {/* Newly created key banner */}
        {newKey && (
          <div className="mb-5 rounded-lg border border-green-300 bg-green-50 p-4 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-green-800 mb-1">
                API Key Created — Copy it now!
              </p>
              <p className="text-xs text-green-700 mb-2">
                This key will not be shown again. Store it somewhere safe.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-green-100 border border-green-200 px-3 py-1.5 text-xs font-mono text-green-900 break-all">
                  {newKey}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 border-green-400 text-green-700 hover:bg-green-100"
                  onClick={() => copyToClipboard(newKey)}
                >
                  <Copy className="h-3.5 w-3.5 mr-1" />
                  Copy
                </Button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setNewKey(null)}
              className="shrink-0 text-green-600 hover:text-green-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Table */}
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Key</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground w-24">Access</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Content Types</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground w-36">Last Used</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground w-28">Created</th>
                <th className="px-4 py-3 w-12" />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && keys.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No API keys yet. Click "New API Key" to create one.
                  </td>
                </tr>
              )}
              {keys.map((k) => (
                <tr key={k.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  {/* Name */}
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2 font-medium">
                      <Key className="h-4 w-4 text-blue-500 shrink-0" />
                      {k.name}
                    </span>
                  </td>

                  {/* Key (masked) */}
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                        {k.key.slice(0, 14)}…{k.key.slice(-6)}
                      </code>
                      <Tooltip>
                        <TooltipTrigger render={<Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => copyToClipboard(k.key)} />}>
                          <Copy className="h-3 w-3" />
                        </TooltipTrigger>
                        <TooltipContent>Copy full key</TooltipContent>
                      </Tooltip>
                    </span>
                  </td>

                  {/* Access */}
                  <td className="px-4 py-3">
                    <Badge variant={ACCESS_BADGE[k.permissions.access]}>
                      {k.permissions.access.toUpperCase()}
                    </Badge>
                  </td>

                  {/* Content types */}
                  <td className="px-4 py-3">
                    {k.permissions.contentTypes[0] === '*' ? (
                      <Badge variant="purple">ALL</Badge>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {k.permissions.contentTypes.map((ct) => (
                          <Badge key={ct} variant="secondary">{ct}</Badge>
                        ))}
                      </div>
                    )}
                  </td>

                  {/* Last used */}
                  <td className="px-4 py-3 text-muted-foreground">
                    {k.lastUsedAt
                      ? new Date(k.lastUsedAt).toLocaleString()
                      : <span className="italic">Never</span>}
                  </td>

                  {/* Created */}
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(k.createdAt).toLocaleDateString()}
                  </td>

                  {/* Revoke */}
                  <td className="px-4 py-3">
                    <AlertDialog>
                      <AlertDialogTrigger render={<Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10" title="Revoke" />}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Revoke API key?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Any application using <strong>{k.name}</strong> will immediately lose
                            access. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => handleDelete(k.id)}
                          >
                            Revoke
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Create dialog */}
        <Dialog open={modalOpen} onOpenChange={(open) => { if (!open) closeModal(); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create New API Key</DialogTitle>
            </DialogHeader>

            <div className="space-y-5 py-1">
              {/* Key Name */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Key Name <span className="text-destructive">*</span>
                </label>
                <Input
                  placeholder='My App'
                  value={formName}
                  onChange={(e) => { setFormName(e.target.value); setFormNameError(''); }}
                />
                {formNameError && <p className="text-xs text-destructive">{formNameError}</p>}
                <p className="text-xs text-muted-foreground">
                  A label to identify this key, e.g. "Mobile App" or "Next.js Frontend"
                </p>
              </div>

              {/* Access Level */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Access Level</label>
                <select
                  value={formAccess}
                  onChange={(e) => setFormAccess(e.target.value as 'read' | 'write' | 'all')}
                  className={cn(
                    'w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm',
                    'focus:outline-none focus:ring-1 focus:ring-ring',
                  )}
                >
                  <option value="read">Read — GET only</option>
                  <option value="write">Write — POST / PUT / DELETE</option>
                  <option value="all">All — full access</option>
                </select>
              </div>

              {/* Allowed Content Types */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Allowed Content Types</label>
                <ScrollArea className="h-40 rounded-md border border-input bg-background p-2">
                  <div className="space-y-1">
                    {/* All (*) option */}
                    <label className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted/50 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={formCTs.includes('*')}
                        onChange={() => toggleCT('*')}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm font-medium">All content types (*)</span>
                    </label>
                    {/* Individual content types */}
                    {contentTypes.map((ct) => (
                      <label
                        key={ct.id}
                        className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted/50 cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={formCTs.includes(ct.name)}
                          onChange={() => toggleCT(ct.name)}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm">{ct.name}</span>
                      </label>
                    ))}
                    {contentTypes.length === 0 && (
                      <p className="text-xs text-muted-foreground px-1 py-1">
                        No content types defined yet.
                      </p>
                    )}
                  </div>
                </ScrollArea>
                <p className="text-xs text-muted-foreground">
                  Select specific content types or choose "All" to allow access to everything.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={closeModal}>Cancel</Button>
              <Button onClick={handleCreate}>Create Key</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
