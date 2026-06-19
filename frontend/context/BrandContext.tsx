'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import api from '../lib/axios';

export interface Brand {
  brandName: string;
  brandLogoUrl: string | null;
  brandColor: string;
}

export const DEFAULT_BRAND: Brand = {
  brandName: 'NodePress',
  brandLogoUrl: null,
  brandColor: '#4f46e5',
};

interface BrandContextType {
  brand: Brand;
  loading: boolean;
  /** Re-fetch from the server (call after saving the Brand page). */
  refresh: () => Promise<void>;
  /** Optimistically set the brand in memory (used by the Brand page on save). */
  setBrand: (b: Brand) => void;
}

const BrandContext = createContext<BrandContextType>({
  brand: DEFAULT_BRAND,
  loading: true,
  refresh: async () => {},
  setBrand: () => {},
});

export function BrandProvider({ children }: { children: ReactNode }) {
  const [brand, setBrandState] = useState<Brand>(DEFAULT_BRAND);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api.get<Brand>('/brand'); // public endpoint
      setBrandState({
        brandName: res.data.brandName || DEFAULT_BRAND.brandName,
        brandLogoUrl: res.data.brandLogoUrl ?? null,
        brandColor: res.data.brandColor || DEFAULT_BRAND.brandColor,
      });
    } catch {
      // Backend unreachable — keep defaults so the UI still renders.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Apply the brand to the document: title, favicon, and the --brand accent var.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.title = `${brand.brandName} CMS`;
    document.documentElement.style.setProperty('--brand', brand.brandColor);
    if (brand.brandLogoUrl) {
      let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = brand.brandLogoUrl;
    }
  }, [brand]);

  return (
    <BrandContext.Provider value={{ brand, loading, refresh: load, setBrand: setBrandState }}>
      {children}
    </BrandContext.Provider>
  );
}

export const useBrand = () => useContext(BrandContext);
