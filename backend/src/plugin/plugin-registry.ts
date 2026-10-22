import * as dns from 'dns';
import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import * as semver from 'semver';
import { z } from 'zod';
import { compatibilityProblem, NODEPRESS_VERSION, PluginManifest } from './plugin.registry';

/**
 * The plugin directory (Plugins → Browse): a JSON file listing plugins, by
 * default plugins-registry.json at the root of the NodePress repo. Pure parts
 * (validation, compatibility) and the guarded HTTP fetch live here; caching and
 * installing are in PluginRegistryService.
 */

const webUrl = z.string().max(2048).regex(/^https?:\/\/\S+$/i, 'must be an http(s) URL');

const latestSchema = z
  .object({
    version: z.string().refine((v) => !!semver.valid(v), 'must be a semver version'),
    downloadUrl: webUrl.optional(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i, 'must be 64 hex characters').transform((s) => s.toLowerCase()).optional(),
    signedBy: z.string().max(200).optional(),
  })
  .refine((l) => !l.downloadUrl === !l.sha256, 'downloadUrl and sha256 go together');

const pluginSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/, 'id must be kebab-case, 3–64 characters'),
  name: z.string().min(1).max(100),
  description: z.string().max(1000).default(''),
  author: z.string().max(200).optional(),
  homepage: webUrl.optional(),
  repository: webUrl.optional(),
  license: z.string().max(100).optional(),
  nodepress: z.string().refine((r) => !!semver.validRange(r), 'must be a semver range'),
  latest: latestSchema.optional(),
  tags: z.array(z.string().max(40)).max(20).default([]),
  pricing: z.enum(['free', 'paid']).default('free'),
  bundled: z.boolean().optional(),
});

export type RegistryPlugin = z.infer<typeof pluginSchema>;

export interface ParsedRegistry {
  plugins: RegistryPlugin[];
  /** Entries dropped because they didn't match the schema (or repeated an id). */
  skipped: Array<{ index: number; id: string | null; reason: string }>;
}

export const MAX_REGISTRY_PLUGINS = 1000;

/**
 * Validate a registry document. The top level must be `{ version: 1, plugins: [] }`
 * (anything else throws); a bad plugin entry is skipped, so one typo in the
 * directory doesn't hide every other plugin.
 */
export function parseRegistry(doc: unknown): ParsedRegistry {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('The registry is not a JSON object');
  const { version, plugins } = doc as Record<string, unknown>;
  if (version !== 1) throw new Error(`Unsupported registry version ${JSON.stringify(version)} (expected 1)`);
  if (!Array.isArray(plugins)) throw new Error('The registry has no "plugins" array');
  if (plugins.length > MAX_REGISTRY_PLUGINS) throw new Error(`The registry lists more than ${MAX_REGISTRY_PLUGINS} plugins`);

  const out: RegistryPlugin[] = [];
  const skipped: ParsedRegistry['skipped'] = [];
  const seen = new Set<string>();
  plugins.forEach((raw, index) => {
    const id = raw && typeof (raw as any).id === 'string' ? (raw as any).id : null;
    const res = pluginSchema.safeParse(raw);
    if (!res.success) {
      const issue = res.error.issues[0];
      skipped.push({ index, id, reason: `${issue.path.join('.') || 'entry'}: ${issue.message}` });
      return;
    }
    if (seen.has(res.data.id)) {
      skipped.push({ index, id, reason: 'duplicate id' });
      return;
    }
    seen.add(res.data.id);
    out.push(res.data);
  });
  return { plugins: out, skipped };
}

/** Reason the plugin can't run on this NodePress version, or null (same rule as installed plugins). */
export function registryCompatibility(p: Pick<RegistryPlugin, 'nodepress'>, coreVersion = NODEPRESS_VERSION): string | null {
  return compatibilityProblem({ nodepress: p.nodepress } as PluginManifest, coreVersion);
}

// ─── Guarded HTTP fetch ──────────────────────────────────────────────────────

/** Addresses a download must never reach: loopback, private, link-local, CGNAT, multicast, reserved. */
const BLOCKED = (() => {
  const list = new net.BlockList();
  for (const [net4, prefix] of [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
    ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
    ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
  ] as const) list.addSubnet(net4, prefix, 'ipv4');
  for (const [net6, prefix] of [
    ['::', 128], ['::1', 128], ['100::', 64], ['2001:db8::', 32], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
  ] as const) list.addSubnet(net6, prefix, 'ipv6');
  return list;
})();

