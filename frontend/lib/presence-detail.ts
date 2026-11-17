'use client';

import { useSyncExternalStore } from 'react';

/** The entry a page is editing, reported with the page's path in the top-bar "online now" list. */
export interface PresenceDetail {
  type: string;
  slug: string;
  locale?: string;
}

let current: PresenceDetail | null = null;
const listeners = new Set<() => void>();

/** Set by the entry editor while it shows an entry; null when it closes. */
export function setPresenceDetail(detail: PresenceDetail | null) {
  current = detail;
  listeners.forEach((l) => l());
}

export function usePresenceDetail(): PresenceDetail | null {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => current,
    () => null,
  );
}
