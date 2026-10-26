/**
 * True for a path on this site: "/x", but not "//evil.com" or "/\evil.com"
 * (browsers treat both as another host). Use before redirecting to a
 * user-supplied `?redirect=`.
 */
export function isLocalPath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\');
}