/** True for an address a server-side download must not connect to. */
export function isBlockedAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return BLOCKED.check(address, 'ipv4');
  if (family !== 6) return true;
  const lower = address.toLowerCase();
  // IPv4-mapped (::ffff:a.b.c.d / ::ffff:7f00:1) and NAT64 (64:ff9b::/96) carry an IPv4 address.
  const embedded = lower.match(/^(?:::ffff:|64:ff9b::)(?:0:)?([0-9.]+|[0-9a-f]{1,4}:[0-9a-f]{1,4})$/);
  if (embedded) {
    const v4 = embedded[1].includes('.')
      ? embedded[1]
      : (() => {
          const [hi, lo] = embedded[1].split(':').map((h) => parseInt(h, 16));
          return [hi >> 8, hi & 255, lo >> 8, lo & 255].join('.');
        })();
    return net.isIP(v4) !== 4 || BLOCKED.check(v4, 'ipv4');
  }
  return BLOCKED.check(address, 'ipv6');
}

export interface FetchPolicy {
  timeoutMs: number;
  maxBytes: number;
  /** Allow http:// (otherwise https only). */
  allowHttp: boolean;
  /** Allow loopback / private addresses (off for anything a registry points at). */
  allowPrivate: boolean;
  maxRedirects?: number;
}

export class FetchError extends Error {}

/**
 * GET a URL into memory with a deadline, a size cap, and — unless
 * `allowPrivate` — a check of every resolved address done inside the socket's
 * DNS lookup, so a hostname can't pass the check and then resolve to an
 * internal address (DNS rebinding). Redirects are followed by hand (each hop
 * is checked again).
 */
export async function guardedGet(url: string, policy: FetchPolicy): Promise<{ body: Buffer; contentType: string | null }> {
  const deadline = Date.now() + policy.timeoutMs;
  let current = url;
  for (let hop = 0; hop <= (policy.maxRedirects ?? 3); hop++) {
    const res = await getOnce(current, policy, deadline);
    if ('redirect' in res) {
      current = new URL(res.redirect, current).toString();
      continue;
    }
    return res;
  }
  throw new FetchError('Too many redirects');
}

function getOnce(
  url: string,
  policy: FetchPolicy,
  deadline: number,
): Promise<{ body: Buffer; contentType: string | null } | { redirect: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return Promise.reject(new FetchError(`Not a valid URL: ${url}`));
  }
  if (parsed.protocol !== 'https:' && !(policy.allowHttp && parsed.protocol === 'http:')) {
    return Promise.reject(new FetchError(`Only https:// URLs can be downloaded (got ${parsed.protocol}//${parsed.host})`));
  }
  if (parsed.username || parsed.password) return Promise.reject(new FetchError('URLs with credentials are not allowed'));

  const lookup: net.LookupFunction = (hostname, options, callback) => {
    dns.lookup(hostname, { ...options, all: true }, (err, addresses: dns.LookupAddress[]) => {
      if (err) return (callback as any)(err);
      const blocked = !policy.allowPrivate && addresses.find((a) => isBlockedAddress(a.address));
      if (blocked || !addresses.length) {
        return (callback as any)(new FetchError(`${hostname} resolves to a private or reserved address (${blocked ? blocked.address : 'none'})`));
      }
      if ((options as dns.LookupOptions).all) return (callback as any)(null, addresses);
      (callback as any)(null, addresses[0].address, addresses[0].family);
    });
  };

  return new Promise((resolve, reject) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return reject(new FetchError('Timed out'));
    // An IP literal skips `lookup`, so check it here.
    const host = parsed.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(host) && !policy.allowPrivate && isBlockedAddress(host)) {
      return reject(new FetchError(`${host} is a private or reserved address`));
    }
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(parsed, { lookup, agent: false, headers: { 'user-agent': `NodePress/${NODEPRESS_VERSION}`, accept: '*/*' } }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        resolve({ redirect: res.headers.location });
        return;
      }
      if (status !== 200) {
        res.resume();
        reject(new FetchError(`HTTP ${status}`));
        return;
      }
      const declared = Number(res.headers['content-length']);
      if (declared > policy.maxBytes) {
        res.destroy();
        reject(new FetchError(`The file is larger than ${Math.round(policy.maxBytes / 1024 / 1024)} MB`));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > policy.maxBytes) {
          res.destroy();
          reject(new FetchError(`The file is larger than ${Math.round(policy.maxBytes / 1024 / 1024)} MB`));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => resolve({ body: Buffer.concat(chunks), contentType: (res.headers['content-type'] as string) ?? null }));
      res.on('error', (e) => reject(e instanceof FetchError ? e : new FetchError(e.message)));
      res.on('aborted', () => reject(new FetchError('Timed out')));
    });
    // A deadline for the whole exchange, not just an idle socket.
    const timer = setTimeout(() => req.destroy(new FetchError('Timed out')), remaining);
    req.on('close', () => clearTimeout(timer));
    req.on('error', (e) => reject(e instanceof FetchError ? e : new FetchError(e.message)));
  });
}
