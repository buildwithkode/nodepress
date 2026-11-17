/**
 * Who has the admin open right now, for the avatars in the admin's top bar.
 *
 * Each signed-in browser tab reports the page it shows (`presence:here`); a tab
 * counts until its socket disconnects. One person with several tabs is listed
 * once, on the page they used last. Held in memory on this instance: with
 * several backend instances each one only knows its own connections.
 */

/** What the entry editor adds to its path: the entry being edited (data, shown as stored). */
export interface PresenceDetail {
  type: string;
  slug: string;
  locale?: string;
}

/** One person in the list sent to the admin. No email: a name, or the email's local part. */
export interface OnlineUser {
  id: number;
  name: string;
  role: string;
  path: string;
  detail: PresenceDetail | null;
}

interface TabPresence extends OnlineUser {
  at: number;
}

const text = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

/** An admin path only: starts with one slash, so never another site (`//evil.test`). */
export function cleanPath(v: unknown): string {
  if (typeof v !== 'string' || !v.startsWith('/') || v.startsWith('//') || v.includes('\\')) return '/';
  return v.slice(0, 300);
}

export function cleanDetail(v: unknown): PresenceDetail | null {
  if (!v || typeof v !== 'object') return null;
  const d = v as Record<string, unknown>;
  const type = text(d.type, 80);
  const slug = text(d.slug, 200);
  if (!type || !slug) return null;
  const locale = text(d.locale, 10);
  return { type, slug, ...(locale ? { locale } : {}) };
}

export class AdminPresence {
  private readonly tabs = new Map<string, TabPresence>();

  constructor(private readonly now: () => number = Date.now) {}

  /** A tab says where it is. Returns false for connections that aren't a person (API keys). */
  update(socketId: string, user: { id: number; name?: string | null; email: string; role: string }, body: unknown): boolean {
    if (!user?.id) return false;
    const b = (body ?? {}) as Record<string, unknown>;
    this.tabs.set(socketId, {
      id: user.id,
      name: user.name?.trim() || user.email.split('@')[0] || '?',
      role: user.role,
      path: cleanPath(b.path),
      detail: cleanDetail(b.detail),
      at: this.now(),
    });
    return true;
  }

  /** The tab closed. True when it was listed, so the list changed. */
  remove(socketId: string): boolean {
    return this.tabs.delete(socketId);
  }

  /** One row per person: the tab they used last. Sorted by name. */
  list(): OnlineUser[] {
    const latest = new Map<number, TabPresence>();
    for (const tab of this.tabs.values()) {
      const seen = latest.get(tab.id);
      if (!seen || tab.at >= seen.at) latest.set(tab.id, tab);
    }
    return [...latest.values()]
      .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id)
      .map(({ at: _at, ...user }) => user);
  }
}
