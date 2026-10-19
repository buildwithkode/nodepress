/**
 * URL for an on-the-fly image variant: GET /api/media/:filename/transform.
 *
 * Sizes are rounded up server-side to a fixed set (16…3840). Pass the image's
 * focal point for cover crops: it pins the URL (`fp=`), so the variant can be
 * cached forever and a new focal point produces a new URL.
 */
export function transformUrl(
  filename: string,
  opts: {
    w?: number;
    h?: number;
    fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
    format?: 'auto' | 'webp' | 'avif' | 'jpeg' | 'png';
    q?: number;
    focalX?: number | null;
    focalY?: number | null;
  } = {},
): string {
  const p = new URLSearchParams();
  if (opts.w) p.set('w', String(opts.w));
  if (opts.h) p.set('h', String(opts.h));
  if (opts.fit) p.set('fit', opts.fit);
  p.set('format', opts.format ?? 'auto');
  if (opts.q) p.set('q', String(opts.q));
  if (opts.fit === 'cover' && opts.focalX != null && opts.focalY != null) p.set('fp', `${opts.focalX},${opts.focalY}`);
  return `/api/media/${encodeURIComponent(filename)}/transform?${p.toString()}`;
}
