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
