'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, Save, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogFooter, AlertDialogTitle, AlertDialogDescription,
  AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Setting {
  id: number;
  key: string;
  value: string;
  label: string;
  type: string;
  group: string;
  sort: number;
}

type SettingType = 'text' | 'textarea' | 'url' | 'number' | 'boolean';

const TYPES: { value: SettingType; label: string }[] = [
  { value: 'text',     label: 'Text' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'url',      label: 'URL' },
  { value: 'number',   label: 'Number' },
  { value: 'boolean',  label: 'Boolean' },
];

const DEFAULT_GROUPS = ['General', 'SEO', 'Social', 'Contact', 'Appearance'];

// ── Value Input ────────────────────────────────────────────────────────────────

function ValueInput({
  type, value, onChange,
}: { type: string; value: string; onChange: (v: string) => void }) {
  if (type === 'boolean') {
    return (
      <Switch
        checked={value === 'true'}
        onCheckedChange={(c) => onChange(c ? 'true' : 'false')}
        className="data-checked:bg-emerald-500"
      />
    );
  }
  if (type === 'textarea') {
    return (
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="text-sm resize-none"
      />
    );
  }
  return (
    <Input
      type={type === 'number' ? 'number' : type === 'url' ? 'url' : 'text'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-sm"
    />
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [settings,   setSettings]   = useState<Setting[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [dirty,      setDirty]      = useState(false);
  const [showAdd,    setShowAdd]    = useState(false);

  // New setting form state
  const [newKey,   setNewKey]   = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newType,  setNewType]  = useState<SettingType>('text');
  const [newGroup, setNewGroup] = useState('General');

  useEffect(() => {
    api.get('/settings')
      .then((r) => setSettings(r.data))
      .catch(() => toast.error('Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  const updateValue = (key: string, value: string) => {
    setSettings((prev) => prev.map((s) => s.key === key ? { ...s, value } : s));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = await api.put('/settings', { settings });
      setSettings(data.data);
      setDirty(false);
      toast.success('Settings saved');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    const key = newKey.trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (!key) { toast.error('Key is required'); return; }
    if (settings.some((s) => s.key === key)) { toast.error(`Key "${key}" already exists`); return; }

    const item = { key, label: newLabel.trim() || key, value: newValue, type: newType, group: newGroup, sort: 0 };
    try {
      const data = await api.put('/settings', { settings: [item] });
      setSettings(data.data);
      setNewKey(''); setNewLabel(''); setNewValue(''); setNewType('text'); setNewGroup('General');
      setShowAdd(false);
      toast.success('Setting added');
    } catch {
      toast.error('Failed to add setting');
    }
  };

  const handleDelete = async (key: string) => {
    try {
      await api.delete(`/settings/${key}`);
      setSettings((prev) => prev.filter((s) => s.key !== key));
      toast.success('Setting deleted');
    } catch {
      toast.error('Failed to delete setting');
    }
  };

  // Group settings
  const groups = Array.from(new Set(settings.map((s) => s.group))).sort();

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Settings2 className="h-5 w-5" /> Site Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Global key-value config for your site. Fetch publicly via{' '}
            <code className="bg-muted px-1 rounded font-mono text-xs">GET /api/settings/public</code>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowAdd((v) => !v)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Setting
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Add setting form */}
      {showAdd && (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">New Setting</CardTitle>
            <CardDescription className="text-xs">Key is normalised to snake_case automatically.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Key <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="e.g. site_name"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Label</Label>
                <Input
                  placeholder="e.g. Site Name"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Select value={newType} onValueChange={(v) => setNewType(v as SettingType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Group</Label>
                <Select value={newGroup} onValueChange={setNewGroup}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from(new Set([...DEFAULT_GROUPS, ...groups])).map((g) => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Default Value</Label>
                <Input value={newValue} onChange={(e) => setNewValue(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button size="sm" onClick={handleAdd}>Add</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      )}

      {/* Empty state */}
      {!loading && settings.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Settings2 className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">No settings yet</p>
            <p className="text-xs mt-1">Click "Add Setting" to create your first key-value pair.</p>
          </CardContent>
        </Card>
      )}

      {/* Settings by group */}
      {!loading && groups.map((group) => (
        <Card key={group}>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">
              {group}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4 space-y-1">
            {settings
              .filter((s) => s.group === group)
              .map((setting) => (
                <div
                  key={setting.key}
                  className="flex items-center gap-4 py-2.5 border-b last:border-0"
                >
                  {/* Label + key */}
                  <div className="w-48 shrink-0">
                    <p className="text-sm font-medium leading-tight">{setting.label || setting.key}</p>
                    <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{setting.key}</p>
                  </div>

                  {/* Type badge */}
                  <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0 w-16 text-center">
                    {setting.type}
                  </span>

                  {/* Value input */}
                  <div className="flex-1">
                    <ValueInput
                      type={setting.type}
                      value={setting.value}
                      onChange={(v) => updateValue(setting.key, v)}
                    />
                  </div>

                  {/* Delete */}
                  <AlertDialog>
                    <AlertDialogTrigger render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                      />
                    }>
                      <Trash2 className="h-3.5 w-3.5" />
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete "{setting.key}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently remove this setting. Any frontend code reading it will get undefined.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={() => handleDelete(setting.key)}>
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
          </CardContent>
        </Card>
      ))}

      {/* Public API hint */}
      {!loading && settings.length > 0 && (
        <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm">
          <p className="font-medium mb-1">Using settings in your frontend</p>
          <p className="text-xs text-muted-foreground mb-2">
            Fetch all settings as a flat JSON object — no authentication required:
          </p>
          <code className="text-xs bg-muted px-3 py-2 rounded block font-mono">
            GET /api/settings/public → {'{ "site_name": "My Site", "contact_email": "..." }'}
          </code>
        </div>
      )}
    </div>
  );
}
