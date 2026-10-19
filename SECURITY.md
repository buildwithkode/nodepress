# Security Policy

## Supported versions

Security fixes are released for the latest minor version of NodePress. Upgrade
to the newest release before reporting, if you can.

| Version | Supported |
|---|---|
| 1.6.x (latest) | ✅ |
| < 1.6 | ❌ — upgrade |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately through GitHub: go to the
[Security tab](https://github.com/buildwithkode/nodepress/security) of this
repository and click **Report a vulnerability**. Include:

- the affected version and component (backend API, admin frontend, CLI, Docker setup)
- steps to reproduce, or a proof of concept
- the impact you believe it has

What to expect:

| Step | Target time |
|---|---|
| Acknowledgement | within 3 working days |
| Initial assessment and severity | within 7 days |
| Fix released for critical / high issues | within 30 days |

We will credit you in the release notes unless you prefer otherwise, and we ask
that you give us a chance to release a fix before disclosing publicly.

## Scope

In scope: the NodePress backend, admin frontend, `create-nodepress-app` CLI,
the Docker and nginx configuration in this repository, and the bundled plugins.

Out of scope: vulnerabilities in your own deployment configuration (for
example a weak `JWT_SECRET`, an exposed database, or `CORS_ORIGIN=*`), and
issues that need an already-compromised admin account.

## Hardening checklist for operators

- Use a long random `JWT_SECRET` (the CLI and Docker setup generate one).
- Set `CORS_ORIGIN` to your frontend's exact origin, never `*`.
- Set `TRUST_PROXY` correctly when behind a load balancer or CDN.
- Enable two-factor authentication for every admin account.
- Use `STORAGE_DRIVER=s3` or a persistent volume for uploads.
- Keep NodePress updated; production dependencies are audited on every push.
