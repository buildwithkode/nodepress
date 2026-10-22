import { lookup as dnsLookup, LookupAddress } from 'dns';
import { createWriteStream, unlinkSync } from 'fs';
import * as http from 'http';
import * as https from 'https';
import { BlockList, isIP } from 'net';

/**
 * Download a remote file for the importer without opening an SSRF hole:
 * http(s) only, every address the host resolves to must be public (checked in
 * the socket's own DNS lookup, so a rebinding DNS answer can't swap in a
 * private address after the check), redirects re-checked hop by hop, a size cap
 * enforced while streaming, and one overall timeout.
 */

export interface SafeDownloadOptions {
  maxBytes: number;
  timeoutMs: number;
  maxRedirects?: number;
  /** Tests only: allow loopback/private addresses (a local HTTP server). */
  allowPrivate?: boolean;
}

export interface DownloadResult {
  bytes: number;
  contentType: string;
  finalUrl: string;
}

export class DownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DownloadError';
  }
}

const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64], ['2001:db8::', 32],
  ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
] as const) blocked.addSubnet(net, prefix, 'ipv6');

/** True for loopback, private, link-local, CGNAT, multicast, documentation and other non-public addresses. */
export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return blocked.check(address, 'ipv4');
  if (family === 6) {
    const lower = address.toLowerCase();
    // IPv4-mapped / -compatible (::ffff:127.0.0.1, ::127.0.0.1) → judge the IPv4 part.
    const mapped = /^::(?:ffff:(?:0:)?)?(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return blocked.check(mapped[1], 'ipv4');
    const hexMapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
    if (hexMapped) {
      const hi = parseInt(hexMapped[1], 16), lo = parseInt(hexMapped[2], 16);
      return blocked.check(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`, 'ipv4');
    }
    return blocked.check(address, 'ipv6');
  }
  return true; // not an IP at all — refuse
}

/** A dns.lookup replacement for http.request that refuses non-public answers. */
export function guardedLookup(allowPrivate: boolean) {
  return (hostname: string, options: any, callback: (...args: any[]) => void) => {
    const opts = typeof options === 'object' && options ? options : {};
    dnsLookup(hostname, { ...opts, all: true }, (err, addresses: LookupAddress[]) => {
      if (err) return callback(err);
      if (!addresses?.length) return callback(new DownloadError(`${hostname} did not resolve`));
      const bad = addresses.find((a) => isPrivateAddress(a.address));
      if (bad && !allowPrivate) {
        return callback(new DownloadError(`${hostname} resolves to a private address (${bad.address}) — refused`));
      }
      if (opts.all) return callback(null, addresses);
      callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

/** Throws unless `raw` is an http(s) URL whose host (when an IP literal) is public. */
export function assertDownloadableUrl(raw: string, allowPrivate = false): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new DownloadError(`Invalid URL "${raw.slice(0, 100)}"`); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new DownloadError(`Only http and https URLs can be downloaded (got ${url.protocol})`);
  }
  if (url.username || url.password) throw new DownloadError('URLs with credentials are not downloaded');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  // Node skips the DNS lookup for IP literals, so check them here.
  if (isIP(host) && isPrivateAddress(host) && !allowPrivate) {
    throw new DownloadError(`${host} is a private address — refused`);
  }
  if (!allowPrivate && /^(localhost|.*\.localhost)$/i.test(host)) throw new DownloadError('localhost is refused');
  return url;
}

/** Download `url` to `dest`. On any failure the partial file is removed and a DownloadError thrown. */
export async function safeDownload(url: string, dest: string, options: SafeDownloadOptions): Promise<DownloadResult> {
  const deadline = Date.now() + options.timeoutMs;
  let current = url;
  for (let hop = 0; hop <= (options.maxRedirects ?? 3); hop++) {
    const result = await fetchOnce(current, dest, options, deadline);
    if ('redirect' in result) {
      current = new URL(result.redirect, current).toString();
      continue;
    }
    return result;
  }
  throw new DownloadError(`Too many redirects for ${url}`);
}

function fetchOnce(
  raw: string,
  dest: string,
  options: SafeDownloadOptions,
  deadline: number,
): Promise<DownloadResult | { redirect: string }> {
  const url = assertDownloadableUrl(raw, options.allowPrivate);
  const remaining = deadline - Date.now();
  if (remaining <= 0) return Promise.reject(new DownloadError(`Timed out downloading ${raw}`));

  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      req.destroy();
      try { unlinkSync(dest); } catch { /* nothing written */ }
      reject(err instanceof DownloadError ? err : new DownloadError(`${raw}: ${err.message}`));
    };
    const timer = setTimeout(() => fail(new DownloadError(`Timed out downloading ${raw}`)), remaining);

    const req = client.get(url, {
      lookup: guardedLookup(!!options.allowPrivate) as any,
      headers: { 'User-Agent': 'NodePress-Importer/1.0', Accept: '*/*' },
    }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        settled = true;
        clearTimeout(timer);
        resolve({ redirect: res.headers.location });
        return;
      }
      if (status !== 200) {
        res.resume();
        return fail(new DownloadError(`${raw}: HTTP ${status}`));
      }
      const declared = Number(res.headers['content-length']);
      if (declared > options.maxBytes) {
        res.resume();
        return fail(new DownloadError(`${raw}: file is larger than ${Math.round(options.maxBytes / 1024 / 1024)} MB`));
      }
      let bytes = 0;
      const out = createWriteStream(dest);
      res.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > options.maxBytes) {
          out.destroy();
          fail(new DownloadError(`${raw}: file is larger than ${Math.round(options.maxBytes / 1024 / 1024)} MB`));
        }
      });
      res.on('error', fail);
      out.on('error', fail);
      out.on('finish', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ bytes, contentType: String(res.headers['content-type'] ?? ''), finalUrl: raw });
      });
      res.pipe(out);
    });
    req.on('error', fail);
  });
}
