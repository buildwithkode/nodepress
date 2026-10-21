import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PluginRegistry, RegisteredPlugin } from './plugin.registry';
import { PluginHookBus } from './plugin-hook-bus';
import { AuditService } from '../audit/audit.service';

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
  private serialize(p: RegisteredPlugin, role?: string) {
    const isAdmin = role === 'admin';
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
      enabled: p.enabled,
      configSchema: isAdmin ? p.manifest.configSchema || [] : [],
      config: isAdmin ? maskSecrets(p) : {},
    };
  }

  listPlugins(role?: string) {
    const hooksSummary = this.hookBus.getSummary();
    const plugins = this.registry.getAll().map((p) => this.serialize(p, role));

    return {
      plugins,
      meta: {
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
    if (newStatus && p.incompatible) {
      throw new BadRequestException(`Plugin "${id}" can't be enabled: ${p.incompatible}`);
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
}

