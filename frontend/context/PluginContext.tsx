'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { type LucideIcon } from 'lucide-react';
import Cookies from 'js-cookie';
import api from '@/lib/axios';

// ─── Plugin slot types ────────────────────────────────────────────────────────

/** A nav item a plugin can inject into the admin sidebar */
export interface PluginNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Which sidebar group to append to. Defaults to a new 'Plugins' group. */
  group?: string;
  adminOnly?: boolean;
}

/** A widget a plugin can inject into the admin dashboard */
export interface PluginDashboardWidget {
  id: string;
  component: React.ComponentType;
  /** Lower numbers render first. Defaults to 99. */
  order?: number;
}

/** A custom field type renderer a plugin can register for the entry form */
export interface PluginFieldType {
  /** Must be unique and match the 'type' stored in the content type schema */
  type: string;
  /** Human-readable label shown in the field type picker */
  label: string;
  component: React.ComponentType<{
    field: Record<string, any>;
    value: any;
    onChange: (value: any) => void;
    disabled?: boolean;
  }>;
}

/** A plugin registration — pass this to PluginContext.register() */
export interface PluginRegistration {
  id: string;
  navItems?: PluginNavItem[];
  dashboardWidgets?: PluginDashboardWidget[];
  fieldTypes?: PluginFieldType[];
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface PluginContextType {
  /** Register a plugin's slots. Called once per plugin on app mount. */
  register: (plugin: PluginRegistration) => void;
  navItems: PluginNavItem[];
  dashboardWidgets: PluginDashboardWidget[];
  fieldTypes: PluginFieldType[];
  enabledPluginIds: string[];
  isPluginEnabled: (pluginId: string) => boolean;
  loadingPlugins: boolean;
  refreshPlugins: () => Promise<void>;
}

const PluginContext = createContext<PluginContextType>({
  register: () => {},
  navItems: [],
  dashboardWidgets: [],
  fieldTypes: [],
  enabledPluginIds: [],
  isPluginEnabled: () => false,
  loadingPlugins: true,
  refreshPlugins: async () => {},
});

export const PluginProvider = ({ children }: { children: ReactNode }) => {
  const [navItems, setNavItems] = useState<PluginNavItem[]>([]);
  const [dashboardWidgets, setDashboardWidgets] = useState<PluginDashboardWidget[]>([]);
  const [fieldTypes, setFieldTypes] = useState<PluginFieldType[]>([]);
  const [enabledPluginIds, setEnabledPluginIds] = useState<string[]>([]);
  const [loadingPlugins, setLoadingPlugins] = useState(true);

  const refreshPlugins = useCallback(async () => {
    // Only attempt to fetch plugins when an authenticated session exists.
    // Public routes (/login, /forgot-password, /docs) do not require plugin slots.
    const token = Cookies.get('np_token');
    if (!token) {
      setLoadingPlugins(false);
      return;
    }
    try {
      const res = await api.get('/plugins');
      const plugins: Array<{ id: string; enabled: boolean }> = res.data?.plugins || [];
      const enabledIds = plugins.filter((p) => p.enabled).map((p) => p.id);
      setEnabledPluginIds(enabledIds);
    } catch {
      // Unauthenticated or network error
    } finally {
      setLoadingPlugins(false);
    }
  }, []);

  useEffect(() => {
    refreshPlugins();
  }, [refreshPlugins]);

  const isPluginEnabled = useCallback(
    (pluginId: string) => enabledPluginIds.includes(pluginId),
    [enabledPluginIds],
  );

  const register = useCallback((plugin: PluginRegistration) => {
    if (plugin.navItems?.length)       setNavItems((prev) => [...prev, ...plugin.navItems!]);
    if (plugin.dashboardWidgets?.length) setDashboardWidgets((prev) => [...prev, ...plugin.dashboardWidgets!]);
    if (plugin.fieldTypes?.length)     setFieldTypes((prev) => [...prev, ...plugin.fieldTypes!]);
  }, []);

  return (
    <PluginContext.Provider
      value={{
        register,
        navItems,
        dashboardWidgets,
        fieldTypes,
        enabledPluginIds,
        isPluginEnabled,
        loadingPlugins,
        refreshPlugins,
      }}
    >
      {children}
    </PluginContext.Provider>
  );
};

export const usePlugins = () => useContext(PluginContext);
