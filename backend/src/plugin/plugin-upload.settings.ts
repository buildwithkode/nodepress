import { env } from '../config/env';

/**
 * Publisher keys trusted on every install, in addition to PLUGIN_TRUSTED_KEYS.
 * Official NodePress / NodePress Pro keys go here (public keys only — base64url
 * of the raw Ed25519 key, as printed by `create-nodepress-app plugin keygen`).
 */
export const BUILTIN_TRUSTED_KEYS: string[] = [];

export interface PluginUploadSettings {
  mode: 'signed' | 'unsigned' | 'off';
  trustedKeys: string[];
  maxUploadBytes: number;
  limits: { maxFiles: number; maxUnpackedBytes: number };
}

/** Read per call, so tests can change `env` between requests. */
export function pluginUploadSettings(): PluginUploadSettings {
  const configured = (env.PLUGIN_TRUSTED_KEYS || '').split(',').map((k) => k.trim()).filter(Boolean);
  return {
    mode: env.PLUGIN_UPLOADS,
    trustedKeys: [...BUILTIN_TRUSTED_KEYS, ...configured],
    maxUploadBytes: env.PLUGIN_MAX_UPLOAD_MB * 1024 * 1024,
    // Bundled node_modules can be big, but not zip-bomb big.
    limits: { maxFiles: 10_000, maxUnpackedBytes: 250 * 1024 * 1024 },
  };
}
