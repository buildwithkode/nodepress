import { PluginManifest } from '../../plugin/plugin-sdk';

/**
 * Word Count Plugin — example NodePress plugin.
 *
 * Listens to entry lifecycle events and logs word-count statistics.
 * Replace the logging with your own logic (e.g., send to analytics, store in DB).
 */
export const WordCountManifest: PluginManifest = {
  id: 'word-count',
  name: 'Word Count',
  version: '1.0.0',
  description: 'Counts words in entry text fields after create/update and logs the result.',
  permissions: ['entries:read'],
};
