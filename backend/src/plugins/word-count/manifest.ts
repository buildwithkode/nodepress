import { PluginManifest } from '../../plugin/plugin-sdk';

export const WordCountManifest: PluginManifest = {
  id: 'word-count',
  name: 'Word Count & Reading Time',
  version: '1.2.0',
  description: 'Calculates word metrics and estimated reading time on content entries before saving.',
  author: 'BuildWithKode',
  homepage: 'https://nodepress.buildwithkode.com',
  category: 'content',
  icon: 'FileText',
  permissions: ['entries:read', 'entries:write'],
  configSchema: [
    {
      name: 'wordsPerMinute',
      label: 'Reading Speed (Words Per Minute)',
      type: 'number',
      description: 'Average adult reading speed used to calculate reading time in minutes.',
      defaultValue: 200,
      required: true,
    },
    {
      name: 'targetField',
      label: 'Content Field Key',
      type: 'text',
      description: 'Primary text field name to analyze (e.g. content, body, description).',
      defaultValue: 'content',
      required: true,
    },
  ],
  defaultConfig: {
    wordsPerMinute: 200,
    targetField: 'content',
  },
};
