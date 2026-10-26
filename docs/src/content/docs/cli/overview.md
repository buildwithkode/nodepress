---
title: CLI overview
description: Every command of create-nodepress-app, the NodePress command-line tool, and how to run it without installing anything.
sidebar:
  order: 1
---

`create-nodepress-app` is the NodePress command-line tool. It creates new projects, upgrades them to newer releases, generates TypeScript types, syncs content models between sites, packs plugins and runs an MCP server for AI assistants. It has no dependencies and needs Node.js 18 or newer.

## Running it

You don't need to install it. `npx` downloads the latest version and runs it:

```bash
npx create-nodepress-app <command> [options]
```

Add `-y` (`npx -y create-nodepress-app …`) to skip npx's "Ok to proceed?" prompt, for example in scripts and CI.

:::note[`npx nodepress` in the help text]
The built-in help and some generated files say `npx nodepress …`. The package on npm is `create-nodepress-app`, so use `npx create-nodepress-app …` as shown on these pages.
:::

## Commands

| Command | What it does | Page |
|---|---|---|
| `<project-name> [--docker] [--sentry] [--no-install]` | Creates a new project in `./<project-name>` | [Create a project](/cli/create/) |
| `upgrade [version] [--dry-run] [--from <version>]` | Updates a project's code to a newer release | [Upgrade](/cli/upgrade/) |
| `generate:types [--out <path>]` | Writes TypeScript interfaces for your content types | [Generate types](/cli/generate-types/) |
| `schema:pull [--out <file>]` | Saves a site's content model to `nodepress.schema.json` | [Schema sync](/cli/schema/) |
| `schema:diff [--file <file>]` | Shows what a push would change | [Schema sync](/cli/schema/) |
| `schema:push [--file <file>] [--yes]` | Applies the file's content model to a site | [Schema sync](/cli/schema/) |
| `mcp` | Runs an MCP server so AI assistants can read and draft content | [MCP server](/cli/mcp/) |
| `plugin keygen [--out <key.pem>]` | Creates an Ed25519 key for signing plugin packages | [Publishing plugins](/extending/publishing-plugins/) |
| `plugin pack [dir] [--key <key.pem>] [--out <file.zip>]` | Zips (and signs) a built plugin for upload | [Publishing plugins](/extending/publishing-plugins/) |
| `--version`, `-v` | Prints the CLI version | |
| `--help`, `-h` | Prints the command list | |

`generate:types` also answers to `types` and `generate-types`. The older form `new <project-name>` still creates a project.

## Where to run each command

| Command | Run it from |
|---|---|
| Create | The folder that will contain the new project |
| `upgrade` | The project's root folder (the git repository with `backend/` and `frontend/`) |
| `generate:types` | The project's root folder, with `backend/.env` pointing at the database |
| `schema:*`, `mcp` | Anywhere: they talk to a running site over HTTP |
| `plugin pack` | Your plugin's folder, or pass the folder as `dir` |

## Environment variables

| Variable | Used by | Meaning |
|---|---|---|
| `NODEPRESS_URL` | `schema:*`, `mcp` | The site's backend URL, e.g. `https://cms.example.com` |
| `NODEPRESS_TOKEN` | `schema:*` | An API key with `all` access to every content type, or an admin JWT |
| `NODEPRESS_API_KEY` | `mcp`, `schema:*` | API key for the MCP server's writes. `schema:*` uses it when `NODEPRESS_TOKEN` is unset |
| `NODEPRESS_PLUGIN_KEY` | `plugin pack` | Path to the signing key, instead of `--key` |
| `NODEPRESS_REPO` | create | Git URL (or local path) of the NodePress repository to clone instead of `https://github.com/buildwithkode/nodepress.git`, for a fork or for testing. The project records it, so later upgrades use it too |
| `NO_COLOR` | `schema:*` | Turns off colored output |
