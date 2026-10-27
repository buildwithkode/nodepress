---
title: Upgrade
description: Update a scaffolded project's code to a newer NodePress release with create-nodepress-app upgrade, keeping your own changes.
sidebar:
  order: 3
---

`npx create-nodepress-app upgrade` brings a project's code up to a newer NodePress release. It applies only what changed between your release and the target, so your own edits stay, and lines that both you and NodePress changed get conflict markers for you to resolve.

It changes code only. Installing packages, migrating the database, restarting and committing stay with you, and the command tells you what to run. For upgrading a live site end to end (backups, rollback, Docker), see [Upgrading](/deployment/upgrading/).

## Usage

Commit your work, then run this in the project's root folder:

```bash
npx create-nodepress-app upgrade --dry-run   # preview
npx create-nodepress-app upgrade             # apply the latest release
```

| Argument | Meaning |
|---|---|
| `[version]` | Target release, with or without the `v`: `1.8.0` or `v1.8.0`. Default: the newest release tag. |
| `--dry-run` | Shows what would change and changes nothing. Works with uncommitted changes. |
| `--from <version>` | The release the project is on, for projects created before `nodepress.json` existed. Needed once. |

Then:

```bash
npm install
cd backend && npx prisma migrate deploy && cd ..
# restart, check the admin, then:
git add -A && git commit -m "Upgrade NodePress to v1.8.0"
```

Back up the database before `migrate deploy`. It changes the database, and undoing the code doesn't undo a migration.

## How it works

A scaffolded project has its own git history and is missing the files the scaffold removed, so a plain `git merge` of a new release would conflict on every one of them. Instead, `upgrade`:

1. Checks it's in the root of a git repository with `backend/` and `frontend/` folders, and, unless it's a dry run, that there are no uncommitted changes.
2. Reads the current release from `nodepress.json` (or `--from`).
3. Adds the `nodepress` git remote if it's missing, using the repository recorded in `nodepress.json`.
4. Stops with a message if the project is already on the target release or a newer one.
5. Fetches both release tags into `refs/nodepress/<tag>`, so they never clash with your own tags.
6. Lists the files that changed between the two releases and sorts them (see below).
7. Applies the changes to the remaining files with `git apply --3way`.
8. Writes the new version to `nodepress.json`.

If the patch can't be applied and produced no conflicts, nothing is changed and the command prints git's error.

When the major version changes (for example `v1.9.0` → `v2.0.0`), it warns you to read the upgrade notes of every major release up to the target before migrating.

## What is left alone

Changed files fall into four groups:

| Group | What happens |
|---|---|
| Applied | The change is merged into your file. |
| Skipped | Paths a project doesn't carry: the development files the scaffold removed (tests, CLI, docs, changelog…), the root `package.json`, the Docker files when the project was created without `--docker`, and the Sentry files without `--sentry`. Only the count is shown. |
| Deleted in your project | Changed in NodePress, but you deleted the file. Listed, not applied. |
| Already exists | New in NodePress, but your project already has a file at that path. Listed, not applied. Compare with `git show refs/nodepress/<tag>:<file>`. |

The skip list comes from `nodepress.json`. For a project without it, `upgrade` works it out from your files: it treats the project as a Docker project if `docker-compose.yml` exists and as a Sentry project if `frontend/sentry.server.config.ts` exists.

Projects created before 1.7.2 were scaffolded without `scripts/` and `backend/scripts/`, which took the backup, database-check and password-reset scripts (and, with `--docker`, the scripts `docker-compose.yml` mounts) with them. `upgrade` restores those files from the target release, lists them under **Restored**, and updates the skip list in `nodepress.json`.

### The root `package.json`

Your project has its own root `package.json` (the scaffold writes it), so NodePress's is never applied. When it changed in the new release (for example new `overrides` or `allowScripts` entries), the command says so and prints the command to compare:

```bash
git diff refs/nodepress/v1.7.0 refs/nodepress/v1.8.0 -- package.json
```

Copy over what applies to you by hand.

## Dry run

```bash
npx create-nodepress-app upgrade 1.8.0 --dry-run
```

```text
  NodePress v1.7.0 → v1.8.0  42 file(s) to update

    backend/src/entries/entries.service.ts |  18 ++++---
    frontend/components/RichTextEditor.tsx |   6 +-
    …

  Dry run — nothing was changed. Run without --dry-run to apply.
```

The dry run prints a `git diff --stat` of the files that would be applied, plus the not-applied lists described above.

## Conflicts

Where you and NodePress changed the same lines, the file gets standard git conflict markers and the command lists it:

```text
  ⚠  2 file(s) have conflicts (you and NodePress changed the same lines). Fix the <<<<<<< markers, then `git add` them:
       backend/src/app.module.ts
       frontend/app/(admin)/layout.tsx
```

Open each file, keep the right version of each `<<<<<<<` … `>>>>>>>` block, then `git add` it. `git diff --name-only --diff-filter=U` lists the files still unresolved.

## Undo

Before you commit, this restores the project to its state before the upgrade (including `nodepress.json`) and removes files the upgrade added:

```bash
git reset --hard && git clean -fd
```

`git clean -fd` also deletes any other untracked files, so commit or stash new work first. After you've committed the upgrade, revert that commit instead.

## Projects created before `nodepress.json`

Older projects have no `nodepress.json`. The command stops and asks for the release the project was created from, and suggests the version in `backend/package.json`:

```bash
npx create-nodepress-app upgrade --from 1.6.2
```

Use that version unless you've upgraded by hand since. After the first run the project has a `nodepress.json`, so later upgrades don't need `--from`.

## What changed

The command ends with a link to the target release's changelog on GitHub. Read it, especially for steps that need more than a migration.
