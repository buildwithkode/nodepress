import { CanActivate, ExecutionContext, Injectable, NotFoundException, Type } from '@nestjs/common';
import { PluginRegistry } from './plugin.registry';

/** Which plugin each controller class belongs to (filled at boot by PluginModule). */
@Injectable()
export class PluginRouteOwners {
  private readonly owners = new Map<Type<any>, string>();

  set(controller: Type<any>, pluginId: string) {
    this.owners.set(controller, pluginId);
  }

  get(controller: Type<any>): string | undefined {
    return this.owners.get(controller);
  }

  /** Controller → plugin id pairs (for the Plugins page / tests). */
  entries(): Array<[string, string]> {
    return [...this.owners].map(([c, id]) => [c.name, id]);
  }
}

/**
 * Global guard: routes of a disabled (or incompatible) plugin answer 404, as if
 * the plugin weren't installed. Turning a plugin off in the admin therefore
 * really turns off its HTTP API — checkout, webhooks and all.
 */
@Injectable()
export class PluginEnabledGuard implements CanActivate {
  constructor(
    private readonly owners: PluginRouteOwners,
    private readonly registry: PluginRegistry,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const pluginId = this.owners.get(context.getClass());
    if (pluginId && !this.registry.isEnabled(pluginId)) {
      throw new NotFoundException(`Plugin "${pluginId}" is disabled`);
    }
    return true;
  }
}
