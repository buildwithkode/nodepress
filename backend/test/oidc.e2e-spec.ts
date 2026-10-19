import { INestApplication } from '@nestjs/common';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { generateKeyPairSync, KeyObject } from 'crypto';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin } from './helpers';
import { env } from '../src/config/env';
import { PrismaService } from '../src/prisma/prisma.service';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsonwebtoken = require('jsonwebtoken');

/** Minimal OpenID provider: discovery, JWKS and a token endpoint we script per test. */
function mockProvider() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const state = { issuer: '', idTokenClaims: {} as Record<string, any>, signWith: privateKey as KeyObject, lastTokenBody: '' };
  const server = createServer((req, res) => {
    const url = new URL(req.url!, state.issuer);
    if (url.pathname === '/.well-known/openid-configuration') {
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({
        issuer: state.issuer,
        authorization_endpoint: `${state.issuer}/authorize`,
        token_endpoint: `${state.issuer}/token`,
        jwks_uri: `${state.issuer}/jwks`,
      }));
    }
    if (url.pathname === '/jwks') {
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig', alg: 'RS256' }] }));
    }
    if (url.pathname === '/token' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        state.lastTokenBody = body;
        const id_token = jsonwebtoken.sign(
          { iss: state.issuer, aud: 'np-client', sub: 'u-1', ...state.idTokenClaims },
          state.signWith,
          { algorithm: 'RS256', keyid: 'k1', expiresIn: 300 },
        );
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ access_token: 'at', token_type: 'Bearer', id_token }));
      });
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  return { server, state };
}

