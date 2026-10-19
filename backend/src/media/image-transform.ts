/**
 * Pure helpers for on-the-fly image transforms (GET /api/media/:file/transform).
 *
 * Every request parameter is snapped to a small fixed set, so the number of
 * variants one image can produce is bounded — otherwise each new `w=` value
 * would cost a Sharp encode and a cached file, and a script could fill the disk
 * and pin the CPU.
 */

/** Widths/heights a variant can have; a request is rounded UP to the next one. */
export const SIZE_BUCKETS = [
  16, 32, 48, 64, 96, 128, 192, 256, 320, 384, 480, 640, 750, 828, 960, 1080,
  1200, 1440, 1600, 1920, 2048, 2560, 3200, 3840,
] as const;

export const FORMATS = ['webp', 'avif', 'jpeg', 'png'] as const;
export type ImageFormat = (typeof FORMATS)[number];
export const FITS = ['cover', 'contain', 'fill', 'inside', 'outside'] as const;
export type ImageFit = (typeof FITS)[number];

export const MIME_TYPES: Record<ImageFormat, string> = {
  webp: 'image/webp',
  avif: 'image/avif',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

export interface TransformRequest {
  w?: string;
  h?: string;
  q?: string;
  format?: string;
  fit?: string;
  /** Optional "x,y" — only a cache-buster; the stored focal point is always used. */
  fp?: string;
}

export interface NormalizedTransform {
  width?: number;
  height?: number;
  quality: number;
  format: ImageFormat;
  fit: ImageFit;
  /** True when format=auto picked the format from the Accept header (send Vary: Accept). */
  negotiated: boolean;
}

function snapSize(raw?: string): number | undefined {
  const n = raw === undefined ? NaN : parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return SIZE_BUCKETS.find((b) => b >= n) ?? SIZE_BUCKETS[SIZE_BUCKETS.length - 1];
}

/** Quality 30–100 in steps of 10 (default 80). */
function snapQuality(raw?: string): number {
  const n = raw === undefined ? NaN : parseInt(raw, 10);
  if (!Number.isFinite(n)) return 80;
  return Math.min(100, Math.max(30, Math.round(n / 10) * 10));
}

export function normalizeTransform(req: TransformRequest, accept = ''): NormalizedTransform {
  let format: ImageFormat = 'webp';
  let negotiated = false;
  const asked = (req.format ?? '').toLowerCase();
  if (asked === 'jpg') format = 'jpeg';
  else if ((FORMATS as readonly string[]).includes(asked)) format = asked as ImageFormat;
  else if (asked === 'auto') {
    negotiated = true;
    format = accept.includes('image/avif') ? 'avif' : accept.includes('image/webp') ? 'webp' : 'jpeg';
  }

  const fit = (FITS as readonly string[]).includes(req.fit ?? '') ? (req.fit as ImageFit) : 'inside';
  return {
    width: snapSize(req.w),
    height: snapSize(req.h),
    quality: snapQuality(req.q),
    format,
    fit,
    negotiated,
  };
}

export interface FocalPoint { x: number; y: number }

/** Clamp to 0–1 and round to 2 decimals (what is stored and keyed on). */
export function normalizeFocal(x: unknown, y: unknown): FocalPoint | null {
  const fx = Number(x);
  const fy = Number(y);
  if (!Number.isFinite(fx) || !Number.isFinite(fy)) return null;
  const clamp = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;
  return { x: clamp(fx), y: clamp(fy) };
}

/** Does the output depend on the focal point? Only a cover crop to both dimensions does. */
export function usesFocalPoint(t: NormalizedTransform): boolean {
  return t.fit === 'cover' && !!t.width && !!t.height;
}

/** Cache filename for a variant — every input that changes the output is in it. */
export function variantName(source: string, t: NormalizedTransform, focal: FocalPoint | null): string {
  const base = source.replace(/\.[^.]+$/, '');
  const f = usesFocalPoint(t) && focal ? `_f${focal.x}-${focal.y}` : '';
  return `${base}_w${t.width ?? 'o'}_h${t.height ?? 'o'}_q${t.quality}_${t.fit}${f}.${t.format}`;
}

/**
 * Crop rectangle for a focal-point "cover": scale the image so it covers
 * target width × height, then cut the target window centred as close to the
 * focal point as the image edges allow. Never enlarges.
 */
export function focalCoverRect(
  srcW: number, srcH: number, targetW: number, targetH: number, focal: FocalPoint,
): { resizeW: number; resizeH: number; left: number; top: number; width: number; height: number } {
  const scale = Math.min(1, Math.max(targetW / srcW, targetH / srcH));
  const resizeW = Math.max(1, Math.round(srcW * scale));
  const resizeH = Math.max(1, Math.round(srcH * scale));
  const width = Math.min(targetW, resizeW);
  const height = Math.min(targetH, resizeH);
  const clamp = (v: number, max: number) => Math.min(Math.max(0, v), max);
  const left = clamp(Math.round(focal.x * resizeW - width / 2), resizeW - width);
  const top = clamp(Math.round(focal.y * resizeH - height / 2), resizeH - height);
  return { resizeW, resizeH, left, top, width, height };
}
