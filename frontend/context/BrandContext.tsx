'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import api from '../lib/axios';
import { hexToHslTriplet, contrastTriplet } from '../lib/color';

export interface Brand {
  brandName: string;
  brandLogoUrl: string | null;
  brandColor: string;
  buttonColor: string | null;
  inputColor: string | null;
}

export const DEFAULT_BRAND: Brand = {
  brandName: 'NodePress',
  brandLogoUrl: null,
  brandColor: '#4f46e5',
  buttonColor: null,
  inputColor: null,
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
        buttonColor: res.data.buttonColor ?? null,
        inputColor: res.data.inputColor ?? null,
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

  // Apply the brand to the document: title, favicon, accent var, and the
  // optional theme overrides (button + input colours).
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;

    document.title = `${brand.brandName} CMS`;
    root.style.setProperty('--brand', brand.brandColor);

    // Button colour → --primary (+ readable text via --primary-foreground).
    // Null clears the override so the built-in theme default applies.
    const buttonHsl = brand.buttonColor ? hexToHslTriplet(brand.buttonColor) : null;
    if (buttonHsl) {
      root.style.setProperty('--primary', buttonHsl);
      root.style.setProperty('--primary-foreground', contrastTriplet(brand.buttonColor!));
    } else {
      root.style.removeProperty('--primary');
      root.style.removeProperty('--primary-foreground');
    }

    // Input colour → border (--input) + focus ring (--ring).
    const inputHsl = brand.inputColor ? hexToHslTriplet(brand.inputColor) : null;
    if (inputHsl) {
      root.style.setProperty('--input', inputHsl);
      root.style.setProperty('--ring', inputHsl);
    } else {
      root.style.removeProperty('--input');
      root.style.removeProperty('--ring');
    }

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
