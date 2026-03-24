import { useEffect, useRef, useCallback } from 'react';

/**
 * Debounced autosave hook.
 *
 * Calls `saveFn` after `delay` ms of inactivity whenever `data` changes.
 * Skips the first render (no save on mount).
 *
 * @param data     - The value to watch. Must be stable (don't create new objects inline).
 * @param saveFn   - Async function that performs the save. Should be wrapped in useCallback.
 * @param delay    - Debounce delay in milliseconds (default: 2000ms / 2 seconds).
 * @param enabled  - Set to false to disable autosave (e.g. while the form is loading).
 */
export function useAutosave(
  data: unknown,
  saveFn: () => Promise<void>,
  delay = 2000,
  enabled = true,
) {
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef  = useRef(false);
  const saveFnRef   = useRef(saveFn);

  // Keep saveFn ref current without triggering the effect
  useEffect(() => { saveFnRef.current = saveFn; }, [saveFn]);

  useEffect(() => {
    // Skip autosave on the initial mount
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }

    if (!enabled) return;

    // Clear any pending timer
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      saveFnRef.current().catch((err) => {
        console.warn('[autosave] failed:', err);
      });
    }, delay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, delay, enabled]);
}
