// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';

export default defineConfig({
  site: 'https://nodepress-docs.vercel.app',
  integrations: [
    starlight({
      title: 'NodePress',
      description: 'The open-source, self-hosted headless CMS built on NestJS, Next.js and PostgreSQL.',
      favicon: '/favicon.ico',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/buildwithkode/nodepress' }],
      editLink: { baseUrl: 'https://github.com/buildwithkode/nodepress/edit/main/docs/' },
      lastUpdated: true,
      // Fails the build on a broken internal link or #anchor.
      plugins: [starlightLinksValidator({ errorOnLocalLinks: false })],
      customCss: ['@fontsource-variable/geist', './src/styles/theme.css'],
      components: {
        Header: './src/components/Header.astro',
        PageSidebar: './src/components/PageSidebar.astro',
      },
      sidebar: [
        {
          label: 'Basics',
          items: [
            { label: 'Getting Started', items: [{ autogenerate: { directory: 'getting-started' } }] },
            { label: 'Content Modeling', items: [{ autogenerate: { directory: 'content-modeling' } }] },
          ],
        },
        { label: 'Managing Content', items: [{ autogenerate: { directory: 'content' } }] },
        { label: 'APIs', items: [{ autogenerate: { directory: 'apis' } }] },
        { label: 'Access Control', items: [{ autogenerate: { directory: 'access-control' } }] },
        { label: 'Extending', items: [{ autogenerate: { directory: 'extending' } }] },
        { label: 'CLI', items: [{ autogenerate: { directory: 'cli' } }] },
        { label: 'Deployment', items: [{ autogenerate: { directory: 'deployment' } }] },
        {
          label: 'Reference',
          items: [
            { autogenerate: { directory: 'reference' } },
            { label: 'Changelog', link: 'https://github.com/buildwithkode/nodepress/blob/main/CHANGELOG.md', attrs: { target: '_blank' } },
          ],
        },
      ],
    }),
  ],
});
