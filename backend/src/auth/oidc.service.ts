import { BadRequestException, ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, createPublicKey, randomBytes, KeyObject } from 'crypto';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { AppCacheService } from '../cache/app-cache.service';

/** Signed into the short-lived np_oidc cookie between /login and /callback. */
interface PendingLogin {
  purpose: 'oidc_login';
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
}

interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

export interface OidcIdentity {
  email: string;
  claims: Record<string, any>;
}

export const OIDC_COOKIE = 'np_oidc';
export const OIDC_COOKIE_TTL_MS = 10 * 60 * 1000;
const DISCOVERY_TTL_MS = 60 * 60 * 1000;
const JWKS_TTL_MS = 60 * 60 * 1000;
const EXCHANGE_CODE_TTL_MS = 60_000;
const ROLES = ['admin', 'editor', 'contributor', 'viewer'] as const;
const ROLE_RANK: Record<string, number> = { viewer: 0, contributor: 1, editor: 2, admin: 3 };
const ID_TOKEN_ALGORITHMS = ['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512', 'ES256', 'ES384', 'ES512'];
const TIMEOUT_MS = 10_000;

const b64url = (buf: Buffer) => buf.toString('base64url');

/** Only same-site paths are allowed as a post-login destination (no open redirect). */
export function safeReturnTo(raw: unknown): string {
  const v = typeof raw === 'string' ? raw : '';
  return v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\') ? v : '/';
}

/** Highest role granted by the role claim through OIDC_ROLE_MAP ("group:role,…"), or null. */
export function mapRole(claims: Record<string, any>, claim?: string, map?: string): string | null {
  if (!claim || !map) return null;
  const raw = claims[claim];
  const values: string[] = Array.isArray(raw) ? raw.map(String) : raw != null ? [String(raw)] : [];
  let best: string | null = null;
  for (const pair of map.split(',')) {
    const [group, role] = pair.split(':').map((s) => s.trim());
    if (!group || !(ROLES as readonly string[]).includes(role)) continue;
    if (values.includes(group) && (best === null || ROLE_RANK[role] > ROLE_RANK[best])) best = role;
  }
  return best;
}

/**
 * Single sign-on with any OpenID Connect provider (authorization code + PKCE).
 *
 * 1. /api/auth/oidc/login   — state, nonce and PKCE verifier go into a signed,
 *    HttpOnly, 10-minute cookie; the browser is sent to the provider.
 * 2. /api/auth/oidc/callback — state is checked against the cookie, the code is
 *    exchanged, and the ID token is verified (JWKS signature, iss, aud, exp,
 *    nonce). The user is matched by verified email; unknown users are only
 *    created when OIDC_AUTO_CREATE=true.
 * 3. The browser is redirected to the frontend with a one-time code in the URL
 *    fragment (never sent to servers or logged), which /exchange swaps for the
 *    normal access token + refresh cookie.
 */
