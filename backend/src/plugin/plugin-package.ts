import { createHash, createPublicKey, sign, verify, KeyObject } from 'crypto';
import * as semver from 'semver';
import { z } from 'zod';
import { readZip, stripTopFolder, ZipError, ZipLimits } from './plugin-archive';
import { isKnownPermission } from './plugin-permissions';
import { compatibilityProblem, PluginManifest } from './plugin.registry';

/**
 * An uploadable plugin package is a zip holding:
 *   nodepress-plugin.json  the manifest (read without running any plugin code)
 *   nodepress-plugin.sig   optional Ed25519 signature (see packageMessage)
 *   dist/…                 compiled JavaScript; `main` names the entry file
 *   node_modules/…         the plugin's own runtime dependencies, if any
 *
 * The entry file exports `manifest` and `module` (the Nest module). @nestjs/*,
 * Prisma and `@nodepress/plugin-sdk` come from the running NodePress, never the
 * package (see plugin-loader.ts).
 */
export const MANIFEST_FILE = 'nodepress-plugin.json';
export const SIGNATURE_FILE = 'nodepress-plugin.sig';

export class PackageError extends Error {}

const configField = z.object({
  name: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
  type: z.enum(['text', 'number', 'boolean', 'textarea', 'select', 'password']),
  description: z.string().max(1000).optional(),
  defaultValue: z.any().optional(),
  options: z.array(z.object({ label: z.string(), value: z.any() })).optional(),
  required: z.boolean().optional(),
});

const manifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/, 'id must be kebab-case (a-z, 0-9, -), 3–64 characters'),
  name: z.string().min(1).max(100),
  version: z.string().refine((v) => !!semver.valid(v), 'version must be a semver version, e.g. 1.2.0'),
  description: z.string().max(500).default(''),
  author: z.string().max(200).optional(),
  homepage: z.string().url().optional(),
  category: z.enum(['content', 'seo', 'analytics', 'security', 'integrations', 'utilities']).optional(),
  icon: z.string().max(50).optional(),
  permissions: z.array(z.string()).default([]),
  configSchema: z.array(configField).optional(),
  defaultConfig: z.record(z.any()).optional(),
  nodepress: z.string().refine((r) => !!semver.validRange(r), 'nodepress must be a semver range, e.g. ^1.6.0'),
  main: z.string().default('dist/index.js'),
});

export type PackageManifest = PluginManifest & { main: string; nodepress: string };

export type SignatureStatus = 'trusted' | 'untrusted' | 'unsigned' | 'invalid';

export interface InspectedPackage {
  manifest: PackageManifest;
  files: Map<string, Buffer>;
  /** sha256 of the uploaded archive bytes. */
  sha256: string;
  signature: { status: SignatureStatus; keyId?: string };
  /** Why it can't run on this NodePress, or null. */
  incompatible: string | null;
}

const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

/** What a package signature covers: every file except the signature, by path and hash. */
export function packageMessage(files: Map<string, Buffer>): Buffer {
  const lines = [...files.keys()]
    .filter((p) => p !== SIGNATURE_FILE)
    .sort()
    .map((p) => `${sha256(files.get(p)!)}  ${p}\n`);
  return Buffer.from('NODEPRESS-PLUGIN-1\n' + lines.join(''));
}

/** A public key as configured: base64url of the raw 32-byte Ed25519 key. */
export function publicKeyFromString(key: string): KeyObject {
  return createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: key.trim() }, format: 'jwk' });
}

/** Short, stable id for a public key (shown on the Plugins page). */
export const keyId = (key: string) => sha256(Buffer.from(key.trim(), 'base64url')).slice(0, 16);

/** Signature file contents for these files (tests and the CLI produce the same). */
export function signFiles(files: Map<string, Buffer>, privateKey: KeyObject): Buffer {
  const jwk = createPublicKey(privateKey).export({ format: 'jwk' }) as { x: string };
  const signature = sign(null, packageMessage(files), privateKey).toString('base64');
  return Buffer.from(JSON.stringify({ alg: 'ed25519', key: jwk.x, signature }, null, 2));
}

export function checkSignature(files: Map<string, Buffer>, trustedKeys: string[]): InspectedPackage['signature'] {
  const raw = files.get(SIGNATURE_FILE);
  if (!raw) return { status: 'unsigned' };
  let sig: { alg?: string; key?: string; signature?: string };
  try {
    sig = JSON.parse(raw.toString('utf8'));
  } catch {
    return { status: 'invalid' };
  }
  if (sig.alg !== 'ed25519' || typeof sig.key !== 'string' || typeof sig.signature !== 'string') return { status: 'invalid' };
  const id = keyId(sig.key);
  let ok = false;
  try {
    ok = verify(null, packageMessage(files), publicKeyFromString(sig.key), Buffer.from(sig.signature, 'base64'));
  } catch {
    ok = false;
  }
  if (!ok) return { status: 'invalid', keyId: id };
  const trusted = trustedKeys.some((k) => k.trim() === sig.key!.trim());
  return { status: trusted ? 'trusted' : 'untrusted', keyId: id };
}

export function parseManifest(raw: Buffer | undefined): PackageManifest {
  if (!raw) throw new PackageError(`${MANIFEST_FILE} is missing from the package`);
  let json: unknown;
  try {
    json = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new PackageError(`${MANIFEST_FILE} is not valid JSON`);
  }
  const result = manifestSchema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new PackageError(`${MANIFEST_FILE}: ${issue.path.join('.') || 'manifest'} — ${issue.message}`);
  }
  const unknown = result.data.permissions.filter((p) => !isKnownPermission(p));
  if (unknown.length) throw new PackageError(`Unknown permission(s): ${unknown.join(', ')}`);
  return result.data as PackageManifest;
}

/** Validate an uploaded archive without running any of its code. */
export function inspectPackage(
  archive: Buffer,
  opts: { trustedKeys: string[]; limits: ZipLimits; coreVersion?: string },
): InspectedPackage {
  let files: Map<string, Buffer>;
  try {
    files = stripTopFolder(readZip(archive, opts.limits), MANIFEST_FILE);
  } catch (e) {
    throw new PackageError(e instanceof ZipError ? e.message : 'Could not read the zip file');
  }
  const manifest = parseManifest(files.get(MANIFEST_FILE));
  const main = files.has(manifest.main) ? manifest.main : null;
  if (!main || !main.endsWith('.js')) {
    throw new PackageError(`Entry file "${manifest.main}" (the manifest's "main") is missing from the package`);
  }
  return {
    manifest,
    files,
    sha256: sha256(archive),
    signature: checkSignature(files, opts.trustedKeys),
    incompatible: compatibilityProblem(manifest, opts.coreVersion),
  };
}
