/**
 * JWT_SECRET signs more than access tokens: the 2FA temp token
 * (`purpose: '2fa_pending'`), the OIDC state cookie (`purpose: 'oidc_login'`)
 * and preview tokens (`sub: 'preview'`). Anything that accepts a Bearer token
 * as a login must check it is an access token, or a password alone (via the
 * 2FA temp token) would be enough to sign in.
 */
export interface AccessTokenPayload {
  sub: number;
  email: string;
}

export function isAccessTokenPayload(payload: unknown): payload is AccessTokenPayload {
  const p = payload as Record<string, unknown> | null;
  return !!p && typeof p.sub === 'number' && p.purpose === undefined;
}
