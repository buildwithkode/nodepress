import { Injectable, Logger } from '@nestjs/common';
import { env } from '../config/env';

/**
 * CaptchaService — verifies captcha tokens server-side.
 *
 * Supports three providers, all share the same verify-token pattern:
 *   - Cloudflare Turnstile  (recommended — privacy-preserving, no user friction)
 *   - hCaptcha
 *   - Google reCAPTCHA v2 / v3
 *
 * Enable by setting CAPTCHA_PROVIDER + CAPTCHA_SECRET_KEY in backend/.env.
 * When not configured, verify() always returns true (no-op).
 *
 * Per-form opt-in: set captchaEnabled=true on a Form record.
 * When a form has captchaEnabled=true and no provider is configured, the
 * submission is still accepted (fail-open — avoids breaking forms in dev).
 */
@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);

  /** Verification endpoints for each provider. */
  private static readonly VERIFY_URLS: Record<string, string> = {
    turnstile: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    hcaptcha:  'https://hcaptcha.com/siteverify',
    recaptcha: 'https://www.google.com/recaptcha/api/siteverify',
  };

  get isConfigured(): boolean {
    return !!(env.CAPTCHA_PROVIDER && env.CAPTCHA_SECRET_KEY);
  }

  /**
   * Verify a captcha token from the client.
   *
   * @param token  - The token submitted by the client (`cf-turnstile-response`,
   *                 `h-captcha-response`, or `g-recaptcha-response`)
   * @param remoteIp - Optional client IP for additional verification (reCAPTCHA)
   * @returns true if valid or captcha not configured, false if verification fails.
   */
  async verify(token: string | undefined, remoteIp?: string): Promise<boolean> {
    if (!this.isConfigured) return true;
    if (!token) return false;

    const provider = env.CAPTCHA_PROVIDER!;
    const secret   = env.CAPTCHA_SECRET_KEY!;
    const url      = CaptchaService.VERIFY_URLS[provider];

    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.append('remoteip', remoteIp);

    try {
      const res  = await fetch(url, { method: 'POST', body });
      const json = await res.json() as { success: boolean; score?: number };

      // reCAPTCHA v3 returns a score (0.0–1.0); treat anything below 0.5 as a bot
      if (provider === 'recaptcha' && typeof json.score === 'number') {
        return json.score >= 0.5;
      }

      return json.success === true;
    } catch (err) {
      // Network failure — log and fail-open to avoid blocking legitimate users
      this.logger.warn(`Captcha verification request to ${provider} failed: ${err}`);
      return true;
    }
  }
}
