'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Loader2, Palette } from 'lucide-react';
import AdminGuard from '@/components/AdminGuard';
import api from '@/lib/axios';
import { useBrand } from '../../../context/BrandContext';
import { MediaPickerModal } from '@/components/MediaPickerModal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogFooter, AlertDialogTitle, AlertDialogDescription,
  AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export default function BrandPage() {
  const { brand, setBrand, refresh } = useBrand();

  const [name, setName]   = useState(brand.brandName);
  const [logo, setLogo]   = useState<string>(brand.brandLogoUrl ?? '');
  const [color, setColor] = useState(brand.brandColor);
  // Theme overrides — '' means "use the built-in default".
  const [buttonColor, setButtonColor] = useState<string>(brand.buttonColor ?? '');
  const [inputColor, setInputColor]   = useState<string>(brand.inputColor ?? '');
  const [saving, setSaving] = useState(false);

  // Sync the form to the loaded brand — runs on initial server load and after
  // each save/refresh. Also re-baselines the dirty check so Save disables again.
  useEffect(() => {
    setName(brand.brandName);
    setLogo(brand.brandLogoUrl ?? '');
    setColor(brand.brandColor);
    setButtonColor(brand.buttonColor ?? '');
    setInputColor(brand.inputColor ?? '');
  }, [brand]);

  const colorValid  = HEX_RE.test(color);
  const buttonValid = buttonColor === '' || HEX_RE.test(buttonColor);
  const inputValid  = inputColor === '' || HEX_RE.test(inputColor);

  // Enable Save only when something actually changed from the saved brand.
  const dirty =
    name !== brand.brandName ||
    logo !== (brand.brandLogoUrl ?? '') ||
    color !== brand.brandColor ||
    buttonColor !== (brand.buttonColor ?? '') ||
    inputColor !== (brand.inputColor ?? '');

  const save = async () => {
    if (!name.trim()) { toast.error('Brand name is required'); return; }
    if (!colorValid)  { toast.error('Enter a valid accent hex colour, e.g. #4f46e5'); return; }
    if (!buttonValid) { toast.error('Button colour must be a valid hex (or empty)'); return; }
    if (!inputValid)  { toast.error('Input colour must be a valid hex (or empty)'); return; }
    setSaving(true);
    try {
      const res = await api.put('/brand', {
        brandName: name.trim(),
        brandLogoUrl: logo,        // '' clears the logo server-side
        brandColor: color,
        buttonColor,               // '' resets to the theme default
        inputColor,                // '' resets to the theme default
      });
      // Reflect immediately, then re-sync from the server.
      setBrand({
        brandName: res.data.brandName,
        brandLogoUrl: res.data.brandLogoUrl ?? null,
        brandColor: res.data.brandColor,
        buttonColor: res.data.buttonColor ?? null,
        inputColor: res.data.inputColor ?? null,
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
      <div className="w-full space-y-6">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Palette className="h-5 w-5" /> Brand
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Your name, logo, and accent colour — used across the admin panel, the browser tab/favicon,
            the login screen, and form-submission emails.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
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

            {/* Sidebar header preview */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium">Preview</label>
              <p className="text-xs text-muted-foreground">How the sidebar header will look.</p>
              <div className="flex items-center gap-2 w-64 px-4 h-14 rounded-md border border-border bg-sidebar">
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo} alt={name} className="h-6 w-6 rounded object-contain shrink-0" />
                ) : (
                  <span className="h-6 w-6 rounded shrink-0" style={{ backgroundColor: colorValid ? color : '#4f46e5' }} />
                )}
                <span className="font-semibold text-sm truncate">{name || 'NodePress'}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Theme — button + input colours */}
        <Card>
          <CardHeader>
            <CardTitle>Theme</CardTitle>
            <CardDescription>Optional. Recolour primary buttons and input fields across the admin panel. Leave blank to use the default theme.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Button colour */}
            <div className="space-y-1.5">
              <label htmlFor="buttonColor" className="block text-sm font-medium">Button colour</label>
              <p className="text-xs text-muted-foreground">Primary buttons. Text colour auto-adjusts for contrast.</p>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  aria-label="Button colour picker"
                  value={HEX_RE.test(buttonColor) ? buttonColor : '#4f46e5'}
                  onChange={(e) => setButtonColor(e.target.value)}
                  className="h-9 w-12 rounded border border-border bg-background p-1 cursor-pointer"
                />
                <input
                  id="buttonColor"
                  className={inputCls + ' max-w-[140px] font-mono'}
                  value={buttonColor}
                  onChange={(e) => setButtonColor(e.target.value)}
                  placeholder="(default)"
                />
                {buttonColor && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setButtonColor('')}>Reset</Button>
                )}
                {!buttonValid && <span className="text-xs text-red-400">Invalid hex</span>}
              </div>
            </div>

            {/* Input colour */}
            <div className="space-y-1.5">
              <label htmlFor="inputColor" className="block text-sm font-medium">Input colour</label>
              <p className="text-xs text-muted-foreground">Input border and focus ring.</p>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  aria-label="Input colour picker"
                  value={HEX_RE.test(inputColor) ? inputColor : '#4f46e5'}
                  onChange={(e) => setInputColor(e.target.value)}
                  className="h-9 w-12 rounded border border-border bg-background p-1 cursor-pointer"
                />
                <input
                  id="inputColor"
                  className={inputCls + ' max-w-[140px] font-mono'}
                  value={inputColor}
                  onChange={(e) => setInputColor(e.target.value)}
                  placeholder="(default)"
                />
                {inputColor && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setInputColor('')}>Reset</Button>
                )}
                {!inputValid && <span className="text-xs text-red-400">Invalid hex</span>}
              </div>
            </div>

            {/* Live preview of button + input */}
            <div className="rounded-lg border border-border p-4 flex flex-col gap-4">
              <p className="text-xs text-muted-foreground">Preview</p>
              <button
                type="button"
                className="self-start rounded-md px-4 py-2 text-sm font-medium"
                style={{
                  backgroundColor: HEX_RE.test(buttonColor) ? buttonColor : undefined,
                  color: HEX_RE.test(buttonColor) ? '#fff' : undefined,
                }}
              >
                Sample button
              </button>
              <input
                className="w-full max-w-xs rounded-md border bg-background px-3 py-2 text-sm outline-none"
                style={{ borderColor: HEX_RE.test(inputColor) ? inputColor : undefined }}
                placeholder="Sample input"
                readOnly
              />
            </div>
          </CardContent>
        </Card>
        </div>

        <AlertDialog>
          <AlertDialogTrigger render={<Button disabled={saving || !dirty} />}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Saving…</> : (dirty ? 'Save changes' : 'No changes')}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Save brand changes?</AlertDialogTitle>
              <AlertDialogDescription>
                This updates your brand and theme everywhere — the admin sidebar, browser tab &amp;
                favicon, the login screen, and form-submission emails — for all users.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={save}>Save changes</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminGuard>
  );
}
