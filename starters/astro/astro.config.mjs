import { defineConfig } from 'astro/config';

// Static output: every page is built from NodePress at build time. Rebuild when
// content changes — e.g. a NodePress webhook calling your host's deploy hook.
export default defineConfig({
  output: 'static',
});
