'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import api from './axios';

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

/** Module-level cache — survives re-renders and navigation within the same session. */
const cache = new Map<string, CacheEntry<unknown>>();

/** Default stale time: 30 seconds. Data older than this triggers a background revalidation. */
const DEFAULT_STALE_MS = 30_000;

export interface FetchState<T> {
  data: T | undefined;
  loading: boolean;
  error: string | undefined;
  /** Manually trigger a revalidation, bypassing cache. */
  refetch: () => void;
}

/**
 * Lightweight stale-while-revalidate data fetching hook.
 *
 * - Returns cached data immediately (no loading flash on revisit)
 * - Revalidates in the background when data is stale
 * - Deduplicates concurrent in-flight requests for the same URL
 *
 * @param url      API path (e.g. '/content-types') or null to skip fetching
 * @param staleMs  How long before data is considered stale (default: 30 s)
 *
 * @example
 * const { data, loading } = useFetch<ContentType[]>('/content-types');
 */
export function useFetch<T>(url: string | null, staleMs = DEFAULT_STALE_MS): FetchState<T> {
  const cached = url ? (cache.get(url) as CacheEntry<T> | undefined) : undefined;

  const [data,    setData]    = useState<T | undefined>(cached?.data);
  const [loading, setLoading] = useState<boolean>(!cached && url !== null);
  const [error,   setError]   = useState<string | undefined>();
  const inFlight = useRef(false);

  const doFetch = useCallback(
    async (force = false) => {
      if (!url) return;
      if (inFlight.current) return;

      const hit = cache.get(url) as CacheEntry<T> | undefined;
      const isStale = !hit || Date.now() - hit.fetchedAt > staleMs;

      if (hit && !force) {
        setData(hit.data);
        setLoading(false);
        if (!isStale) return; // fresh — skip network
      }

      inFlight.current = true;
      try {
        const res = await api.get<T>(url);
        const value = res.data;
        cache.set(url, { data: value, fetchedAt: Date.now() });
        setData(value);
        setError(undefined);
      } catch (err: any) {
        // Don't clear existing stale data on error — keep showing it
        setError(err?.response?.data?.message ?? err?.message ?? 'Request failed');
      } finally {
        inFlight.current = false;
        setLoading(false);
      }
    },
    [url, staleMs],
  );

  useEffect(() => {
    doFetch();
  }, [doFetch]);

  const refetch = useCallback(() => doFetch(true), [doFetch]);

  return { data, loading, error, refetch };
}

/** Invalidate a cached URL so the next useFetch call fetches fresh data. */
export function invalidateCache(url: string) {
  cache.delete(url);
}

/** Invalidate all cache entries whose URL starts with the given prefix. */
export function invalidateCachePrefix(prefix: string) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}
