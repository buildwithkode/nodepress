// Color helpers for the brand/theme system.
//
// The shadcn/ui CSS tokens are stored as bare HSL triplets ("H S% L%", no
// hsl() wrapper) because Tailwind wraps them as `hsl(var(--token))` and uses
// `hsl(var(--token) / <alpha>)` for opacity modifiers. So a hex value picked
// in the UI must be converted to that triplet form before injection.

/** Convert "#rrggbb" / "#rgb" to an HSL triplet string like "221 83% 53%". Returns null if invalid. */
export function hexToHslTriplet(hex: string): string | null {
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex || '');
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let hue = 0;
  let sat = 0;

  if (max !== min) {
    const d = max - min;
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: hue = (g - b) / d + (g < b ? 6 : 0); break;
      case g: hue = (b - r) / d + 2; break;
      default: hue = (r - g) / d + 4; break;
    }
    hue /= 6;
  }

  return `${Math.round(hue * 360)} ${Math.round(sat * 100)}% ${Math.round(l * 100)}%`;
}

/**
 * Pick a legible foreground triplet (near-black or near-white) for a hex
 * background, so button text stays readable on any chosen colour.
 */
export function contrastTriplet(hex: string): string {
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex || '');
  if (!m) return '0 0% 100%';
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '0 0% 9%' : '0 0% 98%';
}
