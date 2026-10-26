---
title: Publishing plugins
description: Package a plugin as a signed zip with the CLI, share your public key, and list the plugin in a plugin directory with its SHA-256 checksum.
sidebar:
  order: 4
---

Once your plugin is built ([Building plugins](/extending/building-plugins/)), you ship it as a `.zip` package that admins upload under **Plugins → Upload plugin** or install from a plugin directory. Signing it lets servers verify it came from you and wasn't changed.

The CLI does both with two commands, and has no dependencies:

```bash
npx create-nodepress-app plugin keygen
npx create-nodepress-app plugin pack ./my-plugin --key nodepress-plugin-key.pem
```

## 1. Create a signing key

```bash
npx create-nodepress-app plugin keygen --out nodepress-plugin-key.pem
```

```text
  ✔ Private signing key written to /home/me/nodepress-plugin-key.pem
    Keep it secret and out of git. Anyone with it can sign plugins as you.

  Public key — add it to PLUGIN_TRUSTED_KEYS on the servers that should trust your plugins:

    Xq3vN8…
```

- The private key is an Ed25519 key in PEM format, written with owner-only permissions. `keygen` refuses to overwrite an existing file.
- The **public key** is the line it prints: the raw key in base64url. Publish it, for example in your README, so admins can add it to `PLUGIN_TRUSTED_KEYS`.

Do this once and keep using the same key, so servers that trust you keep trusting your updates. Back the private key up somewhere safe; if you lose it, every server has to trust a new key.

## 2. Build and pack

Compile your plugin first, so the entry file exists. Then, from the plugin's folder (the one with `nodepress-plugin.json`):

```bash
npx create-nodepress-app plugin pack . --key nodepress-plugin-key.pem
```

```text
  ✔ excerpt-1.0.0.zip  (6 files, 4.2 KB)
    Auto Excerpt v1.0.0 · NodePress ^1.7.0
    Signed with key 3f9a0c1d2e4b5a69

  Upload it at Plugins → Upload plugin.
```

| Option | Default | Meaning |
|---|---|---|
| `[dir]` | `.` | The plugin folder |
| `--key <file>` | `NODEPRESS_PLUGIN_KEY` | Private key to sign with. Without one the package is unsigned. |
| `--out <file>`, `-o <file>` | `<id>-<version>.zip` | Where to write the zip |

What goes in the zip:

- `nodepress-plugin.json`
- everything listed in its `files` array (default `["dist"]`), with `.git`, `.DS_Store` and `.cache` skipped
- any `README`, `LICENSE`, `LICENCE` or `CHANGELOG` file at the top of the folder
- `nodepress-plugin.sig` when signing

`pack` stops with an error if the manifest lacks `id`, `name`, `version` or `nodepress`, if the entry file (`main`, default `dist/index.js`) doesn't exist or isn't covered by `files`, or if the key isn't an Ed25519 key. It warns when the zip contains `@nestjs`, `@prisma`, `rxjs` or `reflect-metadata` from `node_modules`, since the server always uses its own copies.

:::caution[Unsigned packages]
Servers run with `PLUGIN_UPLOADS=signed` by default and refuse unsigned packages. An admin can only install an unsigned plugin after switching to `PLUGIN_UPLOADS=unsigned`.
:::

In CI, put the key in a secret file and point `NODEPRESS_PLUGIN_KEY` at it instead of passing `--key`.

## What the signature covers

`nodepress-plugin.sig` is a small JSON file:

```json
{ "alg": "ed25519", "key": "Xq3vN8…", "signature": "…base64…" }
```

The signature is over this text, built from every other file in the zip:

```text
NODEPRESS-PLUGIN-1
<sha256 of file>  <path>
<sha256 of file>  <path>
…
```

with one line per file, sorted by path. Changing, adding or removing any file after signing makes the signature **invalid**, and the server refuses the package. Re-zipping the files yourself is fine as long as the contents stay the same.

