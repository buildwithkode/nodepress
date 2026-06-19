'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Palette } from 'lucide-react';
import AdminGuard from '@/components/AdminGuard';
import api from '@/lib/axios';
import { useBrand } from '../../../context/BrandContext';
import { MediaPickerModal } from '@/components/MediaPickerModal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export default function BrandPage() {
  const { brand, setBrand, refresh } = useBrand();

  const [name, setName]   = useState(brand.brandName);
  const [logo, setLogo]   = useState<string>(brand.brandLogoUrl ?? '');
  const [color, setColor] = useState(brand.brandColor);
  const [saving, setSaving] = useState(false);

  const colorValid = HEX_RE.test(color);

  const save = async () => {
    if (!name.trim()) { toast.error('Brand name is required'); return; }
    if (!colorValid)  { toast.error('Enter a valid hex colour, e.g. #4f46e5'); return; }
    setSaving(true);
    try {
      const res = await api.put('/brand', {
        brandName: name.trim(),
        brandLogoUrl: logo,        // '' clears the logo server-side
        brandColor: color,
      });
      // Reflect immediately, then re-sync from the server.
      setBrand({
        brandName: res.data.brandName,
        brandLogoUrl: res.data.brandLogoUrl ?? null,
        brandColor: res.data.brandColor,
      });
      await refresh();
      toast.success('Brand updated');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update brand');
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    'w-full rounded-md bg-background border border-border px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring';

  return (
    <AdminGuard>
      <div className="max-w-3xl space-y-6">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Palette className="h-5 w-5" /> Brand
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Your name, logo, and accent colour — used across the admin panel, the browser tab/favicon,
            the login screen, and form-submission emails.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Identity</CardTitle>
            <CardDescription>Applies everywhere this install shows your brand.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Name */}
            <div className="space-y-1.5">
              <label htmlFor="brandName" className="block text-sm font-medium">Brand name</label>
              <input
                id="brandName"
                className={inputCls}
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
                placeholder="Acme Inc."
              />
            </div>

            {/* Logo */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium">Logo</label>
              <p className="text-xs text-muted-foreground">Square images work best. Shown in the sidebar, login page, favicon, and emails.</p>
              <MediaPickerModal
                value={logo ? { url: logo, alt: name } : null}
                onChange={(val) => setLogo(val?.url ?? '')}
              />
            </div>

            {/* Color */}
            <div className="space-y-1.5">
              <label htmlFor="brandColor" className="block text-sm font-medium">Accent colour</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  aria-label="Accent colour picker"
                  value={colorValid ? color : '#4f46e5'}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-9 w-12 rounded border border-border bg-background p-1 cursor-pointer"
                />
                <input
                  id="brandColor"
                  className={inputCls + ' max-w-[140px] font-mono'}
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="#4f46e5"
                />
                {!colorValid && <span className="text-xs text-red-400">Invalid hex</span>}
              </div>
            </div>

            <Button onClick={save} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Saving…</> : 'Save brand'}
            </Button>
          </CardContent>
        </Card>

        {/* Live preview */}
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>How the sidebar header will look.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 w-64 px-4 h-14 rounded-md border border-border bg-sidebar">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt={name} className="h-6 w-6 rounded object-contain shrink-0" />
              ) : (
                <span className="h-6 w-6 rounded shrink-0" style={{ backgroundColor: colorValid ? color : '#4f46e5' }} />
              )}
              <span className="font-semibold text-sm truncate">{name || 'NodePress'}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminGuard>
  );
}
