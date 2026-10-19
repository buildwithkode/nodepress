import {
  SIZE_BUCKETS, focalCoverRect, normalizeFocal, normalizeTransform, usesFocalPoint, variantName,
} from './image-transform';

describe('image-transform helpers', () => {
  it('rounds sizes up to the next bucket and caps at the largest', () => {
    expect(normalizeTransform({ w: '401' }).width).toBe(480);
    expect(normalizeTransform({ w: '384' }).width).toBe(384);
    expect(normalizeTransform({ w: '99999' }).width).toBe(3840);
    expect(normalizeTransform({ w: '-5', h: 'abc' })).toMatchObject({ width: undefined, height: undefined });
  });

  it('bounds the variants one image can produce', () => {
    const widths = new Set(Array.from({ length: 4000 }, (_, i) => normalizeTransform({ w: String(i + 1) }).width));
    expect(widths.size).toBe(SIZE_BUCKETS.length);
    const qualities = new Set(Array.from({ length: 120 }, (_, i) => normalizeTransform({ q: String(i) }).quality));
    expect([...qualities].sort((a, b) => a - b)).toEqual([30, 40, 50, 60, 70, 80, 90, 100]);
  });

  it('defaults to webp/inside/80 and validates format and fit', () => {
    expect(normalizeTransform({})).toMatchObject({ format: 'webp', fit: 'inside', quality: 80, negotiated: false });
    expect(normalizeTransform({ format: 'jpg', fit: 'nope' })).toMatchObject({ format: 'jpeg', fit: 'inside' });
    expect(normalizeTransform({ format: 'gif' }).format).toBe('webp');
  });

  it('format=auto negotiates from the Accept header', () => {
    expect(normalizeTransform({ format: 'auto' }, 'image/avif,image/webp,*/*')).toMatchObject({ format: 'avif', negotiated: true });
    expect(normalizeTransform({ format: 'auto' }, 'image/webp,*/*').format).toBe('webp');
    expect(normalizeTransform({ format: 'auto' }, '*/*').format).toBe('jpeg');
  });

  it('focal points are clamped and rounded; only cover crops use them', () => {
    expect(normalizeFocal(0.333, 2)).toEqual({ x: 0.33, y: 1 });
    expect(normalizeFocal(null, undefined)).toBeNull();
    expect(usesFocalPoint(normalizeTransform({ w: '100', h: '100', fit: 'cover' }))).toBe(true);
    expect(usesFocalPoint(normalizeTransform({ w: '100', fit: 'cover' }))).toBe(false);
    const t = normalizeTransform({ w: '100', h: '100', fit: 'cover' });
    expect(variantName('a.jpg', t, { x: 0.2, y: 0.8 })).toBe('a_w128_h128_q80_cover_f0.2-0.8.webp');
    expect(variantName('a.jpg', normalizeTransform({ w: '100' }), { x: 0.2, y: 0.8 })).toBe('a_w128_ho_q80_inside.webp');
  });

  it('focal cover crop keeps the focal point in frame, clamped to the edges', () => {
    // 1000×500 → 200×200: scaled to 400×200, window slides horizontally.
    expect(focalCoverRect(1000, 500, 200, 200, { x: 0.5, y: 0.5 })).toMatchObject({ resizeW: 400, resizeH: 200, left: 100, top: 0, width: 200, height: 200 });
    expect(focalCoverRect(1000, 500, 200, 200, { x: 0.9, y: 0.5 }).left).toBe(200); // clamped right
    expect(focalCoverRect(1000, 500, 200, 200, { x: 0, y: 0.5 }).left).toBe(0);
    // Never enlarges a small image.
    expect(focalCoverRect(100, 50, 400, 400, { x: 0.5, y: 0.5 })).toMatchObject({ resizeW: 100, resizeH: 50, width: 100, height: 50 });
  });
});
