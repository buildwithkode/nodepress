---
title: Use with AI coding agents
description: Ready-made CLAUDE.md / AGENTS.md files that teach Claude Code, Cursor, Codex and other AI coding assistants to connect a Next.js, React or React Native project to NodePress.
sidebar:
  order: 7
---

NodePress has an integration guide written for AI coding assistants: one Markdown file per framework that you drop into your website or app project. With it, you can ask your assistant "connect this project to NodePress" and it knows the API, the field formats, caching, forms, images and security rules, without reading NodePress's source code. Developers can read the same files as a checklist.

| Framework | File | Covers |
|---|---|---|
| Next.js (App Router) | [`nodepress-nextjs.md`](https://nodepress-docs.vercel.app/ai/nodepress-nextjs.md) | Server Components, caching with tags, instant updates through a webhook, `next/image`, forms, redirects, draft mode and live preview, sitemap |
| React (Vite, Create React App, React Router) | [`nodepress-react.md`](https://nodepress-docs.vercel.app/ai/nodepress-react.md) | client-side fetching with or without TanStack Query, CORS, images, forms, routing |
| React Native (Expo, bare React Native) | [`nodepress-react-native.md`](https://nodepress-docs.vercel.app/ai/nodepress-react-native.md) | TanStack Query with offline and refetch on focus, infinite lists, rendering rich text, images, forms with file uploads, emulator URLs |

Each file is complete on its own. They share the same core:

- **Rules for the assistant:** read the real content model before writing code, never put an API key in client code, treat a missing entry as "not found" rather than an error, sanitize rich text.
- **Content discovery:** the public endpoints that list your content types and fields, so the assistant uses your real field names.
- **The API:** endpoints, entry shape, the value format of every field type, filters, sorting, paging, relations, languages.
- **The JavaScript client**, flexible sections, images, forms, option lists, redirects, SEO, TypeScript types, error codes and troubleshooting.

## Before you start

You need:

- a running NodePress with some content, and its public URL, for example `https://cms.example.com`;
- for live sites, the website's domain in the CMS's `CORS_ORIGIN` (the guides tell you when);
- an AI coding assistant that reads project instruction files: Claude Code reads `CLAUDE.md`; Cursor, Codex, GitHub Copilot and others read `AGENTS.md`.

Check the CMS answers:

```bash
curl -s https://cms.example.com/api/content-types | head -c 300
```

## Next.js

1. Open a terminal in your Next.js project's root folder (where `package.json` is).
2. Add the guide to `CLAUDE.md`. `>>` appends, so instructions already in the file stay, and it creates the file if there isn't one:

   ```bash
   curl https://nodepress-docs.vercel.app/ai/nodepress-nextjs.md >> CLAUDE.md
   ```

   New Next.js projects come with an `AGENTS.md` of their own: keep it. For Cursor, Codex or Copilot, append to `AGENTS.md` instead (or as well).
3. Start your assistant in that folder and ask, for example:

   > Connect this site to NodePress at https://cms.example.com. The `page` content type is the site's pages at `/[slug]`, `blog_post` is the blog at `/blog/[slug]`, and the contact form's slug is `contact-us`. Follow CLAUDE.md.

4. The assistant reads your content model and asks for anything the API can't tell it, such as your forms' field names. It then installs `@nodepress-cms/client`, adds the env variables, a CMS module, the pages, image settings, the revalidate route and forms, then type-checks and builds.
5. Do the CMS-side steps it gives you at the end:
   - add the site's domain(s) to `CORS_ORIGIN` on the CMS and restart it;
   - create a webhook under **Developer → Webhooks**: URL `https://<your site>/api/revalidate`, events `*`, secret = the site's `NODEPRESS_REVALIDATE_SECRET`.
6. Add the same env variables on your host (for example Vercel → Settings → Environment Variables) and redeploy.
7. Test: edit and publish an entry, and the page updates within seconds (the webhook's delivery log shows `200`). Submit the form, and it appears under **Forms → Submissions**.

## React (Vite, Create React App)

1. Open a terminal in your React project's root folder.
2. Add the guide to `CLAUDE.md` (`>>` appends and keeps what's already there; use `AGENTS.md` for other assistants):

   ```bash
   curl https://nodepress-docs.vercel.app/ai/nodepress-react.md >> CLAUDE.md
   ```
3. Ask your assistant, for example:

   > Connect this app to NodePress at https://cms.example.com. Show the `blog_post` entries at `/blog` and `/blog/:slug`, and the `page` type at `/:slug`. Follow CLAUDE.md.

4. The assistant adds `VITE_NODEPRESS_URL`, a CMS module, data hooks (TanStack Query if the project uses it), pages with loading, error and not-found states, images and forms.
5. On the CMS, add every domain the app is served from to `CORS_ORIGIN` and restart it. The browser calls the CMS directly, so without this every request is blocked. To develop locally against a live CMS, add `http://localhost:5173` too.
6. Set `VITE_NODEPRESS_URL` on your host and rebuild: the value is built into the app.
7. Test: pages load, images show, a form submission appears under **Forms → Submissions**.

A client-rendered app isn't ideal for search engines. If SEO matters, use Next.js (or another server-rendered framework) and the Next.js guide.

## React Native (Expo)

1. Open a terminal in your app's root folder.
2. Add the guide to `CLAUDE.md` (`>>` appends and keeps what's already there; use `AGENTS.md` for other assistants):

   ```bash
   curl https://nodepress-docs.vercel.app/ai/nodepress-react-native.md >> CLAUDE.md
   ```
3. Ask your assistant, for example:

   > Connect this app to NodePress at https://cms.example.com. Add a Blog tab listing `blog_post` entries with infinite scroll and a detail screen, and a contact screen posting to the `contact-us` form. Follow CLAUDE.md.

4. The assistant installs the client, TanStack Query, `expo-image` and `react-native-render-html`, adds `EXPO_PUBLIC_NODEPRESS_URL`, and builds the screens with pull-to-refresh, offline-friendly caching and forms.
5. While developing against a CMS on your computer, use the right address: `http://localhost:3000` in the iOS simulator, `http://10.0.2.2:3000` in the Android emulator, your computer's network IP on a phone.
6. For release builds, set `EXPO_PUBLIC_NODEPRESS_URL` to the CMS's `https://` address (in EAS environment variables or `eas.json`). Release builds refuse plain `http://`.
7. Test on a real phone on mobile data: lists load, images show, a form submission appears under **Forms → Submissions**.

Native apps aren't affected by CORS, so `CORS_ORIGIN` needs no change for them (it does for Expo web).

## Keeping the guide current

- Download the file again after upgrading NodePress, so new API features are included. Your own additions are safest in a separate section or file.
- The guide tells the assistant to read your content model from the CMS each time, so changes to your content types are picked up without editing the file.
- For typed code, generate types in the NodePress project with [`generate:types`](/cli/generate-types/) and copy the file into your site.

## Related

- [REST API](/apis/rest/) and [Querying](/apis/querying/): the endpoints the guides use.
- [JavaScript client](/apis/js-client/): `@nodepress-cms/client`.
- [Frontend starters](/apis/starters/): complete example sites in Next.js, Astro and Nuxt.
- [Webhooks](/apis/webhooks/), [Forms](/content/forms/), [Live preview](/content/live-preview/).
