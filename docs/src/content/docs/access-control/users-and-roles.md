---
title: Users and roles
description: Invite teammates, give them a built-in or custom role, and understand what each role can do in the admin and the API.
sidebar:
  order: 1
---

Everyone who signs in to the admin is a **user** with exactly one **role**. The role decides which parts of the admin they can open and what they can do with content. NodePress has four built-in roles, and you can add custom roles based on them.

Only admins can manage users and roles.

## Adding a user

Onboarding is invite-only. You never set a password for someone else.

1. Open **Users** and fill in **Add User**: an email address and a role.
2. Click **Send Invite**.
3. The user gets a "Set your password" email with a link to `/reset-password`. They choose their own password there and can then sign in.

<!-- screenshot: Users page with the Add User card and the Team Members list -->

The invite link is valid for 7 days. Sending a new invite (the **Send invitation email** button on a user's row) makes any earlier link stop working.

:::note[No email server yet?]
When SMTP isn't configured, NodePress can't send the invite. The admin copies the invite link to your clipboard instead, so you can send it yourself. Outside production (`NODE_ENV` not `production`), the link is always returned this way, even when email works. Configure email under **Settings → Email & storage** or with `SMTP_*` variables; see [Email](/deployment/email/).
:::

The same thing through the API (admin JWT):

```bash
curl -X POST https://cms.example.com/api/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "email": "sam@example.com", "role": "editor" }'
```

```json
{
  "id": 4,
  "email": "sam@example.com",
  "role": "editor",
  "createdAt": "2026-10-26T09:00:00.000Z",
  "updatedAt": "2026-10-26T09:00:00.000Z",
  "invited": true,
  "inviteUrl": "https://cms.example.com/reset-password?token=…"
}
```

`role` defaults to `editor`. It can be a built-in role or the name of an existing custom role; an unknown role is refused with `400`. An email that's already registered gets `409`. `inviteUrl` is only present when the link wasn't (or couldn't be) emailed, as described above.

## Changing and removing users

On the **Users** page an admin can change a user's role from the role dropdown on their row, or delete the user.

- The change applies on the user's next request. Their existing login stays valid.
- You can't delete your own account.
- You can't delete or demote the **last admin**. Promote someone else first.
- Deleting a user stops their login tokens from working right away.

## Built-in roles

| Role | What it's for |
|---|---|
| `admin` | Full access, including users, roles, permissions, settings, API keys, webhooks, plugins and the audit log |
| `editor` | Creates, edits, publishes and deletes content |
| `contributor` | Creates and edits content; cannot publish or delete |
| `viewer` | Read-only access to the admin |

What each role can do with content:

| | admin | editor | contributor | viewer |
|---|:---:|:---:|:---:|:---:|
| Read entries in the admin | ✓ | ✓ | ✓ | ✓ |
| Create and edit entries | ✓ | ✓ | ✓ | |
| Submit entries for review | ✓ | ✓ | ✓ | |
| Publish entries | ✓ | ✓ | | |
| Delete entries, restore from trash | ✓ | ✓ | | |
| Bulk publish, archive, stage and delete | ✓ | ✓ | | |
| Entry import/export | ✓ | ✓ | | |
| Releases | ✓ | ✓ | | |
| Upload and delete media | ✓ | ✓ | | |
| Forms and their submissions | ✓ | ✓ | | |
| Permanently delete from trash | ✓ | | | |
| Create or change content types and components | ✓ | | | |

A contributor's way to get content published is to submit it for review. In the editor that's moving the entry to `pending_review`; an editor or admin then publishes it. See [Entries](/content/entries/).

Two layers decide what a non-admin can do:

1. **The role** opens or closes whole features. A contributor can never delete an entry or use bulk actions, whatever the permissions say.
2. **Content permissions** narrow that down per content type: an editor who may only publish `blog` posts, a contributor who can't touch `pages`. See [Permissions](/access-control/permissions/).

Admins bypass content permissions and [field access rules](/access-control/field-access/) entirely.

## Custom roles

A custom role is a named role, such as `reviewer` or `blog_editor`, with its own content permissions. It is **based on** one of `editor`, `contributor` or `viewer` (never `admin`):

- The base role decides which parts of the admin it can open. A `blog_editor` based on `editor` sees the same pages and buttons as an editor.
- Its content permissions are its own. A new custom role starts with exactly its base role's permissions on every content type; you then narrow them on the permissions page.

To create one, open **Users → Roles** and click **New role**.

| Field | Meaning |
|---|---|
| **Label** | The name people see, such as "Blog editor" |
| **Name** | The stored name, in `snake_case` (`blog_editor`). Users and permissions refer to it, so it can't be changed later. |
| **Based on** | `editor`, `contributor` or `viewer` |
| **Description** | Optional, what the role is for |

<!-- screenshot: Roles page listing built-in and custom roles with user counts -->

Then assign the role to users like any other, and adjust its access under **Edit permissions**.

- **Changing the base role** changes which parts of the admin the role can open. If you never customized the role's default permissions, they switch to the new base role's defaults. If you did, they're kept, and the admin tells you so.
- **Deleting a role** is refused while users still have it (`409`, with the number of users). Give them another role first. The role's permission rows are deleted with it.
- If a custom role is deleted out from under a user (for example directly in the database), that user is treated as a `viewer`.
- Built-in roles can't be changed or deleted, and a custom role can't use a built-in name.

### Roles API

All routes need an admin JWT.

| Method | Path | Body | What it does |
|---|---|---|---|
| `GET` | `/api/roles` | | Built-in roles (`builtIn: true`) then custom roles, each with `userCount` |
| `POST` | `/api/roles` | `{ name, label, baseRole, description? }` | Creates a custom role |
| `PUT` | `/api/roles/:name` | `{ label?, baseRole?, description? }` | Updates a custom role; the response has `warnings` when customized permissions were kept |
| `DELETE` | `/api/roles/:name` | | Deletes a custom role, or `409` while it's assigned |

### Users API

| Method | Path | Who | What it does |
|---|---|---|---|
| `GET` | `/api/users` | admin | Lists users (`id`, `email`, `role`, `createdAt`, `updatedAt`) |
| `POST` | `/api/users` | admin | Invites a user: `{ email, role? }` |
| `PUT` | `/api/users/:id/role` | admin | Changes a user's role: `{ role }` |
| `POST` | `/api/users/:id/invite` | admin | Sends a new invite link |
| `DELETE` | `/api/users/:id` | admin | Deletes a user |
| `PUT` | `/api/users/me/password` | any signed-in user | Changes your own password: `{ currentPassword, newPassword }` (at least 8 characters) |

## Single sign-on users

With [SSO](/access-control/sso/), users can also be created on their first sign-in, and their role can follow their groups at the identity provider.
