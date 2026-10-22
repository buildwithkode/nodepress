// The browser only talks to this Nuxt server (server/api/*), which reads
// NodePress with the env settings — so an API key never reaches the client.
export default defineNuxtConfig({
  compatibilityDate: '2026-08-01',
  css: ['~/assets/main.css'],
  app: {
    head: {
      title: 'Blog',
      meta: [{ name: 'description', content: 'A blog powered by NodePress' }],
    },
  },
});