@Injectable()
export class OidcService {
  private readonly logger = new Logger(OidcService.name);
  private discovery?: { value: Discovery; at: number };
  private jwks?: { keys: Map<string, KeyObject>; list: KeyObject[]; at: number };

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly cache: AppCacheService,
  ) {}

  get enabled(): boolean {
    return !!(env.OIDC_ISSUER && env.OIDC_CLIENT_ID && env.OIDC_CLIENT_SECRET);
  }

  publicConfig() {
    return { enabled: this.enabled, providerName: this.enabled ? env.OIDC_PROVIDER_NAME : null };
  }

  /**
   * The callback goes through the admin site's own /api proxy (Next rewrites
   * or nginx) by default — the same host the login started on, so the
   * HttpOnly np_oidc cookie comes back with it even when the backend is on
   * another host. Register exactly this URL with the provider.
   */
  redirectUri(): string {
    if (env.OIDC_REDIRECT_URI) return env.OIDC_REDIRECT_URI;
    const site = this.siteUrl();
    if (site) return `${site}/api/auth/oidc/callback`;
    const base = (env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
    return base.endsWith('/api') ? `${base}/auth/oidc/callback` : `${base}/api/auth/oidc/callback`;
  }

  /** Where the frontend lives (the callback hands the session over there). */
  siteUrl(): string {
    return (env.SITE_URL || env.CORS_ORIGIN?.split(',')[0] || '').replace(/\/+$/, '');
  }

  /** Build the provider redirect and the signed cookie value. */
  async beginLogin(returnTo: unknown): Promise<{ url: string; cookie: string }> {
    this.assertEnabled();
    const d = await this.getDiscovery();
    const pending: PendingLogin = {
      purpose: 'oidc_login',
      state: b64url(randomBytes(24)),
      nonce: b64url(randomBytes(24)),
      verifier: b64url(randomBytes(48)),
      returnTo: safeReturnTo(returnTo),
    };
    const challenge = b64url(createHash('sha256').update(pending.verifier).digest());
    const url = new URL(d.authorization_endpoint);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: env.OIDC_CLIENT_ID!,
      redirect_uri: this.redirectUri(),
      scope: env.OIDC_SCOPES,
      state: pending.state,
      nonce: pending.nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }).toString();
    const cookie = this.jwt.sign(pending, { expiresIn: Math.floor(OIDC_COOKIE_TTL_MS / 1000) });
    return { url: url.toString(), cookie };
  }

  /** Validate the callback, verify the ID token and find/create the user. */
  async completeLogin(query: { code?: string; state?: string; error?: string }, cookie: string | undefined) {
    this.assertEnabled();
    if (query.error) throw new UnauthorizedException(`Sign-in was cancelled or refused (${String(query.error).slice(0, 60)})`);
    if (!cookie) throw new UnauthorizedException('Sign-in session expired — please try again');

    let pending: PendingLogin;
    try {
      pending = this.jwt.verify<PendingLogin>(cookie);
    } catch {
      throw new UnauthorizedException('Sign-in session expired — please try again');
    }
    if (pending.purpose !== 'oidc_login' || !query.state || query.state !== pending.state || !query.code) {
      throw new UnauthorizedException('Sign-in could not be verified (state mismatch) — please try again');
    }

    const idToken = await this.exchangeCode(query.code, pending.verifier);
    const identity = await this.verifyIdToken(idToken, pending.nonce);
    const user = await this.resolveUser(identity);
    return { user, returnTo: pending.returnTo };
  }

  /** One-time code for the frontend; swapped for a session by /exchange. */
  async issueExchangeCode(userId: number): Promise<string> {
    const code = b64url(randomBytes(32));
    await this.cache.set(`oidc:code:${code}`, { userId }, EXCHANGE_CODE_TTL_MS);
    return code;
  }

  async redeemExchangeCode(code: unknown): Promise<number> {
    if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{20,}$/.test(code)) throw new UnauthorizedException('Invalid sign-in code');
    const key = `oidc:code:${code}`;
    const entry = await this.cache.get<{ userId: number }>(key);
    await this.cache.del(key); // single use
    if (!entry) throw new UnauthorizedException('Sign-in code expired or already used — please sign in again');
    return entry.userId;
  }

  // ── internals ───────────────────────────────────────────────────────────────

  private assertEnabled() {
    if (!this.enabled) throw new BadRequestException('Single sign-on is not configured');
  }

  private async fetchJson(url: string, init?: RequestInit): Promise<any> {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = await res.text();
    let body: any;
    try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 200) }; }
    if (!res.ok) {
      this.logger.warn(`OIDC request to ${new URL(url).host} failed: HTTP ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
      throw new UnauthorizedException('The identity provider rejected the sign-in');
    }
    return body;
  }

  private async getDiscovery(): Promise<Discovery> {
    if (this.discovery && Date.now() - this.discovery.at < DISCOVERY_TTL_MS) return this.discovery.value;
    const issuer = env.OIDC_ISSUER!.replace(/\/+$/, '');
    const d = await this.fetchJson(`${issuer}/.well-known/openid-configuration`);
    if (!d.authorization_endpoint || !d.token_endpoint || !d.jwks_uri) {
      throw new UnauthorizedException('The identity provider returned an incomplete configuration');
    }
    this.discovery = { value: d, at: Date.now() };
    return d;
  }

  private async exchangeCode(code: string, verifier: string): Promise<string> {
    const d = await this.getDiscovery();
    const basic = Buffer.from(`${encodeURIComponent(env.OIDC_CLIENT_ID!)}:${encodeURIComponent(env.OIDC_CLIENT_SECRET!)}`).toString('base64');
    const body = await this.fetchJson(d.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}`, Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri(),
        code_verifier: verifier,
        // Some providers only read the client from the body (client_secret_post).
        client_id: env.OIDC_CLIENT_ID!,
        client_secret: env.OIDC_CLIENT_SECRET!,
      }).toString(),
    });
    if (!body.id_token) throw new UnauthorizedException('The identity provider did not return an ID token');
    return body.id_token;
  }

  private async signingKey(kid: string | undefined, forceReload = false): Promise<KeyObject> {
    const load = async () => {
      const d = await this.getDiscovery();
      const jwks = await this.fetchJson(d.jwks_uri);
      const keys = new Map<string, KeyObject>();
      const list: KeyObject[] = [];
      for (const jwk of jwks.keys ?? []) {
        if (jwk.use && jwk.use !== 'sig') continue;
        try {
          const key = createPublicKey({ key: jwk, format: 'jwk' });
          list.push(key);
          if (jwk.kid) keys.set(jwk.kid, key);
        } catch { /* skip unsupported key types */ }
      }
      this.jwks = { keys, list, at: Date.now() };
    };
    if (forceReload || !this.jwks || Date.now() - this.jwks.at > JWKS_TTL_MS) await load();
    let key = kid ? this.jwks!.keys.get(kid) : this.jwks!.list.length === 1 ? this.jwks!.list[0] : undefined;
    if (!key && kid) {
      await load(); // the provider may have rotated its keys
      key = this.jwks!.keys.get(kid);
    }
    if (!key) throw new UnauthorizedException('ID token signed with an unknown key');
    return key;
  }

  private async verifyIdToken(idToken: string, nonce: string): Promise<OidcIdentity> {
    const header = this.jwt.decode(idToken, { complete: true }) as { header?: { kid?: string; alg?: string } } | null;
    if (!header?.header?.alg || !ID_TOKEN_ALGORITHMS.includes(header.header.alg)) {
      throw new UnauthorizedException('ID token uses an unsupported algorithm');
    }
    const d = await this.getDiscovery();
    const verify = async (key: KeyObject) =>
      this.jwt.verifyAsync(idToken, {
        // Must be `secret`: @nestjs/jwt prefers the module's JWT_SECRET over a
        // per-call `publicKey`, but a per-call `secret` wins.
        secret: key as any,
        algorithms: ID_TOKEN_ALGORITHMS as any,
        audience: env.OIDC_CLIENT_ID,
        issuer: d.issuer,
        clockTolerance: 60,
      } as any);
    let claims: Record<string, any>;
    try {
      try {
        claims = await verify(await this.signingKey(header.header.kid));
      } catch (err: any) {
        // A key rotated under the same kid: refresh the JWKS once and retry.
        if (err?.message !== 'invalid signature') throw err;
        claims = await verify(await this.signingKey(header.header.kid, true));
      }
    } catch (err: any) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException(`ID token rejected: ${err?.message ?? 'invalid'}`);
    }
    if (claims.nonce !== nonce) throw new UnauthorizedException('ID token nonce mismatch');

    const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
    if (!email) throw new ForbiddenException('Your identity provider did not share an email address');
    if (claims.email_verified === false || claims.email_verified === 'false') {
      throw new ForbiddenException('Your email address is not verified with the identity provider');
    }
    const allowed = (env.OIDC_ALLOWED_DOMAINS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (allowed.length && !allowed.includes(email.split('@')[1])) {
      throw new ForbiddenException('Your email domain is not allowed to sign in here');
    }
    return { email, claims };
  }

  private async resolveUser({ email, claims }: OidcIdentity) {
    const mapped = mapRole(claims, env.OIDC_ROLE_CLAIM, env.OIDC_ROLE_MAP);
    let user = await this.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });

    if (!user) {
      if (env.OIDC_AUTO_CREATE !== 'true') {
        throw new ForbiddenException('No account exists for this email — ask an admin to invite you');
      }
      // Random unusable password: SSO users sign in through the provider.
      const password = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
      user = await this.prisma.user.create({
        data: { email, password, role: mapped ?? env.OIDC_DEFAULT_ROLE },
      });
      this.logger.log(`SSO created user ${email} (${user.role})`);
    } else if (mapped && mapped !== user.role) {
      // The provider's groups are the source of truth once role mapping is set.
      user = await this.prisma.user.update({ where: { id: user.id }, data: { role: mapped } });
      this.logger.log(`SSO updated role of ${email} to ${mapped}`);
    }
    return user;
  }
}