When an admin uploads the package, the server checks the signature and compares `key` with its `PLUGIN_TRUSTED_KEYS`. The Plugins page shows the result and a short key id (the first 16 hex characters of the key's SHA-256), the same id `pack` prints. See [Signatures and trust](/extending/plugins/#signatures-and-trust).

## Releasing an update

1. Bump `version` in `nodepress-plugin.json` and in the manifest your code exports. They must match.
2. Widen `nodepress` if the new version supports newer NodePress releases.
3. Build, pack and sign with the same key.

Uploading a higher version shows as an update and keeps the plugin's on/off state and settings. A lower version shows as a downgrade, and the same version as a reinstall.

Be careful when adding permissions in an update: admins see the new list in the review, and a plugin whose exported manifest doesn't match `nodepress-plugin.json` isn't loaded.

## The plugin directory

The **Browse** tab on the Plugins page reads a JSON directory of plugins. NodePress's default is `plugins-registry.json` in the NodePress repository; anyone can host their own and point servers at it with `PLUGIN_REGISTRY_URL`.

```json title="plugins-registry.json"
{
  "version": 1,
  "plugins": [
    {
      "id": "excerpt",
      "name": "Auto Excerpt",
      "description": "Stores a short excerpt of the body on every entry.",
      "author": "Acme",
      "homepage": "https://example.com/excerpt",
      "repository": "https://github.com/acme/nodepress-excerpt",
      "license": "MIT",
      "nodepress": "^1.7.0",
      "latest": {
        "version": "1.0.0",
        "downloadUrl": "https://github.com/acme/nodepress-excerpt/releases/download/v1.0.0/excerpt-1.0.0.zip",
        "sha256": "9f2c…64 hex characters…",
        "signedBy": "Acme (key 3f9a0c1d2e4b5a69)"
      },
      "tags": ["content"],
      "pricing": "free"
    }
  ]
}
```

| Key | Required | Meaning |
|---|---|---|
| `version` (top level) | yes | Must be `1` |
| `id` | yes | The plugin's id, as in its manifest |
| `name` | yes | Display name |
| `nodepress` | yes | Semver range of supported NodePress versions; servers outside it show **Incompatible** |
| `description` | | Up to 1,000 characters |
| `author`, `license` | | Shown on the card |
| `homepage`, `repository` | | http(s) links shown on the card |
| `latest.version` | | The current version. Servers with an older one installed show **Update available**. |
| `latest.downloadUrl` | | An `https://` link to the zip |
| `latest.sha256` | | SHA-256 of the zip, 64 hex characters. Required together with `downloadUrl`. |
| `latest.signedBy` | | Free text about the signer, shown for information |
| `tags` | | Up to 20 short tags |
| `pricing` | | `free` (default) or `paid` |
| `bundled` | | `true` for plugins that ship with NodePress |

Get the checksum of the exact file you upload:

```bash
shasum -a 256 excerpt-1.0.0.zip     # macOS
sha256sum excerpt-1.0.0.zip         # Linux
```

How servers use the entry:

- **Install** appears only when the entry has both `downloadUrl` and `sha256` and the plugin is compatible. Without a download (for example a paid plugin sold elsewhere), the card links to `homepage` instead.
- The server downloads the zip over `https` only, refusing private and loopback addresses. If the bytes don't match `sha256`, nothing is installed.
- It then reviews the package like an upload, with the same signature rules. A package whose manifest `id` differs from the entry's `id` is refused; a version that differs from `latest.version` is installed with a warning.
- Invalid entries are skipped, so one mistake doesn't hide the rest of the list. The server log names the skipped entries.

Every new release needs a new `downloadUrl` (or new file at the same URL) **and** its new `sha256`. Update both together, or installs fail the checksum.

### Listing a plugin in the default directory

To have your plugin listed in NodePress's default directory, add an entry to `plugins-registry.json` in the [NodePress repository](https://github.com/buildwithkode/nodepress) through a pull request.
