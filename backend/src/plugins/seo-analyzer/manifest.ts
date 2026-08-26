import { PluginManifest } from '../../plugin/plugin-sdk';

export const SeoAnalyzerManifest: PluginManifest = {
  id: 'seo-analyzer',
  name: 'SEO Score & Meta Optimizer',
  version: '1.0.0',
  description: 'Analyzes title & meta description snippet lengths, computes SEO quality scores, and provides actionable optimization feedback.',
  author: 'BuildWithKode',
  homepage: 'https://nodepress.buildwithkode.com',
  category: 'seo',
  icon: 'Search',
  permissions: ['entries:read', 'entries:write'],
  configSchema: [
    {
      name: 'minTitleLength',
      label: 'Minimum Title Length (chars)',
      type: 'number',
      description: 'Recommended minimum title length for Google search results (default: 30).',
      defaultValue: 30,
      required: true,
    },
    {
      name: 'maxTitleLength',
      label: 'Maximum Title Length (chars)',
      type: 'number',
      description: 'Maximum title length before truncation in SERP snippets (default: 60).',
      defaultValue: 60,
      required: true,
    },
    {
      name: 'minDescLength',
      label: 'Minimum Description Length (chars)',
      type: 'number',
      description: 'Recommended minimum meta description length (default: 70).',
      defaultValue: 70,
      required: true,
    },
    {
      name: 'maxDescLength',
      label: 'Maximum Description Length (chars)',
      type: 'number',
      description: 'Maximum meta description length before truncation (default: 160).',
      defaultValue: 160,
      required: true,
    },
  ],
  defaultConfig: {
    minTitleLength: 30,
    maxTitleLength: 60,
    minDescLength: 70,
    maxDescLength: 160,
  },
};
