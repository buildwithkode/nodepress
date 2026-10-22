import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  PayloadTooLargeException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { blockedReason, PluginRegistry, RegisteredPlugin } from './plugin.registry';
import { PluginHookBus } from './plugin-hook-bus';
import { AuditService } from '../audit/audit.service';
import { inspectPackage, PackageError, InspectedPackage } from './plugin-package';
import { pluginUploadSettings } from './plugin-upload.settings';
import { loadedPlugins } from './plugin-loader';
import { PLUGIN_PERMISSIONS, PluginPermission } from './plugin-permissions';
import * as semver from 'semver';

/** A plugin_packages row without the archive bytes. */
type PackageInfo = {
  id: string;
  version: string;
  sha256: string;
  manifest: any;
  signature: string;
  signerKeyId: string | null;
  uploadedAt: Date;
  loadError: string | null;
};

const PACKAGE_INFO = {
  id: true, version: true, sha256: true, manifest: true, signature: true, signerKeyId: true, uploadedAt: true, loadError: true,
} as const;

/** What happens to an uploaded plugin at the next restart. */
type Pending = 'install' | 'update' | 'remove' | null;

/** What a stored secret (password-type setting) looks like in API responses. */
export const SECRET_MASK = '••••••••';

/** Settings safe to send to an admin: password-type values replaced by SECRET_MASK. */
export function maskSecrets(plugin: RegisteredPlugin): Record<string, any> {
  const secret = new Set((plugin.manifest.configSchema || []).filter((f) => f.type === 'password').map((f) => f.name));
  return Object.fromEntries(
    Object.entries(plugin.config || {}).map(([k, v]) => [k, secret.has(k) && v !== '' && v != null ? SECRET_MASK : v]),
  );
}

@Injectable()
export class PluginService implements OnModuleInit {
  private readonly logger = new Logger(PluginService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PluginRegistry,
    private readonly hookBus: PluginHookBus,
    private readonly auditService: AuditService,
  ) {
    // Wire registry into hook bus
    this.hookBus.setRegistry(this.registry);
  }

  async onModuleInit() {
    try {
      // Sync DB states with in-memory registry
      const dbPlugins = await this.prisma.installedPlugin.findMany();
      const registered = this.registry.getAll();

      // Insert any newly registered code plugins into DB if not present
      for (const p of registered) {
        const existing = dbPlugins.find((db) => db.id === p.manifest.id);
        if (!existing) {
          try {
            await this.prisma.installedPlugin.create({
              data: {
                id: p.manifest.id,
                enabled: p.enabled,
                config: p.config || {},
              },
            });
          } catch (e) {
            // ignore if concurrent
          }
        }
      }

      // Re-read DB rows and sync registry in memory
      const freshDbRows = await this.prisma.installedPlugin.findMany();
      this.registry.syncWithDb(freshDbRows);
      this.logger.log(`Synced ${freshDbRows.length} plugin settings with database`);
    } catch (err: any) {
      this.logger.warn(`Could not sync plugins with database on startup: ${err?.message || err}`);
    }
  }

  /**
   * Public shape of a plugin. Admins get the settings with secrets masked;
   * everyone else (editors use this list to know which plugins are on) gets none.
   */
  private serialize(p: RegisteredPlugin, role?: string, pkgs?: Map<string, PackageInfo>) {
    const isAdmin = role === 'admin';
    const pkg = pkgs?.get(p.manifest.id);
    // Restart state needs the stored packages, so only the list reports it.
    const pending = pkgs ? this.pendingFor(p.manifest.id, pkg) : null;
    return {
      id: p.manifest.id,
      name: p.manifest.name,
      version: p.manifest.version,
      description: p.manifest.description,
      author: p.manifest.author || 'Community',
      homepage: p.manifest.homepage,
      category: p.manifest.category || 'utilities',
      icon: p.manifest.icon || 'Puzzle',
      permissions: p.manifest.permissions,
      nodepress: p.manifest.nodepress ?? null,
      incompatible: p.incompatible ?? null,
      source: p.source ?? 'bundled',
      loadError: p.loadError ?? null,
      signature: pkg?.signature ?? null,
      pending,
      pendingVersion: pending === 'update' ? pkg!.version : null,
      enabled: p.enabled,
      configSchema: isAdmin ? p.manifest.configSchema || [] : [],
      config: isAdmin ? maskSecrets(p) : {},
    };
  }

