'use client';

import React, { useState, useEffect } from 'react';
import { X, Save, Loader2, ShieldCheck, ExternalLink, HelpCircle, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import api from '@/lib/axios';

export interface PluginConfigField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'textarea' | 'select' | 'password';
  description?: string;
  defaultValue?: any;
  options?: Array<{ label: string; value: any }>;
  required?: boolean;
}

export interface PluginItem {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  homepage?: string;
  category: string;
  icon?: string;
  permissions: string[];
  enabled: boolean;
  configSchema: PluginConfigField[];
  config: Record<string, any>;
}

interface PluginSettingsDrawerProps {
  plugin: PluginItem | null;
  open: boolean;
  onClose: () => void;
  onSaved: (updatedPlugin: PluginItem) => void;
}

export function PluginSettingsDrawer({ plugin, open, onClose, onSaved }: PluginSettingsDrawerProps) {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (plugin) {
      // Initialize with existing config merged with schema defaults
      const initial: Record<string, any> = {};
      for (const field of plugin.configSchema || []) {
        initial[field.name] = plugin.config?.[field.name] ?? field.defaultValue ?? '';
      }
      setFormData({ ...plugin.config, ...initial });
      setSaveSuccess(false);
      setErrorMsg(null);
    }
  }, [plugin]);

  if (!open || !plugin) return null;

  const handleChange = (name: string, value: any) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setSaveSuccess(false);
    setErrorMsg(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);

    try {
      const res = await api.put(`/plugins/${plugin.id}/config`, formData);
      setSaveSuccess(true);
      if (onSaved) {
        onSaved(res.data);
      }
      setTimeout(() => {
        setSaveSuccess(false);
      }, 3000);
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.message || err?.message || 'Failed to save plugin configuration');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-card border-l border-border shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-300">
          
          {/* Drawer Header */}
          <div className="p-6 border-b border-border flex items-start justify-between bg-muted/20">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary uppercase tracking-wider">
                  {plugin.category}
                </span>
                <span className="text-xs font-mono text-muted-foreground">v{plugin.version}</span>
              </div>
              <h2 className="text-xl font-bold text-foreground">{plugin.name}</h2>
              <p className="text-xs text-muted-foreground mt-1">
                By {plugin.author}{' '}
                {plugin.homepage && (
                  <a
                    href={plugin.homepage}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 text-primary hover:underline ml-1"
                  >
                    Docs <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* Description Card */}
            <div className="rounded-lg bg-muted/40 p-4 border border-border/60 text-sm text-muted-foreground leading-relaxed">
              {plugin.description}
            </div>

            {/* Permission Scopes */}
            <div>
              <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                Declared Security Scopes
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {plugin.permissions.map((perm) => (
                  <span
                    key={perm}
                    className="text-[11px] font-mono font-medium px-2 py-1 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                  >
                    {perm}
                  </span>
                ))}
              </div>
            </div>

            {/* Settings Form */}
            <form id="plugin-config-form" onSubmit={handleSave} className="space-y-4 pt-2">
              <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider border-b border-border pb-2">
                Plugin Settings & Parameters
              </h3>

              {(!plugin.configSchema || plugin.configSchema.length === 0) ? (
                <div className="p-6 text-center text-sm text-muted-foreground rounded-lg border border-dashed border-border">
                  This plugin does not require any additional configuration parameters.
                </div>
              ) : (
                plugin.configSchema.map((field) => (
                  <div key={field.name} className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground flex items-center justify-between">
                      <span>{field.label} {field.required && <span className="text-destructive">*</span>}</span>
                    </label>

                    {field.type === 'text' && (
                      <input
                        type="text"
                        value={formData[field.name] ?? ''}
                        onChange={(e) => handleChange(field.name, e.target.value)}
                        required={field.required}
                        className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-hidden focus:ring-2 focus:ring-primary text-foreground"
                      />
                    )}

                    {field.type === 'password' && (
                      <input
                        type="password"
                        value={formData[field.name] ?? ''}
                        onChange={(e) => handleChange(field.name, e.target.value)}
                        required={field.required}
                        className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-hidden focus:ring-2 focus:ring-primary text-foreground font-mono"
                      />
                    )}

                    {field.type === 'number' && (
                      <input
                        type="number"
                        value={formData[field.name] ?? ''}
                        onChange={(e) => handleChange(field.name, e.target.value === '' ? '' : Number(e.target.value))}
                        required={field.required}
                        className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-hidden focus:ring-2 focus:ring-primary text-foreground font-mono"
                      />
                    )}

                    {field.type === 'textarea' && (
                      <textarea
                        rows={3}
                        value={formData[field.name] ?? ''}
                        onChange={(e) => handleChange(field.name, e.target.value)}
                        required={field.required}
                        className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-hidden focus:ring-2 focus:ring-primary text-foreground"
                      />
                    )}

                    {field.type === 'select' && (
                      <select
                        value={formData[field.name] ?? ''}
                        onChange={(e) => handleChange(field.name, e.target.value)}
                        required={field.required}
                        className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-hidden focus:ring-2 focus:ring-primary text-foreground"
                      >
                        {field.options?.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    )}

                    {field.type === 'boolean' && (
                      <label className="flex items-center gap-2 cursor-pointer pt-1">
                        <input
                          type="checkbox"
                          checked={Boolean(formData[field.name])}
                          onChange={(e) => handleChange(field.name, e.target.checked)}
                          className="w-4 h-4 rounded border-input text-primary focus:ring-primary"
                        />
                        <span className="text-sm text-muted-foreground">Enabled</span>
                      </label>
                    )}

                    {field.description && (
                      <p className="text-xs text-muted-foreground leading-relaxed flex items-start gap-1">
                        <HelpCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-muted-foreground/70" />
                        {field.description}
                      </p>
                    )}
                  </div>
                ))
              )}

              {errorMsg && (
                <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {errorMsg}
                </div>
              )}

              {saveSuccess && (
                <div className="p-3 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0" />
                  Configuration saved and applied live in memory.
                </div>
              )}
            </form>
          </div>

          {/* Drawer Footer */}
          <div className="p-4 border-t border-border bg-muted/20 flex items-center justify-between">
            <Button variant="outline" type="button" onClick={onClose}>
              Close
            </Button>
            {plugin.configSchema && plugin.configSchema.length > 0 && (
              <Button type="submit" form="plugin-config-form" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
