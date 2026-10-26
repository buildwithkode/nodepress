---
title: Single sign-on (SSO)
description: Let your team sign in to the admin with Google Workspace, Microsoft Entra ID, Okta, Auth0, Keycloak or any OpenID Connect provider.
sidebar:
  order: 6
---

Single sign-on lets people sign in to the admin with their company account instead of a NodePress password. NodePress works with any identity provider that supports **OpenID Connect** (OIDC): Google Workspace, Microsoft Entra ID, Okta, Auth0, Keycloak and others.

When SSO is set up, the login page shows a **Continue with *name*** button next to the password form. Password sign-in keeps working.

SSO is configured with environment variables on the backend. There's no admin screen for it.

## Setting it up

1. **Register NodePress with your provider** as a web application using the authorization code flow. Set its redirect (callback) URL to:

   ```text
   https://<your admin site>/api/auth/oidc/callback
   ```

   That's `SITE_URL` followed by `/api/auth/oidc/callback`, for example `https://cms.example.com/api/auth/oidc/callback`. It goes through the admin's own `/api` proxy, so the sign-in cookie comes back on the same host even when the backend runs elsewhere.

2. **Copy the client ID and client secret** the provider gives you.

3. **Set the variables** in `backend/.env`:

   ```bash title="backend/.env"
   OIDC_ISSUER=https://accounts.google.com
   OIDC_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
   OIDC_CLIENT_SECRET=…
   OIDC_PROVIDER_NAME=Google
   OIDC_ALLOWED_DOMAINS=example.com
   ```

4. **Restart the backend.** The login page now shows **Continue with Google**.

SSO is on as soon as `OIDC_ISSUER`, `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET` are all set. Setting the issuer without the other two stops the server at startup with an error.

## Variables

| Variable | Default | Meaning |
|---|---|---|
| `OIDC_ISSUER` | | The provider's issuer URL. NodePress reads `<issuer>/.well-known/openid-configuration`. |
| `OIDC_CLIENT_ID` | | Client ID from the provider |
| `OIDC_CLIENT_SECRET` | | Client secret from the provider |
| `OIDC_PROVIDER_NAME` | `SSO` | Button label: "Continue with *name*" |
| `OIDC_SCOPES` | `openid email profile` | Scopes to request. Must include `openid` and give NodePress an `email` claim. |
| `OIDC_REDIRECT_URI` | `<SITE_URL>/api/auth/oidc/callback` | Override the callback URL. It must match the provider's setting exactly. |
| `OIDC_ALLOWED_DOMAINS` | any | Comma-separated email domains allowed to sign in, such as `example.com,example.org` |
| `OIDC_AUTO_CREATE` | `false` | `true` creates an account on first sign-in; `false` only lets in people who already have one |
| `OIDC_DEFAULT_ROLE` | `viewer` | Role for accounts created on first sign-in: `admin`, `editor`, `contributor` or `viewer` |
| `OIDC_ROLE_CLAIM` | | ID token claim that holds the user's groups or roles, such as `groups` or `roles` |
| `OIDC_ROLE_MAP` | | Group-to-role mapping, such as `cms-admins:admin,cms-editors:editor` |

Common issuer URLs:

| Provider | `OIDC_ISSUER` |
|---|---|
| Google Workspace | `https://accounts.google.com` |
| Microsoft Entra ID | `https://login.microsoftonline.com/<tenant-id>/v2.0` |
| Okta | `https://<your-org>.okta.com` |
| Auth0 | `https://<your-tenant>.auth0.com` |
| Keycloak | `https://<host>/realms/<realm>` |

## Who can sign in

A person is let in when all of these hold:

- The provider returns an `email` claim, and doesn't mark it unverified (`email_verified: false`).
- When `OIDC_ALLOWED_DOMAINS` is set, the email's domain is in the list.
- A NodePress user with that email exists (matched case-insensitively), **or** `OIDC_AUTO_CREATE=true`.

With auto-create off, sign-in stays invite-only: [invite people](/access-control/users-and-roles/#adding-a-user) first, then they can use either the button or the password they set. Accounts created by SSO get a random password nobody knows, so they sign in through the provider only.

If sign-in fails, the user lands back on the login page with the reason, such as "Your email domain is not allowed to sign in here" or "No account exists for this email — ask an admin to invite you".

## Mapping groups to roles

To manage roles at the provider, set `OIDC_ROLE_CLAIM` to the claim that lists the user's groups and `OIDC_ROLE_MAP` to pairs of `group:role`:

```bash title="backend/.env"
OIDC_ROLE_CLAIM=groups
OIDC_ROLE_MAP=cms-admins:admin,cms-editors:editor,cms-writers:contributor,cms-reviewers:reviewer
```

- The claim can be a single value or a list.
- If a user is in several mapped groups, the highest role wins (`admin` > `editor` > `contributor` > `viewer`). A [custom role](/access-control/users-and-roles/#custom-roles), like `reviewer` above, ranks as the role it's based on.
- The mapped role is applied on **every** sign-in, so the provider is the source of truth: a role an admin changes in NodePress is overwritten at the user's next SSO sign-in.
- A user in none of the mapped groups keeps their current role. A new user in none of them gets `OIDC_DEFAULT_ROLE`.

Make sure your provider actually puts the claim in the ID token; many only do so after you configure it (for example a "groups claim" setting).

## How the flow works

1. **Continue with…** opens `GET /api/auth/oidc/login`. NodePress creates a random state, nonce and PKCE verifier, stores them in a short-lived signed cookie (`np_oidc`, 10 minutes), and redirects to the provider.
2. The provider sends the browser back to `/api/auth/oidc/callback` with a code. NodePress checks the state, exchanges the code (with the PKCE verifier and the client secret), and verifies the ID token: signature against the provider's published keys, issuer, audience, expiry and nonce.
3. NodePress finds or creates the user, then redirects to the admin's `/sso-callback` page with a one-time code in the URL fragment, which browsers never send to servers.
4. The admin swaps that code for a normal session with `POST /api/auth/oidc/exchange`. The code is valid for 60 seconds and works once.

From there, the session is the same as a password sign-in: an access token and the rotating refresh cookie ([Authentication](/access-control/authentication/)). SSO sign-ins are recorded in the [audit log](/access-control/audit-log/).

| Endpoint | What it does |
|---|---|
| `GET /api/auth/oidc/config` | `{ "enabled": true, "providerName": "Google" }`, used by the login page |
| `GET /api/auth/oidc/login?returnTo=/entries` | Starts sign-in. `returnTo` must be a path on the admin site. |
| `GET /api/auth/oidc/callback` | The provider's redirect target |
| `POST /api/auth/oidc/exchange` | `{ code }` → access token and refresh cookie |

## Things to know

- **Signing algorithms.** ID tokens must be signed with an asymmetric algorithm (RS256 and the other RS, PS and ES variants). Tokens signed with a shared secret (HS256) are refused.
- **Two-factor.** SSO users aren't asked for a NodePress 2FA code. Require it at the provider.
- **Several backend instances.** The one-time code from step 3 is kept in the cache. Set `REDIS_URL` so the instance that handles the exchange can find it; see [Scaling](/deployment/scaling/).
- **Signing out** of NodePress doesn't sign the user out of the provider.
