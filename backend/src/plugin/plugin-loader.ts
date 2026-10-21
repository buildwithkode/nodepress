import * as fs from 'fs';
import * as path from 'path';
import { DynamicModule, Logger, Module, Type } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PluginManifest } from './plugin.registry';
import { ENABLED_PLUGINS } from './plugins.config';
import { inspectPackage, PackageManifest } from './plugin-package';
import { pluginUploadSettings } from './plugin-upload.settings';

/**
 * Loads the plugins this instance runs: the bundled ones from plugins.config.ts
 * plus the packages admins uploaded (plugin_packages table). Uploaded packages
 * live in Postgres, so every instance — including a fresh container or a PaaS
 * redeploy — unpacks them to PLUGINS_DIR and requires them before Nest starts.
 *
 * A package that fails to load is listed with its error instead of crashing
 * startup. One that breaks startup itself is switched off by recordBootFailure()
 * so the restarted server comes up without it.
 */
export interface LoadedPlugin {
  manifest: PluginManifest;
  module: Type<any> | null;
  source: 'bundled' | 'uploaded';
  /** sha256 of the uploaded archive this instance loaded. */
  sha256?: string;
  /** Unpacked location (uploaded plugins). */
  dir?: string;
  loadError?: string;
}

const logger = new Logger('PluginLoader');

/** Packages that must be the core's own copy, or Nest DI and Prisma break. */
const SHARED = /^(@nestjs\/|@prisma\/client($|\/)|\.prisma\/|reflect-metadata$|rxjs($|\/)|class-validator$|class-transformer$)/;
const SDK = '@nodepress/plugin-sdk';

export const pluginsDir = () => path.resolve(process.env.PLUGINS_DIR || path.resolve(__dirname, '../../.plugins'));
// (process.env rather than `env`, so tests can point it at a temp dir.)

let resolverInstalled = false;

/**
 * Plugin code resolves `@nodepress/plugin-sdk` to the running core, and the
 * shared packages above from the core's node_modules even if it ships its own.
 * Anything else it bundles in its node_modules first, then falls back to the core's.
 * (Under Jest, moduleNameMapper does the SDK part.)
 */
function installResolver(dir: string) {
  if (resolverInstalled) return;
  resolverInstalled = true;
  const NodeModule = require('module');
  const original = NodeModule._resolveFilename;
  const root = dir + path.sep;
  const sdkPath = require.resolve('./plugin-sdk');
  const core = module;
  NodeModule._resolveFilename = function (request: string, parent: any, ...rest: any[]) {
    if (!parent?.filename?.startsWith(root)) return original.call(this, request, parent, ...rest);
    if (request === SDK) return sdkPath;
    if (SHARED.test(request)) return original.call(this, request, core, ...rest);
    try {
      return original.call(this, request, parent, ...rest);
    } catch (err) {
      if (request.startsWith('.') || path.isAbsolute(request)) throw err;
      return original.call(this, request, core, ...rest);
    }
  };
}

