---
title: Schema sync
description: Keep your content model in git and copy it between sites with schema:pull, schema:diff and schema:push.
sidebar:
  order: 5
---

The `schema:*` commands save a site's content model (content types, components and choice lists) to a JSON file, show how a site differs from the file, and apply the file to a site. Use them to keep the model in git, review changes in pull requests, and move a model from development to staging to production without rebuilding it by hand.

```bash
export NODEPRESS_URL=https://cms.example.com
export NODEPRESS_TOKEN=np_…

npx create-nodepress-app schema:pull     # site → nodepress.schema.json
npx create-nodepress-app schema:diff     # what would a push change?
npx create-nodepress-app schema:push     # nodepress.schema.json → site
```

They move the model only, never entries.

## Connecting

| Setting | Flag | Environment variable |
|---|---|---|
| Site URL | `--url <url>` | `NODEPRESS_URL` |
| Credentials | `--token <token>` | `NODEPRESS_TOKEN`, or `NODEPRESS_API_KEY` |

The URL is the backend's address, with or without `/api`. The token is one of:

- an **API key with `all` access to every content type** (`*`). Keys start with `np_` and are sent as `X-API-Key`. Keys with read or write access, or limited to some content types, are refused with 403. See [API keys](/access-control/api-keys/).
- a **JWT** from signing in, sent as `Authorization: Bearer`.

| Command | API key | JWT |
|---|---|---|
| `schema:pull` | `all` access to `*` | admin or editor |
| `schema:diff`, `schema:push` | `all` access to `*` | admin |

`schema:diff` needs admin rights too, because it asks the server for a dry run of the import.

Flags can go before or after the command, and take `--flag value` or `--flag=value`.

## schema:pull

```bash
npx create-nodepress-app schema:pull [--out <file>]
```

Writes the site's model to `nodepress.schema.json` in the current folder, or to `--out` (`-o`). The file is overwritten.

```json title="nodepress.schema.json"
{
  "version": "1.0",
  "choiceLists": [
    {
      "name": "country",
      "label": "Country",
      "choices": [{ "label": "Germany", "value": "de" }, { "label": "France", "value": "fr" }],
      "description": null
    }
  ],
  "components": [
    { "name": "seo_block", "description": null, "displayName": "SEO block", "fields": [] }
  ],
  "contentTypes": [
    {
      "name": "blog",
      "displayName": "Blog",
      "allowedMethods": ["list", "read"],
      "schema": [
        { "name": "title", "label": "Title", "type": "text", "required": true }
      ]
    }
  ]
}
```

The file is written for clean git diffs: no export timestamp, content types, components and choice lists sorted by name, and object keys in a fixed order (`name`, `label`, `type` first, then alphabetical). Pulling an unchanged site gives an identical file.

:::note
The file doesn't include a content type's [preview URL](/content-modeling/content-types/#preview-url). Set it on each site.
:::

## schema:diff

```bash
npx create-nodepress-app schema:diff [--file <file>]
```

Compares the file (default `nodepress.schema.json`, or `--file` / `-f`) with the site and prints what a push would do. Nothing is changed.

```text
  + component hero_block  new
  = choiceList country  unchanged
  ~ blog
      + reading_time
      - subtitle (existing entries keep the value; it is no longer shown or validated)
      ~ category: type text → select
      ~ summary: now required
      ~ body: settings changed
      ~ allowedMethods: ["list","read"] → ["list","read","create"]
  + product  new content type (6 fields)
  = page  unchanged
  ? legacy_news  only on the server — push does not delete it

  Changes to push.
```

| Mark | Meaning |
|---|---|
| `+` | New: created on push (a content type, component, choice list or field) |
| `~` | Changed: a field's type, required flag or settings, or the content type's display name or allowed methods |
| `-` | A field the file no longer has |
| `=` | Unchanged |
| `?` | Only on the server. Push leaves it alone. |
| `✗` | Invalid: the server would refuse it, with the reason |

The server validates the file exactly as it would on a push, so a clean diff means the push will be accepted.

| Exit code | Meaning |
|---|---|
| `0` | In sync |
| `1` | There are changes to push |
| `2` | The file is invalid, or the command failed (connection, credentials, unreadable file) |

## schema:push

```bash
npx create-nodepress-app schema:push [--file <file>] [--yes]
```

Prints the same diff, asks `Apply these changes to <url>? [y/N]`, then applies the file.

- Only changed content types are sent, so unchanged ones don't get a new [schema version](/content/versions/). New and changed components and choice lists are sent with them.
- Content types, components and choice lists that are only on the server are **never deleted**.
- If any content type is invalid, nothing is pushed.
- Without a terminal (CI), the command refuses to ask: pass `--yes` (`-y`) to push without confirmation.

| Exit code | Meaning |
|---|---|
| `0` | Pushed, or nothing to push |
| `1` | You answered no, or there was no terminal and no `--yes` |
| `2` | The file is invalid, or the command failed |

:::caution[Renaming fields]
A push compares fields by name. A renamed field shows up as one field removed and one added: existing entries keep their values under the old key, and the new field starts empty. To rename a field and move its data, rename it in the admin or through the API with a field migration. See [Schema changes](/content-modeling/schema-changes/).
:::

## Workflow: model in git

1. Change the model on your development site, in the admin.
2. Pull it and commit the file with the code that uses it:

   ```bash
   npx create-nodepress-app schema:pull
   git add nodepress.schema.json && git commit -m "Add reading time to blog"
   ```

3. Review the file's diff in the pull request.
4. After merging, check and apply it on each site:

   ```bash
   NODEPRESS_URL=https://staging-cms.example.com NODEPRESS_TOKEN=$STAGING_KEY \
     npx create-nodepress-app schema:push --yes
   ```

In CI, `schema:diff` doubles as a drift check: it exits `1` when a site has fallen behind the committed file, and `2` when the file is invalid.

```bash
npx -y create-nodepress-app schema:diff || echo "Production differs from nodepress.schema.json"
```

Keep the token in your CI's secret store. A key with `all` access to `*` can change the whole content model.
