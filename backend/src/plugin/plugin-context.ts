import { DynamicModule, Inject, Logger, Module } from '@nestjs/common';
import { PluginRegistry, PluginManifest } from './plugin.registry';
import { PluginHookBus, HookHandler, FilterHandler } from './plugin-hook-bus';
import { EVENT_PERMISSIONS } from './plugin-permissions';
import { JobsService, JobHandler, EnqueueOptions } from '../jobs/jobs.service';

/** Injection token for a plugin's own PluginContext. */
export const PLUGIN_CONTEXT = Symbol('NODEPRESS_PLUGIN_CONTEXT');
const PLUGIN_MANIFEST = Symbol('NODEPRESS_PLUGIN_MANIFEST');

/** `@InjectPluginContext() ctx: PluginContext` in a plugin's providers. */
export const InjectPluginContext = () => Inject(PLUGIN_CONTEXT);

export interface HookOptions {
  /** Lower runs earlier. Default 10. */
  priority?: number;
}

/**
 * Everything a plugin talks to the core through, scoped to that plugin:
 * hooks and filters are registered under its id (no self-declared ids), it
 * only sees its own settings, and its jobs are namespaced.
 */
export interface PluginContext {
  readonly id: string;
  readonly manifest: PluginManifest;
  readonly logger: Logger;
  /** Is the plugin currently enabled (admins can toggle it at runtime)? */
  isEnabled(): boolean;
  /** This plugin's settings (manifest defaults merged with what the admin saved). */
  config<T extends Record<string, any> = Record<string, any>>(): T;
  /** Called with the new settings whenever an admin saves them. */
  onConfigChange(listener: (config: Record<string, any>) => void): void;
  /**
   * Subscribe to a core event (see PluginEvents). Needs the matching permission
   * in the manifest — e.g. entry.beforeCreate needs `entries:write` — or this
   * throws at startup. Throw PluginVetoError from a before-hook to reject the write.
   */
  on<T = any>(event: string, handler: HookHandler<T>, options?: HookOptions): void;
  /** Add a filter to a named pipeline (see core docs for the filters the core applies). */
  addFilter<T = any>(name: string, handler: FilterHandler<T>, options?: HookOptions): void;
  /** Background jobs, namespaced as "<plugin-id>.<type>". Needs `jobs:run`. */
  readonly jobs: {
    register(type: string, handler: JobHandler): void;
    enqueue(type: string, payload: Record<string, any>, options?: EnqueueOptions): Promise<number>;
  };
}

class PluginContextImpl implements PluginContext {
  readonly logger: Logger;
  readonly jobs: PluginContext['jobs'];

  constructor(
    readonly manifest: PluginManifest,
    private readonly registry: PluginRegistry,
    private readonly hookBus: PluginHookBus,
    jobsService: JobsService | null,
  ) {
    this.logger = new Logger(`Plugin:${manifest.id}`);
    const jobType = (type: string) => `${manifest.id}.${type}`;
    const needJobs = () => {
      this.requirePermission('jobs:run', 'use background jobs');
      if (!jobsService) throw new Error('The job queue is not available');
      return jobsService;
    };
    this.jobs = {
      register: (type, handler) =>
        needJobs().registerHandler(jobType(type), async (payload, job) => {
          // A disabled plugin's queued jobs fail with a clear reason instead of running.
          if (!this.isEnabled()) throw new Error(`Plugin "${manifest.id}" is disabled`);
          return handler(payload, job);
        }),
      enqueue: (type, payload, options) => needJobs().enqueue(jobType(type), payload, options),
    };
  }

  get id() {
    return this.manifest.id;
  }

  isEnabled() {
    return this.registry.isEnabled(this.id);
  }

  config<T extends Record<string, any>>(): T {
    return this.registry.getConfig(this.id) as T;
  }

  onConfigChange(listener: (config: Record<string, any>) => void) {
    this.registry.onConfigChange(this.id, listener);
  }

  on<T>(event: string, handler: HookHandler<T>, options: HookOptions = {}) {
    const permission = EVENT_PERMISSIONS[event];
    if (permission) this.requirePermission(permission, `subscribe to "${event}"`);
    this.hookBus.on(event, handler, options.priority ?? 10, this.id, permission);
  }

  addFilter<T>(name: string, handler: FilterHandler<T>, options: HookOptions = {}) {
    this.hookBus.addFilter(name, handler, options.priority ?? 10, this.id);
  }

  private requirePermission(permission: string, what: string) {
    const declared = this.manifest.permissions || [];
    if (!declared.includes(permission) && !declared.includes('*')) {
      throw new Error(
        `Plugin "${this.id}" needs the "${permission}" permission to ${what} — add it to "permissions" in its manifest`,
      );
    }
  }
}

/**
 * Import in a plugin's module to get its PluginContext:
 *
 * @example
 *   @Module({
 *     imports: [PluginContextModule.forPlugin(MyPluginManifest)],
 *     providers: [MyPluginService],
 *   })
 *   export class MyPluginModule {}
 *
 *   @Injectable()
 *   export class MyPluginService implements OnModuleInit {
 *     constructor(@InjectPluginContext() private readonly ctx: PluginContext) {}
 *     onModuleInit() {
 *       this.ctx.on(PluginEvents.ENTRY_BEFORE_CREATE, (p) => { … });
 *     }
 *   }
 */
@Module({})
export class PluginContextModule {
  static forPlugin(manifest: PluginManifest): DynamicModule {
    return {
      module: PluginContextModule,
      providers: [
        // The manifest is module metadata (not just a closure), so each plugin's
        // forPlugin() is a distinct module — Nest dedupes identical dynamic modules.
        { provide: PLUGIN_MANIFEST, useValue: manifest },
        {
          provide: PLUGIN_CONTEXT,
          inject: [PLUGIN_MANIFEST, PluginRegistry, PluginHookBus, { token: JobsService, optional: true }],
          useFactory: (m: PluginManifest, registry: PluginRegistry, hookBus: PluginHookBus, jobs: JobsService | null) =>
            new PluginContextImpl(m, registry, hookBus, jobs ?? null),
        },
      ],
      exports: [PLUGIN_CONTEXT],
    };
  }
}
