/** Largest media file accepted, by upload or WordPress import (MEDIA_MAX_MB, default 10). */
export function maxUploadBytes(): number {
  return Math.round((Number(process.env.MEDIA_MAX_MB) || 10) * 1024 * 1024);
}
