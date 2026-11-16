/** How a signed-in user is shown in the admin: their name, else the email's local part. */

interface DisplayUser {
  email?: string | null;
  name?: string | null;
}

export function displayName(user: DisplayUser | null | undefined): string {
  return user?.name?.trim() || user?.email?.split('@')[0] || '';
}

/** Up to two letters for an avatar: "Priya Sharma" → "PS", "leo9karthik@…" → "L". */
export function initials(user: DisplayUser | null | undefined): string {
  const source = user?.name?.trim() || user?.email?.split('@')[0] || '';
  const letters = source
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
  return letters || '?';
}
