import { BadGatewayException, BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import * as semver from 'semver';
import { env } from '../config/env';
import { PluginService } from './plugin.service';
import { pluginUploadSettings } from './plugin-upload.settings';
import { FetchPolicy, guardedGet, parseRegistry, RegistryPlugin, registryCompatibility } from './plugin-registry';

const CACHE_MS = 60 * 60_000;
const REGISTRY_TIMEOUT_MS = 5_000;
const REGISTRY_MAX_BYTES = 2 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 60_000;

interface CachedRegistry {
  url: string;
  fetchedAt: number;
  plugins: RegistryPlugin[];
  skipped: number;
}

/**
 * Plugins → Browse. Fetches the registry (PLUGIN_REGISTRY_URL) at most once an
 * hour per instance, keeps the last good copy for when the registry is down,
 * and installs listed plugins through the same review/signature path as an
 * uploaded zip.
 */
@Injectable()
export class PluginRegistryService {
  private readonly logger = new Logger(PluginRegistryService.name);
  private cached: CachedRegistry | null = null;
  private inflight: Promise<CachedRegistry> | null = null;

  /**
   * Network rules for plugin downloads (the URLs come from the registry, so
   * from outside): https only and no private/loopback addresses. Only tests
   * relax this, to serve packages from 127.0.0.1. The registry URL itself is
   * operator configuration and may be http or on a private network.
   */
  downloadPolicy: Pick<FetchPolicy, 'allowHttp' | 'allowPrivate'> = { allowHttp: false, allowPrivate: false };

  constructor(private readonly plugins: PluginService) {}

  private get url(): string {
    return (env.PLUGIN_REGISTRY_URL ?? '').trim();
  }

  /** The directory with install state. Never throws for a registry problem — `error` says what went wrong. */
  async list(refresh = false) {
    const url = this.url;
    if (!url) return { enabled: false, url: null, fetchedAt: null, stale: false, error: null, skipped: 0, plugins: [] };

    let reg: CachedRegistry | null = this.cached?.url === url ? this.cached : null;
    let error: string | null = null;
    if (!reg || refresh || Date.now() - reg.fetchedAt > CACHE_MS) {
      try {
        reg = await this.fetchRegistry(url);
      } catch (err: any) {
        error = `Could not load the plugin directory: ${err?.message ?? err}`;
        this.logger.warn(`${error} (${url})`);
      }
    }
    if (!reg) return { enabled: true, url, fetchedAt: null, stale: false, error, skipped: 0, plugins: [] };

    const installed = await this.installedVersions();
    const uploadsOff = pluginUploadSettings().mode === 'off';
    return {
      enabled: true,
      url,
      fetchedAt: new Date(reg.fetchedAt).toISOString(),
      stale: !!error,
      error,
      skipped: reg.skipped,
      plugins: reg.plugins.map((p) => {
        const installedVersion = installed.get(p.id) ?? null;
        const incompatible = registryCompatibility(p);
        const downloadable = !!(p.latest?.downloadUrl && p.latest.sha256) && !p.bundled;
        const updateAvailable = !!(installedVersion && p.latest && semver.valid(installedVersion) && semver.gt(p.latest.version, installedVersion));
        return {
          ...p,
          installed: installedVersion !== null,
          installedVersion,
          updateAvailable,
          compatible: !incompatible,
          incompatible,
          installable: downloadable && !incompatible && !uploadsOff && (installedVersion === null || updateAvailable),
        };
      }),
    };
  }

  /**
   * Download a listed plugin, check its sha256 against the registry, and hand
   * the bytes to PluginService.uploadPackage — the same review, signature
   * policy (PLUGIN_UPLOADS / PLUGIN_TRUSTED_KEYS) and size limit as an upload.
   */
  async install(id: string, dryRun: boolean, userEmail: string) {
    const listing = await this.list();
    if (!listing.enabled) throw new BadRequestException('The plugin directory is turned off (PLUGIN_REGISTRY_URL is empty)');
    const entry = listing.plugins.find((p) => p.id === id);
    if (!entry) {
      if (listing.error) throw new BadGatewayException(listing.error);
      throw new NotFoundException(`"${id}" is not in the plugin directory`);
    }
    if (entry.bundled) throw new BadRequestException(`"${id}" ships with NodePress — enable it in the Installed tab`);
    if (!entry.latest?.downloadUrl || !entry.latest.sha256) {
      throw new BadRequestException(`"${id}" has no download in the directory${entry.homepage ? ` — see ${entry.homepage}` : ''}`);
    }

    const maxBytes = pluginUploadSettings().maxUploadBytes;
    let archive: Buffer;
    try {
      archive = (await guardedGet(entry.latest.downloadUrl, { ...this.downloadPolicy, timeoutMs: DOWNLOAD_TIMEOUT_MS, maxBytes })).body;
    } catch (err: any) {
      throw new BadGatewayException(`Could not download ${id}: ${err?.message ?? err}`);
    }
    const sha256 = createHash('sha256').update(archive).digest('hex');
    if (sha256 !== entry.latest.sha256) {
      throw new BadRequestException(`The download of ${id} does not match the sha256 in the plugin directory — it was not installed`);
    }

    // Review first, so a package claiming a different id is refused before anything is stored.
    const review = await this.plugins.uploadPackage(archive, true, userEmail);
    const problems = [...review.problems];
    if (review.id !== id) problems.unshift(`The package is "${review.id}", but the directory lists it as "${id}"`);
    const warnings = [...review.warnings];
    if (review.version !== entry.latest.version) {
      warnings.push(`The package is version ${review.version}; the directory lists ${entry.latest.version}.`);
    }
    const registry = { downloadUrl: entry.latest.downloadUrl, sha256, signedBy: entry.latest.signedBy ?? null };
    const summary = { ...review, problems, warnings, installable: problems.length === 0, registry };
    if (dryRun) return summary;
    if (!summary.installable) throw new BadRequestException(problems[0]);

    const installed = await this.plugins.uploadPackage(archive, false, userEmail);
    this.logger.log(`Installed ${id}@${installed.version} from the plugin directory (${entry.latest.downloadUrl})`);
    return { ...installed, warnings, registry };
  }

  private fetchRegistry(url: string): Promise<CachedRegistry> {
    if (!this.inflight) {
      this.inflight = (async () => {
        const { body } = await guardedGet(url, {
          timeoutMs: REGISTRY_TIMEOUT_MS,
          maxBytes: REGISTRY_MAX_BYTES,
          allowHttp: true,
          allowPrivate: true,
        });
        let doc: unknown;
        try {
          doc = JSON.parse(body.toString('utf8'));
        } catch {
          throw new Error('The registry is not valid JSON');
        }
        const parsed = parseRegistry(doc);
        if (parsed.skipped.length) {
          this.logger.warn(`Plugin directory: skipped ${parsed.skipped.length} invalid entr${parsed.skipped.length === 1 ? 'y' : 'ies'} — ${parsed.skipped.map((s) => `${s.id ?? `#${s.index}`}: ${s.reason}`).join('; ')}`);
        }
        const reg = { url, fetchedAt: Date.now(), plugins: parsed.plugins, skipped: parsed.skipped.length };
        this.cached = reg;
        return reg;
      })().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  /** Installed (or installed-pending-restart) plugin versions by id. */
  private async installedVersions(): Promise<Map<string, string>> {
    const { plugins } = await this.plugins.listPlugins('admin');
    return new Map(plugins.map((p) => [p.id, p.pendingVersion ?? p.version]));
  }

  /** Forget the cached directory (tests). */
  clearCache() {
    this.cached = null;
  }
}
