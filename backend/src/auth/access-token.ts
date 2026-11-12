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
  /** The user's session version when the token was signed (absent on tokens signed before it existed = 0). */
  sv?: number;
}

export function isAccessTokenPayload(payload: unknown): payload is AccessTokenPayload {
  const p = payload as Record<string, unknown> | null;
  return !!p && typeof p.sub === 'number' && p.purpose === undefined;
}

/**
 * Whether an access token still belongs to the user's current session. A
 * password change or reset, a 2FA change and "sign out everywhere" move
 * `User.sessionVersion` on, which cancels every token signed before. Check it
 * wherever a Bearer token is accepted, after loading the user.
 */
export function isCurrentSession(payload: AccessTokenPayload, user: { sessionVersion?: number | null }): boolean {
  return (payload.sv ?? 0) === (user.sessionVersion ?? 0);
}
