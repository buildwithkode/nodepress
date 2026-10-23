import { createClient } from '@nodepress-cms/client';

// Read at runtime on the server (Nuxt loads .env in dev).
export const cmsConfig = {
  url: process.env.NODEPRESS_URL || 'http://localhost:3000',
  type: process.env.NODEPRESS_TYPE || 'blog',
  populate: (process.env.NODEPRESS_POPULATE ?? 'author').split(',').map((s) => s.trim()).filter(Boolean),
  apiKey: process.env.NODEPRESS_API_KEY || undefined,
};

export const cms = createClient({ url: cmsConfig.url, apiKey: cmsConfig.apiKey });
