'use client';

import { useEffect, useRef } from 'react';
import { usePlugins } from '../context/PluginContext';
import { PLUGIN_REGISTRATIONS } from '../lib/plugins';

/**
 * Registers all plugins from PLUGIN_REGISTRATIONS into the PluginContext.
 * Renders nothing — place this inside the admin layout so plugins are only
 * initialized when the admin panel is active.
 *
 * The ref guard ensures registration only runs once, even in React Strict Mode.
 */
export function PluginInitializer() {
  const { register } = usePlugins();
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    PLUGIN_REGISTRATIONS.forEach((p) => register(p));
  }, [register]);

  return null;
}
