'use client';

import { useEffect, useState, useCallback } from 'react';
import { X, ChevronDown, Loader2, Link2 } from 'lucide-react';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface Entry {
  id: number;
  publicId: string;
  slug: string;
  data: Record<string, any>;
}

interface Props {
  /** Content type name to pick entries from */
  relatedContentType: string;
  /** 'one' → single selection; 'many' → multiple selections */
  cardinality: 'one' | 'many';
  /** Current value: publicId string (one) or string[] (many) */
  value: string | string[] | null;
  onChange: (val: string | string[] | null) => void;
}

function firstTextField(data: Record<string, any>): string {
  const val = Object.values(data).find((v) => typeof v === 'string' && v.length > 0);
  return typeof val === 'string' ? val.slice(0, 50) : '';
}

export function RelationPicker({ relatedContentType, cardinality, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedEntries, setSelectedEntries] = useState<Entry[]>([]);

  const selectedIds: string[] = value
    ? (Array.isArray(value) ? value : [value])
    : [];

  // Load selected entry details to show labels
  useEffect(() => {
    if (selectedIds.length === 0) { setSelectedEntries([]); return; }
    // Find which entries are loaded and which need fetching
    const missing = selectedIds.filter((id) => !selectedEntries.some((e) => e.publicId === id));
    if (missing.length === 0) return;
    api.get('/entries', {
      params: { contentTypeId: undefined, limit: 100 },
    }).catch(() => {});
    // Simple approach: load all entries for this CT and filter client-side
    loadEntries('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds.join(',')]);

  const loadEntries = useCallback(async (q: string) => {
    if (!relatedContentType) return;
    setLoading(true);
    try {
      // Get the content type ID first (or search by name in dynamic API)
      const ctRes = await api.get('/content-types');
      const ct = (ctRes.data as any[]).find((c: any) => c.name === relatedContentType);
      if (!ct) return;
      const res = await api.get('/entries', {
        params: { contentTypeId: ct.id, limit: 50, search: q || undefined },
      });
      setEntries(res.data.data ?? []);
      // Refresh selected entry labels
      const loaded = (res.data.data ?? []) as Entry[];
      setSelectedEntries((prev) => {
        const map = new Map([...prev, ...loaded].map((e) => [e.publicId, e]));
        return selectedIds.map((id) => map.get(id)).filter(Boolean) as Entry[];
      });
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [relatedContentType, selectedIds.join(',')]);

  useEffect(() => {
    if (open) loadEntries(search);
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => { if (open) loadEntries(search); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const toggle = (entry: Entry) => {
    if (cardinality === 'one') {
      const newVal = selectedIds[0] === entry.publicId ? null : entry.publicId;
      onChange(newVal);
      setOpen(false);
    } else {
      const next = selectedIds.includes(entry.publicId)
        ? selectedIds.filter((id) => id !== entry.publicId)
        : [...selectedIds, entry.publicId];
      onChange(next.length > 0 ? next : null);
    }
  };

  const remove = (publicId: string) => {
    if (cardinality === 'one') {
      onChange(null);
    } else {
      const next = selectedIds.filter((id) => id !== publicId);
      onChange(next.length > 0 ? next : null);
    }
  };

  return (
    <div className="space-y-2">
      {/* Selected items */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedIds.map((id) => {
            const entry = selectedEntries.find((e) => e.publicId === id);
            return (
              <Badge key={id} variant="secondary" className="gap-1 text-xs pr-1">
                <Link2 className="h-3 w-3 text-muted-foreground" />
                {entry ? entry.slug : id.slice(0, 8) + '…'}
                {entry && (
                  <span className="text-muted-foreground/60 max-w-[120px] truncate">
                    {firstTextField(entry.data) ? ` · ${firstTextField(entry.data)}` : ''}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => remove(id)}
                  className="ml-0.5 rounded hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}

      {/* Picker button */}
      {(cardinality === 'many' || selectedIds.length === 0) && (
        <div className="relative">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-between text-muted-foreground font-normal"
            onClick={() => setOpen((o) => !o)}
          >
            {relatedContentType
              ? `Pick ${relatedContentType.replace(/_/g, ' ')}…`
              : 'Select content type first'}
            <ChevronDown className="h-3.5 w-3.5 ml-2" />
          </Button>

          {open && (
            <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
              <div className="p-2 border-b">
                <Input
                  autoFocus
                  placeholder={`Search ${relatedContentType}…`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
              <div className="max-h-48 overflow-y-auto py-1">
                {loading && (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                )}
                {!loading && entries.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">No entries found</p>
                )}
                {entries.map((entry) => {
                  const isSelected = selectedIds.includes(entry.publicId);
                  return (
                    <button
                      key={entry.publicId}
                      type="button"
                      onClick={() => toggle(entry)}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-accent flex items-center gap-2 ${isSelected ? 'bg-accent/50' : ''}`}
                    >
                      <span className={`h-3.5 w-3.5 rounded-sm border flex-shrink-0 ${isSelected ? 'bg-primary border-primary' : 'border-border'}`} />
                      <span className="font-medium truncate">{entry.slug}</span>
                      {firstTextField(entry.data) && (
                        <span className="text-muted-foreground truncate">{firstTextField(entry.data)}</span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="border-t p-1.5 flex justify-end">
                <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setOpen(false)}>
                  Done
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {!relatedContentType && (
        <p className="text-xs text-muted-foreground/60 italic">Configure a related content type in the schema first.</p>
      )}
    </div>
  );
}