  /** A stored package this instance hasn't loaded yet (installed since the last restart). */
  private serializePendingInstall(pkg: PackageInfo) {
    const m = pkg.manifest || {};
    return {
      id: pkg.id,
      name: m.name || pkg.id,
      version: pkg.version,
      description: m.description || '',
      author: m.author || 'Community',
      homepage: m.homepage,
      category: m.category || 'utilities',
      icon: m.icon || 'Puzzle',
      permissions: m.permissions || [],
      nodepress: m.nodepress ?? null,
      incompatible: null,
      source: 'uploaded' as const,
      loadError: pkg.loadError,
      signature: pkg.signature,
      pending: 'install' as Pending,
      pendingVersion: null,
      enabled: false,
      configSchema: [],
      config: {},
    };
  }

  /** sha256 of each uploaded package this process loaded at startup. */
  private loadedShas(): Map<string, string> {
    return new Map(loadedPlugins().flatMap((p) => (p.source === 'uploaded' && p.sha256 ? [[p.manifest.id, p.sha256]] : [])));
  }

  private pendingFor(id: string, pkg?: PackageInfo): Pending {
    const loaded = this.loadedShas().get(id);
    if (!loaded && !pkg) return null;
    if (!loaded) return 'install';
    if (!pkg) return 'remove';
    return pkg.sha256 === loaded ? null : 'update';
  }

  private async packages(): Promise<Map<string, PackageInfo>> {
    try {
      const rows = await this.prisma.pluginPackage.findMany({ select: PACKAGE_INFO });
      return new Map(rows.map((r) => [r.id, r as PackageInfo]));
    } catch {
      return new Map();
    }
  }

  async listPlugins(role?: string) {
    const hooksSummary = this.hookBus.getSummary();
    const pkgs = await this.packages();
    const plugins = this.registry.getAll().map((p) => this.serialize(p, role, pkgs));
    for (const pkg of pkgs.values()) {
      if (!this.registry.get(pkg.id)) plugins.push(this.serializePendingInstall(pkg));
    }
    const settings = pluginUploadSettings();

    return {
      plugins,
      meta: {
        uploads: role === 'admin' ? { mode: settings.mode, maxUploadMb: Math.round(settings.maxUploadBytes / 1024 / 1024) } : null,
        restartRequired: plugins.some((p) => p.pending),
        totalPlugins: plugins.length,
        enabledPlugins: plugins.filter((p) => p.enabled).length,
        totalHooks: hooksSummary.totalHooks,
        totalFilters: hooksSummary.totalFilters,
        activeEvents: hooksSummary.events,
      },
    };
  }

  getPlugin(id: string, role?: string) {
    const p = this.registry.get(id);
    if (!p) throw new NotFoundException(`Plugin "${id}" not found`);
    return this.serialize(p, role);
  }

  async togglePlugin(id: string, enabled?: boolean, userEmail = 'admin') {
    const p = this.registry.get(id);
    if (!p) throw new NotFoundException(`Plugin "${id}" not found`);

    const newStatus = typeof enabled === 'boolean' ? enabled : !p.enabled;
    const blocked = blockedReason(p);
    if (newStatus && blocked) {
      throw new BadRequestException(`Plugin "${id}" can't be enabled: ${blocked}`);
    }

    // Update in DB
    await this.prisma.installedPlugin.upsert({
      where: { id },
      create: {
        id,
        enabled: newStatus,
        config: p.config || {},
      },
      update: {
        enabled: newStatus,
      },
    });

    // Update in memory
    if (newStatus) {
      this.registry.enable(id);
    } else {
      this.registry.disable(id);
    }

    // Audit log
    await this.auditService.log(
      { email: userEmail },
      newStatus ? 'enabled' : 'disabled',
      'plugin',
      id,
      { id, enabled: newStatus },
    );

    this.logger.log(`Plugin "${id}" toggled to ${newStatus} by ${userEmail}`);
    return this.getPlugin(id, 'admin');
  }