describe('Single sign-on via OIDC (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let provider: ReturnType<typeof mockProvider>;
  const saved = { ...env };

  beforeAll(async () => {
    provider = mockProvider();
    await new Promise<void>((r) => provider.server.listen(0, '127.0.0.1', r));
    provider.state.issuer = `http://127.0.0.1:${(provider.server.address() as AddressInfo).port}`;
    Object.assign(env, {
      OIDC_ISSUER: provider.state.issuer,
      OIDC_CLIENT_ID: 'np-client',
      OIDC_CLIENT_SECRET: 'np-secret',
      OIDC_PROVIDER_NAME: 'Acme ID',
      SITE_URL: 'http://admin.test',
      OIDC_AUTO_CREATE: 'false',
      OIDC_ALLOWED_DOMAINS: undefined,
      OIDC_ROLE_CLAIM: undefined,
      OIDC_ROLE_MAP: undefined,
    });
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await cleanDatabase(app);
    await registerAdmin(app, 'admin@acme.test');
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
    Object.assign(env, saved);
    await new Promise((r) => provider.server.close(r));
  });

  /** Run /login → (provider) → /callback; returns the callback redirect. */
  async function signIn(claims: Record<string, any>, opts: { tamperState?: boolean; badNonce?: boolean; returnTo?: string } = {}) {
    const server = app.getHttpServer();
    const start = await request(server).get(`/api/auth/oidc/login${opts.returnTo ? `?returnTo=${encodeURIComponent(opts.returnTo)}` : ''}`).expect(302);
    const auth = new URL(start.headers.location);
    const cookie = start.headers['set-cookie'];
    provider.state.idTokenClaims = { nonce: opts.badNonce ? 'wrong' : auth.searchParams.get('nonce'), ...claims };
    const state = opts.tamperState ? 'forged' : auth.searchParams.get('state');
    return request(server).get(`/api/auth/oidc/callback?code=abc&state=${state}`).set('Cookie', cookie);
  }

  const errorOf = (res: request.Response) => new URL(res.headers.location).searchParams.get('sso_error');

  it('publishes the button config and redirects to the provider with PKCE', async () => {
    const cfg = await request(app.getHttpServer()).get('/api/auth/oidc/config').expect(200);
    expect(cfg.body).toEqual({ enabled: true, providerName: 'Acme ID' });

    const start = await request(app.getHttpServer()).get('/api/auth/oidc/login').expect(302);
    const auth = new URL(start.headers.location);
    expect(auth.origin + auth.pathname).toBe(`${provider.state.issuer}/authorize`);
    expect(auth.searchParams.get('code_challenge_method')).toBe('S256');
    expect(auth.searchParams.get('redirect_uri')).toBe('http://admin.test/api/auth/oidc/callback');
    expect(start.headers['set-cookie'][0]).toMatch(/np_oidc=.*HttpOnly/);
  });

  it('signs an existing user in: callback → one-time code → session', async () => {
    const cb = await signIn({ email: 'Admin@Acme.test', email_verified: true }, { returnTo: '/entries' });
    expect(cb.status).toBe(302);
    const target = new URL(cb.headers.location);
    expect(target.origin + target.pathname).toBe('http://admin.test/sso-callback');
    expect(target.searchParams.get('returnTo')).toBe('/entries');
    const code = new URLSearchParams(target.hash.slice(1)).get('code');
    expect(provider.state.lastTokenBody).toContain('code_verifier=');

    const ex = await request(app.getHttpServer()).post('/api/auth/oidc/exchange').send({ code }).expect(201);
    expect(ex.body.user.email).toBe('admin@acme.test');
    expect(ex.body.access_token).toBeDefined();
    expect(String(ex.headers['set-cookie'])).toContain('np_refresh=');
    await request(app.getHttpServer()).get('/api/auth/me').set('Authorization', `Bearer ${ex.body.access_token}`).expect(200);

    // Single use.
    await request(app.getHttpServer()).post('/api/auth/oidc/exchange').send({ code }).expect(401);
  });

  it('rejects a forged state, a wrong nonce and a token signed by someone else', async () => {
    expect(errorOf(await signIn({ email: 'admin@acme.test' }, { tamperState: true }))).toMatch(/state mismatch/);
    expect(errorOf(await signIn({ email: 'admin@acme.test' }, { badNonce: true }))).toMatch(/nonce/);

    const { privateKey: stranger } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const own = provider.state.signWith;
    provider.state.signWith = stranger;
    expect(errorOf(await signIn({ email: 'admin@acme.test' }))).toMatch(/ID token rejected/);
    provider.state.signWith = own;
  });

  it('rejects a token issued for another client', async () => {
    expect(errorOf(await signIn({ email: 'admin@acme.test', aud: 'someone-else' }))).toMatch(/ID token rejected/);
  });

  it('is invite-only by default, and refuses unverified emails and other domains', async () => {
    expect(errorOf(await signIn({ email: 'stranger@acme.test' }))).toMatch(/ask an admin to invite you/);
    expect(errorOf(await signIn({ email: 'admin@acme.test', email_verified: false }))).toMatch(/not verified/);
    env.OIDC_ALLOWED_DOMAINS = 'other.test';
    expect(errorOf(await signIn({ email: 'admin@acme.test' }))).toMatch(/domain is not allowed/);
    env.OIDC_ALLOWED_DOMAINS = undefined;
  });

  it('auto-creates users with a role mapped from groups when enabled', async () => {
    Object.assign(env, { OIDC_AUTO_CREATE: 'true', OIDC_DEFAULT_ROLE: 'viewer', OIDC_ROLE_CLAIM: 'groups', OIDC_ROLE_MAP: 'cms-editors:editor,cms-admins:admin' });
    await signIn({ email: 'new.editor@acme.test', groups: ['staff', 'cms-editors'] });
    expect((await prisma.user.findUnique({ where: { email: 'new.editor@acme.test' } }))?.role).toBe('editor');

    await signIn({ email: 'plain@acme.test', groups: ['staff'] });
    expect((await prisma.user.findUnique({ where: { email: 'plain@acme.test' } }))?.role).toBe('viewer');

    // Group membership changes are applied on the next sign-in.
    await signIn({ email: 'new.editor@acme.test', groups: ['cms-admins'] });
    expect((await prisma.user.findUnique({ where: { email: 'new.editor@acme.test' } }))?.role).toBe('admin');
    Object.assign(env, { OIDC_AUTO_CREATE: 'false', OIDC_ROLE_CLAIM: undefined, OIDC_ROLE_MAP: undefined });
  });

  it('never redirects off-site after sign-in', async () => {
    const cb = await signIn({ email: 'admin@acme.test' }, { returnTo: '//evil.example/steal' });
    expect(new URL(cb.headers.location).searchParams.get('returnTo')).toBe('/');
  });
});
