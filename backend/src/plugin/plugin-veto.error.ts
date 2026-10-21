import { UnprocessableEntityException } from '@nestjs/common';

/**
 * Throw from a before-hook (entry.beforeCreate / beforeUpdate / beforePublish /
 * beforeDelete) to stop the write. The client gets 422 with your message.
 *
 * Any other error a hook throws is logged and ignored, so one broken plugin
 * can't take down writes — use this only to reject on purpose.
 *
 * @example
 *   if (data.price < 0) throw new PluginVetoError('Price cannot be negative');
 */
export class PluginVetoError extends UnprocessableEntityException {
  readonly pluginVeto = true;
  constructor(message: string, readonly pluginId?: string) {
    super({ statusCode: 422, error: 'Rejected by plugin', message, plugin: pluginId });
  }
}

export const isPluginVeto = (err: unknown): err is PluginVetoError =>
  !!err && typeof err === 'object' && (err as any).pluginVeto === true;