  async updatePluginConfig(id: string, config: Record<string, any>, userEmail = 'admin') {
    const p = this.registry.get(id);
    if (!p) throw new NotFoundException(`Plugin "${id}" not found`);

    // A secret sent back as the mask (an unchanged settings form) keeps its stored value.
    const incoming = Object.fromEntries(Object.entries(config || {}).filter(([, v]) => v !== SECRET_MASK));
    const mergedConfig = { ...p.config, ...incoming };

    // Update in DB
    await this.prisma.installedPlugin.upsert({
      where: { id },
      create: {
        id,
        enabled: p.enabled,
        config: mergedConfig,
      },
      update: {
        config: mergedConfig,
      },
    });

    // Update in memory
    this.registry.setConfig(id, mergedConfig);

    // Audit log
    await this.auditService.log(
      { email: userEmail },
      'updated',
      'plugin',
      id,
      // Never write secret values into the audit log.
      { id, changedKeys: Object.keys(incoming) },
    );

    this.logger.log(`Plugin "${id}" configuration updated by ${userEmail}`);
    return this.getPlugin(id, 'admin');
  }

  // ─── Uploaded packages ──────────────────────────────────────────────────────

  /**
   * Check an uploaded zip without running its code and say what installing it
   * would do. `problems` block the install; `warnings` don't.
   */
  private review(pkg: InspectedPackage, current?: PackageInfo) {
    const settings = pluginUploadSettings();
    const { manifest, signature } = pkg;
    const problems: string[] = [];
    const warnings: string[] = [];
    if (pkg.incompatible) problems.push(pkg.incompatible);
    if (signature.status === 'invalid') problems.push('The signature is invalid — the package was changed after it was signed.');
    else if (signature.status !== 'trusted') {
      const what = signature.status === 'unsigned' ? 'This package is not signed.' : 'This package is signed by a key this install does not trust.';
      if (settings.mode === 'signed') problems.push(`${what} Add the publisher's key to PLUGIN_TRUSTED_KEYS, or set PLUGIN_UPLOADS=unsigned to allow it.`);
      else warnings.push(`${what} Only install it if you trust where it came from — plugins run with full server access.`);
    }
    if (manifest.permissions.includes('*')) warnings.push('It asks for every permission (*).');

    let action: 'install' | 'update' | 'reinstall' | 'downgrade' = 'install';
    if (current) {
      action = semver.gt(manifest.version, current.version) ? 'update' : semver.lt(manifest.version, current.version) ? 'downgrade' : 'reinstall';
    }
    return {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      author: manifest.author || 'Unknown',
      homepage: manifest.homepage ?? null,
      icon: manifest.icon || 'Puzzle',
      category: manifest.category || 'utilities',
      permissions: manifest.permissions,
      permissionDetails: manifest.permissions.map((name) => ({
        name,
        description: name === '*' ? 'Every permission' : PLUGIN_PERMISSIONS[name as PluginPermission],
      })),
      nodepress: manifest.nodepress,
      signature: signature.status,
      signerKeyId: signature.keyId ?? null,
      files: pkg.files.size,
      action,
      currentVersion: current?.version ?? null,
      problems,
      warnings,
      installable: problems.length === 0,
    };
  }

  private assertUploadsAllowed() {
    if (pluginUploadSettings().mode === 'off') {
      throw new ForbiddenException('Plugin uploads are turned off on this server (PLUGIN_UPLOADS=off).');
    }
  }

