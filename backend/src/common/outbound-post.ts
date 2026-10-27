import * as http from 'http';
import * as https from 'https';
import { isIP } from 'net';
import { guardedLookup, isPrivateAddress } from '../importer/safe-download';

/**
 * Send a webhook (admin webhooks, form webhook actions) without opening an SSRF
 * hole: http(s) only, and unless `allowPrivate`, every address the host resolves
 * to must be public — checked in the socket's own DNS lookup, so a rebinding
 * answer can't swap in a private address. Redirects are not followed (a 3xx is
 * returned as the status), so a public URL can't bounce the request inward.
 */

export interface OutboundRequest {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs: number;
  allowPrivate: boolean;
}

export class OutboundRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutboundRefusedError';
  }
}

/** Throws unless `raw` is an http(s) URL whose host (when an IP literal or localhost) is allowed. */
export function assertOutboundUrl(raw: string, allowPrivate: boolean): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new OutboundRefusedError('Invalid URL'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new OutboundRefusedError(`Only http and https URLs are allowed (got ${url.protocol})`);
  }
  if (allowPrivate) return url;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  // Node skips the DNS lookup for IP literals, so check them here.
  if (isIP(host) && isPrivateAddress(host)) throw new OutboundRefusedError(`${host} is a private address — refused`);
  if (/^(localhost|.*\.localhost)$/i.test(host)) throw new OutboundRefusedError('localhost is refused');
  return url;
}

/** Resolves with the response status; rejects when no response arrived (refused, DNS, timeout…). */
export function outboundPost(raw: string, req: OutboundRequest): Promise<{ status: number; ok: boolean }> {
  let url: URL;
  try {
    url = assertOutboundUrl(raw, req.allowPrivate);
  } catch (err) {
    return Promise.reject(err);
  }

  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const body = req.body ?? '';
    const request = client.request(url, {
      method: req.method ?? 'POST',
      headers: { 'Content-Length': Buffer.byteLength(body).toString(), ...(req.headers ?? {}) },
      lookup: guardedLookup(req.allowPrivate) as any,
    }, (res) => {
      clearTimeout(timer);
      res.resume(); // the body isn't used — drain it so the socket is released
      const status = res.statusCode ?? 0;
      resolve({ status, ok: status >= 200 && status < 300 });
    });
    // One deadline for connect + response headers (the socket `timeout` option is idle time only).
    const timer = setTimeout(() => request.destroy(new Error(`Timed out after ${req.timeoutMs} ms`)), req.timeoutMs);
    request.on('error', (err: any) => {
      clearTimeout(timer);
      reject(err?.name === 'DownloadError' ? new OutboundRefusedError(err.message) : err);
    });
    request.end(body);
  });
}
