/**
 * Saves a file in the browser. The link stays in the page until the download
 * has started and the object URL lives a minute: revoking it right after
 * `click()` cancels the download in Safari (and sometimes Firefox).
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Saves `data` as pretty-printed JSON. */
export function downloadJson(data: unknown, filename: string) {
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), filename);
}

/** Request options for exports: they can take longer than the usual 30 s limit on a slow server. */
export const EXPORT_REQUEST = { timeout: 300_000 } as const;

/**
 * Why a request failed, for the end of an error toast when the server sent no
 * message of its own: "HTTP 504", "timed out", or "no connection". A blob
 * response's JSON error isn't readable here, so the status is what we show.
 */
export function failureDetail(err: any): string | null {
  if (err?.response?.status) return `HTTP ${err.response.status}`;
  if (err?.code === 'ECONNABORTED' || err?.code === 'ETIMEDOUT') return 'timed out';
  if (err?.code === 'ERR_NETWORK' || err?.message === 'Network Error') return 'no connection';
  return null;
}
