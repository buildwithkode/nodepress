---
title: Deploy NodePress
description: Choose where to host NodePress — your own server, a platform like Railway or DigitalOcean, or Render — and what you need before you start.
sidebar:
  order: -3
---

NodePress runs anywhere that can run **Node.js and PostgreSQL** around the clock. This page helps you pick a host; each option then has a step-by-step guide that ends with your CMS live on your own domain.

## Pick a host

| | **Your own server (VPS)** | **Platform** (Railway, DigitalOcean App Platform, Render) |
|---|---|---|
| Examples | DigitalOcean Droplet, Hetzner Cloud, AWS Lightsail, Linode, Vultr | Railway, DigitalOcean App Platform, Render |
| Setup | One command on the server | Clicks in a dashboard, plus a few settings |
| Monthly cost | Lowest — one small server runs everything | Higher — you pay for two services and a database |
| You look after | Server updates and backups (both are a few commands) | Almost nothing; the platform runs it |
| Uploaded files | Stay on the server | Need [S3-compatible storage](/deployment/storage/) or a paid disk |
| Guide | [With Docker](/deployment/deploy-vps/) (one command), [from the server zip](/deployment/deploy-zip/) (no Docker, no build) or [without Docker, step by step](/deployment/deploy-vps-node/) | [Deploy on a platform](/deployment/deploy-platforms/) |

**Not sure? Use a server with Docker.** A VPS with 2 GB of memory runs the whole stack — database, API, admin and automatic HTTPS — and the installer sets it all up in one command. Docker here is just the tool the installer uses; you don't need to know it.

**Can't or don't want to use Docker?** [Install from the server zip](/deployment/deploy-zip/): unzip NodePress, already built, start it with Node.js and finish the setup in the browser. To build from source instead, [Deploy on a server without Docker](/deployment/deploy-vps-node/) installs everything step by step.

:::caution[Shared hosting]
Plans sold as "web hosting" or "shared hosting" are made for PHP sites like WordPress, and most can't run NodePress. Some cPanel hosts can: if yours has **Setup Node.js App** with Node.js 22 and a PostgreSQL database (or you use a hosted one), follow [Install on cPanel hosting](/deployment/deploy-cpanel/). The host stops idle apps, so scheduled publishing waits for the next visit. Otherwise choose a VPS or one of the platforms above.
:::

## What you need

Before you start, have these ready:

- **A domain or subdomain** for the CMS, such as `cms.example.com`, and access to its DNS settings (at your registrar or at Cloudflare).
- **An account** with the host you picked.
- **An email sending service**, so NodePress can send invitations and password-reset emails. Any SMTP service works: Resend, Brevo, Postmark, Amazon SES, Mailgun, or a Gmail app password for small teams. See [Email](/deployment/email/). You can add this after the install.
- **For platforms only:** your NodePress project on GitHub. If you created it with `npx create-nodepress-app`, push it to a GitHub repository; otherwise fork [buildwithkode/nodepress](https://github.com/buildwithkode/nodepress).
- **For platforms only:** S3-compatible storage for uploads (Cloudflare R2, DigitalOcean Spaces, AWS S3, Backblaze B2), unless your plan includes a persistent disk.

## How NodePress is put together

Knowing the parts makes the guides easier to follow:

| Part | What it is |
|---|---|
| **Database** | PostgreSQL 14 or newer. Holds all content, users and settings. |
| **API** (`backend/`) | Serves your content (REST, GraphQL) and does the work. Listens on port 3000. |
| **Admin** (`frontend/`) | The admin panel you sign in to. Listens on port 3001 and passes `/api` calls on to the API. |
| **Uploads** | Images and files: on the server's disk, or in S3-compatible storage. |

On a server, the installer runs all of these together with Docker, behind one domain; without Docker, each runs as a service on the server. On a platform, the API and the admin are two services with two addresses, and the database is the platform's own.

## Go-live checklist

Whichever host you chose, check these before you hand the CMS over:

- [ ] The admin opens at `https://` on your domain, with a padlock in the browser.
- [ ] You created the admin account at `/setup`, and you can sign out and back in.
- [ ] **Email works:** under **Settings → Email & storage**, **Send test** arrives. Then invite a teammate from **Users** to be sure.
- [ ] **Uploads survive a restart:** upload an image in **Media**, restart or redeploy, and check it still shows.
- [ ] **Backups run**, and you've kept a copy of the secrets (see your guide).
- [ ] **Brand** is set under **Settings → Brand**, so emails and the login page show your client's name and logo.
- [ ] Each person has their own account with the right role (**Users**), and only the people who need it are admins.

To update NodePress later, see [Upgrading](/deployment/upgrading/).
