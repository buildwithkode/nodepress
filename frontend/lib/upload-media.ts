import Cookies from 'js-cookie';

/**
 * Uploads one file to the media library. On failure it throws an Error whose
 * message says why (the API's own message, else the HTTP status, else "no
 * connection"), so the toast can show more than "upload failed".
 */
export async function uploadMedia(file: File): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);
  let res: Response;
  try {
    res = await fetch('/api/media/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Cookies.get('np_token') || ''}` },
      body: formData,
    });
  } catch {
    throw new Error('no connection');
  }
  if (!res.ok) {
    let reason = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      const m = body?.message;
      if (m) reason = `${Array.isArray(m) ? m.join('; ') : m} (HTTP ${res.status})`;
    } catch { /* not JSON — keep the status */ }
    throw new Error(reason);
  }
  return res.json();
}