  /** Inspect (dryRun) or install/replace an uploaded plugin package. */
  async uploadPackage(archive: Buffer | undefined, dryRun: boolean, userEmail = 'admin') {
    this.assertUploadsAllowed();
    const settings = pluginUploadSettings();
    if (!archive?.length) throw new BadRequestException('Choose a plugin .zip file to upload');
    if (archive.length > settings.maxUploadBytes) {
      throw new PayloadTooLargeException(`Plugin packages can be at most ${Math.round(settings.maxUploadBytes / 1024 / 1024)} MB`);
    }

    let pkg: InspectedPackage;
    try {
      pkg = inspectPackage(archive, { trustedKeys: settings.trustedKeys, limits: settings.limits });
    } catch (err) {
      if (err instanceof PackageError) throw new BadRequestException(err.message);
      throw err;
    }
    const id = pkg.manifest.id;
    const existing = this.registry.get(id);
    if (existing && (existing.source ?? 'bundled') === 'bundled') {
      throw new ConflictException(`"${id}" is a bundled plugin — it can't be replaced by an upload`);
    }
    const current = (await this.packages()).get(id);
    const summary = this.review(pkg, current);
    if (dryRun) return summary;
    if (!summary.installable) throw new BadRequestException(summary.problems[0]);

    const data = {
      version: pkg.manifest.version,
      manifest: pkg.manifest as any,
      archive: new Uint8Array(archive),
      sha256: pkg.sha256,
      size: archive.length,
      signature: pkg.signature.status,
      signerKeyId: pkg.signature.keyId ?? null,
      uploadedBy: userEmail,
      uploadedAt: new Date(),
      bootedAt: null,
      loadError: null,
    };
    await this.prisma.pluginPackage.upsert({ where: { id }, create: { id, ...data }, update: data });
    // New plugins start disabled; an update keeps the current on/off state and settings.
    await this.prisma.installedPlugin.upsert({
      where: { id },
      create: { id, enabled: false, config: pkg.manifest.defaultConfig || {} },
      update: {},
    });

    await this.auditService.log({ email: userEmail }, current ? 'updated' : 'installed', 'plugin', id, {
      id,
      version: pkg.manifest.version,
      previousVersion: current?.version ?? null,
      signature: pkg.signature.status,
      sha256: pkg.sha256,
    });
    this.logger.log(`Plugin package ${id}@${pkg.manifest.version} ${summary.action}ed by ${userEmail}`);
    return { ...summary, installed: true, restartRequired: true };
  }

  /** Remove an uploaded plugin. It must be disabled first; it unloads at the next restart. */
  async deletePackage(id: string, userEmail = 'admin') {
    this.assertUploadsAllowed();
    const p = this.registry.get(id);
    if (p && (p.source ?? 'bundled') === 'bundled') throw new BadRequestException(`"${id}" is bundled with NodePress and can't be deleted`);
    const pkg = (await this.packages()).get(id);
    if (!pkg) throw new NotFoundException(`No uploaded plugin "${id}"`);
    if (p?.enabled) throw new BadRequestException(`Disable "${id}" before deleting it`);

    await this.prisma.pluginPackage.delete({ where: { id } });
    await this.prisma.installedPlugin.deleteMany({ where: { id } });
    await this.auditService.log({ email: userEmail }, 'deleted', 'plugin', id, { id, version: pkg.version });
    this.logger.log(`Plugin package ${id}@${pkg.version} deleted by ${userEmail}`);
    return { deleted: true, restartRequired: !!this.loadedShas().get(id) };
  }

  /** Called once the server is listening: these packages started fine. */
  async recordBootSuccess() {
    for (const [id, sha256] of this.loadedShas()) {
      await this.prisma.pluginPackage
        .updateMany({ where: { id, sha256, bootedAt: null }, data: { bootedAt: new Date() } })
        .catch(() => undefined);
    }
  }

  /** Exit after the response is sent; Docker / PM2 / systemd start the server again. */
  exitProcess: () => void = () => process.kill(process.pid, 'SIGTERM');

  async restart(userEmail = 'admin') {
    await this.auditService.log({ email: userEmail }, 'restarted', 'plugin', 'server', {});
    this.logger.warn(`Restart requested by ${userEmail} to load plugin changes`);
    setTimeout(() => this.exitProcess(), 500).unref?.();
    return { restarting: true };
  }
}