/** Write a package's files to <dir>/<id>@<version>-<sha12>, once. */
function unpack(base: string, manifest: PackageManifest, sha256: string, files: Map<string, Buffer>): string {
  const dir = path.join(base, `${manifest.id}@${manifest.version}-${sha256.slice(0, 12)}`);
  if (fs.existsSync(path.join(dir, '.complete'))) return dir;
  const tmp = `${dir}.tmp-${process.pid}`;
  fs.rmSync(tmp, { recursive: true, force: true });
  for (const [rel, data] of files) {
    const target = path.join(tmp, rel);
    if (!target.startsWith(tmp + path.sep)) throw new Error(`Unsafe path in package: ${rel}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
  }
  fs.writeFileSync(path.join(tmp, '.complete'), sha256);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.renameSync(tmp, dir);
  return dir;
}

/** Same permissions, regardless of order. */
const samePermissions = (a: string[] = [], b: string[] = []) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** Require a package's entry and check it exports what its manifest says. */
function requireEntry(dir: string, manifest: PackageManifest): Type<any> {
  const exported = require(path.join(dir, manifest.main));
  const api = exported?.module ? exported : exported?.default;
  if (typeof api?.module !== 'function') {
    throw new Error(`${manifest.main} must export "module" (the plugin's Nest module) and "manifest"`);
  }
  const code: PluginManifest | undefined = api.manifest;
  if (code && (code.id !== manifest.id || code.version !== manifest.version || !samePermissions(code.permissions, manifest.permissions))) {
    throw new Error('The manifest exported by the code differs from nodepress-plugin.json (id, version or permissions)');
  }
  return api.module;
}

export interface PackageRow {
  id: string;
  version: string;
  archive: Buffer | Uint8Array;
  sha256: string;
  loadError: string | null;
}

/** Load uploaded packages (exported for tests; boot goes through loadPlugins). */
export function loadPackages(rows: PackageRow[], opts: { dir: string; bundledIds: Set<string> }): LoadedPlugin[] {
  const settings = pluginUploadSettings();
  const out: LoadedPlugin[] = [];
  const keep = new Set<string>();
  installResolver(opts.dir);
  fs.mkdirSync(opts.dir, { recursive: true });

  for (const row of rows) {
    const archive = Buffer.from(row.archive);
    const fallback = { id: row.id, name: row.id, version: row.version, description: '', permissions: [] } as PluginManifest;
    const broken = (manifest: PluginManifest, loadError: string): LoadedPlugin => {
      logger.warn(`Uploaded plugin "${row.id}" not loaded: ${loadError}`);
      return { manifest, module: null, source: 'uploaded', sha256: row.sha256, loadError };
    };
    if (opts.bundledIds.has(row.id)) {
      out.push(broken(fallback, 'A bundled plugin already uses this id'));
      continue;
    }
    let pkg;
    try {
      pkg = inspectPackage(archive, { trustedKeys: settings.trustedKeys, limits: settings.limits });
    } catch (err: any) {
      out.push(broken(fallback, `Invalid package: ${err?.message}`));
      continue;
    }
    const { main: _main, ...manifest } = pkg.manifest;
    if (pkg.sha256 !== row.sha256) {
      out.push(broken(manifest, 'Stored package does not match its checksum'));
      continue;
    }
    if (row.loadError) {
      out.push(broken(manifest, row.loadError));
      continue;
    }
    if (settings.mode === 'signed' && pkg.signature.status !== 'trusted') {
      out.push(broken(manifest, 'Its signature is not from a trusted key (PLUGIN_TRUSTED_KEYS)'));
      continue;
    }
    try {
      const dir = unpack(opts.dir, pkg.manifest, pkg.sha256, pkg.files);
      keep.add(path.basename(dir));
      const mod = requireEntry(dir, pkg.manifest);
      out.push({ manifest, module: mod, source: 'uploaded', sha256: row.sha256, dir });
      logger.log(`Loaded uploaded plugin ${manifest.id}@${manifest.version}`);
    } catch (err: any) {
      out.push(broken(manifest, `Failed to load: ${err?.message || err}`));
    }
  }

  // Remove unpacked copies of packages that were deleted or replaced.
  for (const name of fs.readdirSync(opts.dir)) {
    if (/@.+-[0-9a-f]{12}(\.tmp-\d+)?$/.test(name) && !keep.has(name)) {
      fs.rmSync(path.join(opts.dir, name), { recursive: true, force: true });
    }
  }
  return out;
}

let loaded: Promise<LoadedPlugin[]> | null = null;
let current: LoadedPlugin[] | null = null;

const bundled = (): LoadedPlugin[] => ENABLED_PLUGINS.map(({ manifest, module }) => ({ manifest, module, source: 'bundled' }));

/** Bundled + uploaded plugins, loaded once per process. Never rejects. */
export function loadPlugins(): Promise<LoadedPlugin[]> {
  loaded ??= (async () => {
    const list = bundled();
    const prisma = new PrismaClient();
    try {
      const rows = await prisma.pluginPackage.findMany({ orderBy: { id: 'asc' } });
      if (rows.length) {
        list.push(...loadPackages(rows, { dir: pluginsDir(), bundledIds: new Set(list.map((p) => p.manifest.id)) }));
      }
    } catch (err: any) {
      logger.warn(`Uploaded plugins not loaded: ${err?.message || err}`);
    } finally {
      await prisma.$disconnect().catch(() => undefined);
    }
    current = list;
    return list;
  })();
  return loaded;
}

/** The plugins this process loaded (bundled only until loadPlugins() has run). */
export function loadedPlugins(): LoadedPlugin[] {
  return current ?? bundled();
}

@Module({})
export class PluginHostModule {}

/** Imported by AppModule: resolves to a module importing every loaded plugin's module. */
export async function pluginHostModule(): Promise<DynamicModule> {
  const plugins = await loadPlugins();
  return { module: PluginHostModule, imports: plugins.flatMap((p) => (p.module ? [p.module] : [])) };
}

/** Load the plugins again, as a restart would (e2e tests boot a second app with it). */
export function reloadPluginHost(): Promise<DynamicModule> {
  loaded = null;
  current = null;
  return pluginHostModule();
}

/**
 * Startup failed. Switch off the uploaded plugin(s) to blame so the next start
 * succeeds: the one whose files appear in the error's stack, else every package
 * that hasn't started successfully yet (just installed or updated).
 */
export async function recordBootFailure(err: any, plugins = loadedPlugins()): Promise<string[]> {
  const uploaded = plugins.filter((p) => p.source === 'uploaded' && p.module && p.sha256);
  if (!uploaded.length) return [];
  const trace = `${err?.stack || ''}\n${err?.message || ''}`;
  const prisma = new PrismaClient();
  try {
    let blamed = uploaded.filter((p) => p.dir && trace.includes(p.dir));
    if (!blamed.length) {
      const fresh = await prisma.pluginPackage.findMany({
        where: { id: { in: uploaded.map((p) => p.manifest.id) }, bootedAt: null },
        select: { id: true, sha256: true },
      });
      blamed = uploaded.filter((p) => fresh.some((f) => f.id === p.manifest.id && f.sha256 === p.sha256));
    }
    const reason = `Switched off automatically: the server failed to start with it installed — ${String(err?.message || err).slice(0, 500)}`;
    for (const p of blamed) {
      await prisma.pluginPackage.updateMany({ where: { id: p.manifest.id, sha256: p.sha256 }, data: { loadError: reason } });
      logger.error(`Switched off uploaded plugin "${p.manifest.id}" after a failed startup`);
    }
    return blamed.map((p) => p.manifest.id);
  } catch {
    return [];
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}
