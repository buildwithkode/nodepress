---
title: Install on cPanel hosting
description: Run NodePress on shared hosting with cPanel's "Setup Node.js App" — upload the server zip, create the app, finish in the browser.
sidebar:
  order: -1
---

Many hosts with cPanel can run Node.js apps (**Software → Setup Node.js App**, on CloudLinux servers). NodePress runs there from the [server zip](/deployment/deploy-zip/): there's nothing to build or install.

**Check with your host first** that you have:

- **Setup Node.js App** in cPanel, with **Node.js 22** or newer in its version list;
- a **PostgreSQL** database: **PostgreSQL Databases** in cPanel, or a free hosted one from [Supabase](https://supabase.com) or [Neon](https://neon.tech). MySQL won't work;
- enough memory for the app: about 1 GB. Hosts set a memory limit per account; on a low one NodePress is stopped as it starts.

## 1. Create the database

In cPanel, open **PostgreSQL Databases**, create a database and a user, and add the user to the database with all privileges. Note the database name, user name and password: cPanel puts your account name in front of both names, as in `myacct_nodepress`.

Using Supabase or Neon instead? Create a project and copy its connection string (on Supabase, the **Session pooler** string).

## 2. Upload NodePress

1. Download `nodepress-linux-x64.zip` from the [Releases page](https://github.com/buildwithkode/nodepress/releases/latest).
2. In cPanel's **File Manager**, open your home folder (the one that holds `public_html`, not `public_html` itself), **Upload** the zip, then select it and **Extract**.
3. Delete the zip. You now have a `nodepress` folder in your home folder.

NodePress keeps your settings, uploads and plugins in a `nodepress-data` folder next to it, which it creates on the first start. Both stay outside `public_html`, so nothing in them can be opened from the web.

## 3. Create the app

In **Setup Node.js App**, click **Create Application** and fill in:

| Field | Value |
|---|---|
| Node.js version | 22 or newer |
| Application mode | Production |
| Application root | `nodepress` |
| Application URL | The domain or subdomain for NodePress, such as `cms.example.com` |
| Application startup file | `server.js` |

Click **Create**. Don't click **Run NPM Install**: the zip already has everything, built for the server.

## 4. Finish in the browser

Open the application URL. NodePress shows its setup page, which asks for:

1. **The setup code.** In File Manager, open `nodepress-data/setup-code.txt` in your home folder. The code stops anyone else who finds the page first from installing NodePress.
2. **The database.** For a cPanel database: host `localhost`, port `5432`, and the names and password from step 1. For Supabase or Neon, choose **Connection string**, paste it and tick **Requires SSL**. **Test connection** checks it first.
3. **The site address**, filled in from the address bar. Use `https://` once the domain has a certificate (cPanel's **SSL/TLS Status** turns on a free one).

Click **Install NodePress**. It creates the tables and saves the settings, then restarts itself, which can take half a minute. You then create the first admin account. Set up email next under **Settings → Email & storage**.

The settings are in `nodepress-data/.env`. It holds `JWT_SECRET`, which signs logins and encrypts the passwords saved in the admin: download a copy and keep it safe.

## Good to know

- **NodePress sleeps when nobody uses it.** The host stops idle apps after a few minutes and starts them again on the next visit, which then takes a few seconds. While it sleeps, nothing runs in the background: entries scheduled to publish, webhook retries and other background jobs wait until the next request wakes it. If you rely on scheduled publishing, a [VPS](/deployment/deploy-zip/#on-your-own-server-vps) suits better.
- **Restart** in **Setup Node.js App** restarts NodePress. So does **Restart now** in the admin after a plugin or storage change.
- **Uploads** are kept in `nodepress-data/uploads` and count toward your hosting space. To keep them off the account, use [S3-compatible storage](/deployment/storage/).
- **Settings** such as `SMTP_HOST` can be set as environment variables in **Setup Node.js App**, or in `nodepress-data/.env`. Most are easier in the admin.

## Updating

Read the notes for the new version in [UPGRADING.md](https://github.com/buildwithkode/nodepress/blob/main/UPGRADING.md) and back up the database first (cPanel's **Backup** page, or your database provider's).

1. In **Setup Node.js App**, **Stop** the app.
2. In File Manager, rename the `nodepress` folder to `nodepress-old`.
3. Upload and extract the new zip, as in step 2.
4. **Start** the app and open the site. NodePress applies the database updates as it starts.

Your content, uploads and settings are in the database and `nodepress-data`, so they stay as they are. Delete `nodepress-old` once the new version works.

## If something goes wrong

NodePress writes what went wrong to the app's log. Where to find it depends on the host: the log file path in **Setup Node.js App**, or `stderr.log` in the `nodepress` folder. Ask your host if you can't find it.

| Problem | What to do |
|---|---|
| The page shows the host's error page, or "Incomplete response" | NodePress didn't start. Check the log. A message about memory, or nothing at all, usually means the account's memory limit is too low. |
| No Node.js 22 in the version list | Ask your host to add it, or use a [VPS](/deployment/deploy-zip/#on-your-own-server-vps). |
| The setup page says the code is wrong | Open `setup-code.txt` again: every start writes a new code. After 10 wrong codes, restart the app. |
| `This database already has other tables` | Use an empty database for NodePress. |
| Can't connect to a cPanel database | Check that the user was added to the database with all privileges, and use the full names with the account prefix. |
