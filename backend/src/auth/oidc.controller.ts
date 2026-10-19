import { Body, Controller, Get, HttpException, Post, Query, Req, Res } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuditService } from '../audit/audit.service';
import { AuthService } from './auth.service';
import { OIDC_COOKIE, OIDC_COOKIE_TTL_MS, OidcService } from './oidc.service';

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const, // must survive the top-level redirect back from the provider
  path: '/api/auth/oidc',
});

@ApiTags('Auth')
@Controller('auth/oidc')
export class OidcController {
  constructor(
    private readonly oidc: OidcService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  @SkipThrottle()
  @Get('config')
  @ApiOperation({ summary: 'Whether SSO is enabled, and the provider name for the login button (public)' })
  config() {
    return this.oidc.publicConfig();
  }

  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Get('login')
  @ApiOperation({ summary: 'Start single sign-on — redirects to the identity provider' })
  async login(@Query('returnTo') returnTo: string | undefined, @Res() res: Response) {
    try {
      const { url, cookie } = await this.oidc.beginLogin(returnTo);
      res.cookie(OIDC_COOKIE, cookie, { ...cookieOptions(), maxAge: OIDC_COOKIE_TTL_MS });
      res.redirect(302, url);
    } catch (err) {
      this.failToLogin(res, err);
    }
  }

  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Get('callback')
  @ApiOperation({ summary: 'Identity provider callback — verifies the sign-in and hands the session to the frontend' })
  async callback(
    @Query() query: { code?: string; state?: string; error?: string },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    res.clearCookie(OIDC_COOKIE, cookieOptions());
    try {
      const { user, returnTo } = await this.oidc.completeLogin(query, req.cookies?.[OIDC_COOKIE]);
      const code = await this.oidc.issueExchangeCode(user.id);
      await this.audit.log({ id: user.id, email: user.email, ip: req.ip }, 'login', 'user', String(user.id), { method: 'sso' });
      // The code travels in the fragment, which browsers never send to a server.
      const target = `${this.oidc.siteUrl()}/sso-callback?returnTo=${encodeURIComponent(returnTo)}#code=${code}`;
      res.redirect(302, target);
    } catch (err) {
      this.failToLogin(res, err);
    }
  }

  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post('exchange')
  @ApiOperation({ summary: 'Swap the one-time SSO code for an access token + refresh cookie' })
  async exchange(@Body('code') code: string, @Res({ passthrough: true }) res: Response) {
    const userId = await this.oidc.redeemExchangeCode(code);
    const user = await this.auth.findUserForSession(userId);
    return this.auth.createSession(user, res);
  }

  /** Back to the login page with a readable reason instead of a JSON error. */
  private failToLogin(res: Response, err: unknown) {
    const message = err instanceof HttpException ? err.message : 'Single sign-on failed';
    if (!(err instanceof HttpException)) console.error('[OIDC]', err);
    res.redirect(302, `${this.oidc.siteUrl()}/login?sso_error=${encodeURIComponent(message)}`);
  }
}
