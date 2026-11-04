---
title: Site export and import
description: Move a whole site between NodePress installs in one JSON file, with content types, components, option lists, every entry, forms, webhooks and redirects, without breaking relations.
sidebar:
  order: 12
---

A site export is one JSON file with everything that makes up your content: option lists, components, content types, every entry, in every language and status (drafts and archived entries included, the trash left out), forms, webhooks and redirects. Importing it into another NodePress install rebuilds the site there, or brings an existing one up to date. Typical uses: setting up a staging site from production, moving to a new server, or keeping a copy of the content outside the database.

Admins open **Settings → Export & import**. The [CLI](#from-the-command-line) does the same from a terminal or a script.

## What's in the file

| Included | Not included |
|---|---|
| Option lists, components and content types, as in a [schema export](/cli/schema/) | Media files: entries keep their image and file links |
| Every entry, with its slug, language, status, data, SEO fields, scheduled publish time and public id | Entries in the trash, versions and history |
| The site's languages | Users, roles, API keys and settings |
| [Forms](/content/forms/): name, slug, fields, actions, on/off and captcha setting | Form submissions and uploaded form files |
| [Webhooks](/apis/webhooks/): name, URL, signing secret, events, on/off | Webhook delivery history |
| [Redirects](/content/redirects/): source, target, status code | Redirect hit counts |

Image links keep working while the files stay where they are: on [R2, S3 or ImageKit](/deployment/storage/), or on the old server. When the old server goes away with its local uploads, move those with a [backup](/deployment/backups/) first.

The file includes drafts, every field (including ones hidden from the public API) and form actions, with their email recipients, webhook URLs and webhook headers, and webhook signing secrets. Keep it private.

## Exporting

Click **Download export**. The file is named `nodepress-site-<date>.json`.

## Importing

1. Choose the file. Leave **Update existing content** on to overwrite what's already here, or turn it off to keep existing content types, entries, forms, webhooks and redirects as they are and add only what's missing.
2. Click **Check file**. Nothing is written yet: you see how many content types, entries, forms, webhooks and redirects will be created, updated, restored from the trash or kept, which languages will be added, and every problem in the file.
3. If there are no problems, click **Import**.

How the import matches things:

- **Content types, components and option lists** are matched by name, exactly like a [schema push](/cli/schema/).
- **Entries** are matched by content type, slug and language. A match is updated, or restored if it's in the trash. Anything else is created.
- **Forms** are matched by slug. A match is updated in place, so it keeps its submissions. Anything else is created. Actions are imported as they are, so a staging site built from production emails the same recipients and calls the same webhooks until you change them.
- **Webhooks** are matched by name and URL, so a webhook with a new address is a new webhook. They start sending as soon as the import finishes, and the preview lists the addresses. On a test copy of a live site, change or switch them off right after importing.
- **Redirects** are matched by source path, with the same loop and chain checks as a CSV import. An updated redirect keeps its hit count.
- **Languages** in the file that the site doesn't have yet are added. The default language never changes, and no language is removed.
- **Nothing is deleted.** Content types, entries, forms, webhooks and redirects that exist only on this site stay.
- **Overwritten entries can be restored.** The import saves a version of each entry whose content or status it changes, so you can bring it back from the entry's version history. Content types, forms, webhooks and redirects have no history, so take a [backup](/deployment/backups/) before importing over a site you care about.

The import is all or nothing for problems in the file: one invalid content type, entry, form, webhook or redirect, and nothing is written. If a write fails while the import runs, for example because a plugin rejects an entry, the other entries are still written and the failures are listed.

### Relations

Relation fields store the related entry's public id. A new entry keeps the id it had on the old site, so relations between imported entries work straight away. When an entry already exists here under another id (matched by slug and language), or its id is taken, every relation that points at it is rewritten to the id it has on this site. The preview shows how many entries that affects.

### Size

The admin and the API accept files up to 50 MB. Set `SITE_IMPORT_MAX_MB` on the backend for larger ones, and raise any limit in front of it, such as nginx's `client_max_body_size`. For very large sites, use the CLI.

## From the command line

`site:export` and `site:import` connect like the [schema commands](/cli/schema/#connecting): `NODEPRESS_URL` and `NODEPRESS_TOKEN`, an API key with `all` access to every content type or an admin JWT.

```bash
export NODEPRESS_URL=https://cms.example.com
export NODEPRESS_TOKEN=np_…

npx create-nodepress-app site:export --out production.json
NODEPRESS_URL=https://staging.example.com npx create-nodepress-app site:import production.json
```

| Option | Meaning |
|---|---|
| `--out <file>` | `site:export`: where to save. Default `nodepress-site.json` |
| `--dry-run` | `site:import`: show what would happen and stop |
| `--keep-existing` | `site:import`: keep content types and entries that already exist |
| `--yes` | `site:import`: don't ask before importing (needed outside a terminal) |

`site:import` always shows the preview first and asks before writing. Exit codes: `0` done, `1` problems in the file or the import was cancelled, `2` an error such as a wrong URL or token.

## API

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/site/export` | Admin, or an API key with `all` access to `*` | The site export as JSON |
| `POST` | `/api/site/import` | Admin, or an API key with `all` access to `*` | Import a site export. `?dryRun=true` only reports; `?overwrite=false` keeps existing content |

Both are recorded in the [audit log](/access-control/audit-log/).
