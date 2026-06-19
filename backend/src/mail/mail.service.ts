import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env } from '../config/env';
import { BrandService } from '../brand/brand.service';

/** Escape HTML so user-submitted form values can't break or inject markup in the email. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Pick a legible header text colour (dark or white) for a given hex background.
 * Keeps the brand name readable when the accent colour is light (e.g. white,
 * yellow) instead of always-white. Uses perceptual luminance.
 */
function contrastText(hex: string): string {
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex || '');
  if (!m) return '#ffffff';
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1a1a1a' : '#ffffff';
}

/** Turn a field key into a human label when the form didn't supply one. e.g. "full_name" → "Full Name". */
function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * MailService — singleton email sender for the entire application.
 *
 * Design decisions:
 * - ONE transporter created at module init, reused for every send (connection pooling).
 * - Uses the Zod-validated `env` object — never reads process.env directly.
 * - When SMTP_HOST is not set, all sends are no-ops with a WARN log. No crash.
 * - On module init, runs transporter.verify() in non-blocking mode: logs WARN on
 *   failure but never prevents startup. SMTP may become available after boot.
 * - Never throws from send methods — callers must not depend on email delivery.
 * - Template strings use {{key}} interpolation matching the forms action convention.
 *
 * SMTP env variables (all optional — see backend/.env.example):
 *   SMTP_HOST    hostname of the SMTP server
 *   SMTP_PORT    port (default 587)
 *   SMTP_SECURE  'true' for TLS (port 465), 'false' for STARTTLS (default)
 *   SMTP_USER    auth username
 *   SMTP_PASS    auth password
 *   SMTP_FROM    from address, e.g. "NodePress <noreply@example.com>"
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly brand: BrandService) {}

  /** True when SMTP_HOST is configured and the transporter was created successfully */
  get isConfigured(): boolean {
    return this.transporter !== null;
  }

  onModuleInit() {
    if (!env.SMTP_HOST) {
      this.logger.warn(
        'SMTP_HOST is not set — email sending is disabled. ' +
        'Password reset emails and form submission emails will be skipped. ' +
        'Set SMTP_HOST (and optionally SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM) to enable.',
      );
      return;
    }

    this.transporter = nodemailer.createTransport({
      host:   env.SMTP_HOST,
      port:   env.SMTP_PORT,
      secure: env.SMTP_SECURE === 'true',
      auth:   env.SMTP_USER
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' }
        : undefined,
      // Pool connections — critical for high-volume form submissions
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
    });

    // Verify connectivity at startup — non-blocking, warn only
    this.transporter.verify().then(() => {
      this.logger.log(`Mail: SMTP connection verified (${env.SMTP_HOST}:${env.SMTP_PORT})`);
    }).catch((err: Error) => {
      this.logger.warn(
        `Mail: SMTP verify failed — ${err.message}. ` +
        'Emails will fail until the SMTP server is reachable.',
      );
    });
  }

  // ─── Public send methods ───────────────────────────────────────────────────

  /**
   * Send a password-reset email.
   * Called by AuthService.forgotPassword(). Silently no-ops if SMTP is not configured.
   */
  async sendPasswordReset(to: string, resetUrl: string): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`[PasswordReset] No SMTP configured — reset URL for ${to}: ${resetUrl}`);
      return;
    }

    await this.send({
      to,
      subject: 'Reset your NodePress password',
      text: `Reset link (expires in 15 minutes):\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#1a1a1a">Reset your password</h2>
          <p style="color:#555">This link expires in 15 minutes.</p>
          <p style="margin:24px 0">
            <a href="${resetUrl}" style="background:#111;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">
              Reset Password
            </a>
          </p>
          <p style="color:#999;font-size:13px">
            If you did not request this, you can safely ignore this email.
            <br>Link: <a href="${resetUrl}" style="color:#999">${resetUrl}</a>
          </p>
        </div>`,
    });
  }

  /**
   * Send a team invitation email.
   * Called by UsersService.sendInvitation(). Uses the same password-reset flow
   * under the hood — the link lets the invitee set their own password.
   * Silently no-ops if SMTP is not configured.
   */
  async sendInvitation(to: string, setPasswordUrl: string, invitedByEmail: string): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`[Invitation] No SMTP configured — invite URL for ${to}: ${setPasswordUrl}`);
      return;
    }

    await this.send({
      to,
      subject: `You've been invited to NodePress`,
      text:
        `${invitedByEmail} has invited you to join NodePress as a team member.\n\n` +
        `Set your password here (link expires in 15 minutes):\n\n${setPasswordUrl}\n\n` +
        `If you were not expecting this, you can ignore this email.`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#1a1a1a">You've been invited to NodePress</h2>
          <p style="color:#555">
            <strong>${invitedByEmail}</strong> has added you as a team member.
            Click the button below to set your password and get started.
          </p>
          <p style="color:#888;font-size:13px">This link expires in 15 minutes.</p>
          <p style="margin:24px 0">
            <a href="${setPasswordUrl}"
               style="background:#111;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">
              Set Your Password
            </a>
          </p>
          <p style="color:#999;font-size:13px">
            If you were not expecting this invitation you can safely ignore this email.
            <br>Link: <a href="${setPasswordUrl}" style="color:#999">${setPasswordUrl}</a>
          </p>
        </div>`,
    });
  }

  /**
   * Send a form submission notification email.
   * Called by EmailActionHandler. Subject supports {{field}} interpolation.
   * Silently no-ops if SMTP is not configured.
   */
  async sendFormSubmission(
    to: string,
    subject: string,
    data: Record<string, unknown>,
    replyTo?: string,
    fields?: { name: string; label?: string }[],
  ): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`[FormEmail] No SMTP configured — skipping email to ${to}`);
      return;
    }

    // Map each data key to its form label (falling back to a humanized key).
    const labelMap = new Map((fields ?? []).map((f) => [f.name, f.label]));
    const labelFor = (key: string) => labelMap.get(key) || humanizeKey(key);

    // Branding from the install's brand settings (managed at /brand).
    const brand      = await this.brand.get();
    const brandName  = brand.brandName || 'NodePress';
    const brandColor = brand.brandColor || '#4f46e5';
    // A relative logo (/uploads/...) must be absolute in an email — prefix APP_URL.
    const rawLogo    = brand.brandLogoUrl || undefined;
    const logoUrl    = rawLogo && rawLogo.startsWith('/')
      ? `${(env.APP_URL || '').replace(/\/$/, '')}${rawLogo}`
      : rawLogo;

    const rows = Object.entries(data)
      .map(
        ([k, v]) =>
          `<tr>
            <td style="padding:10px 14px;font-weight:600;color:#555;white-space:nowrap;border-bottom:1px solid #f0f0f0;vertical-align:top">${escapeHtml(labelFor(k))}</td>
            <td style="padding:10px 14px;color:#1a1a1a;border-bottom:1px solid #f0f0f0">${escapeHtml(String(v ?? ''))}</td>
           </tr>`,
      )
      .join('');

    // Header text colour adapts to the brand colour so the name stays legible
    // (bold white on dark accents, bold dark on light accents).
    const headerText = contrastText(brandColor);
    const header = logoUrl
      ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(brandName)}" style="max-height:40px;display:inline-block" />`
      : `<span style="color:${headerText};font-size:18px;font-weight:700;letter-spacing:0.2px">${escapeHtml(brandName)}</span>`;

    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e5e5;border-radius:10px;overflow:hidden">
        <div style="background:${escapeHtml(brandColor)};padding:20px 24px;text-align:center">${header}</div>
        <div style="padding:24px">
          <h2 style="color:#1a1a1a;margin:0 0 16px;font-size:18px">${escapeHtml(subject)}</h2>
          <table style="width:100%;border-collapse:collapse;border:1px solid #e5e5e5;border-radius:6px;overflow:hidden">
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div style="padding:14px 24px;background:#fafafa;border-top:1px solid #f0f0f0">
          <p style="color:#999;font-size:12px;margin:0">Sent by ${escapeHtml(brandName)} form submission</p>
        </div>
      </div>`;

    const textLines = Object.entries(data)
      .map(([k, v]) => `${labelFor(k)}: ${String(v ?? '')}`)
      .join('\n');

    await this.send({ to, subject, text: textLines, html, replyTo });
  }

  /**
   * Generic low-level send. All public methods funnel through here.
   * Never throws — logs errors only.
   */
  async send(options: {
    to: string;
    subject: string;
    text: string;
    html: string;
    replyTo?: string;
  }): Promise<void> {
    if (!this.transporter) return;

    const from = env.SMTP_FROM ?? (env.SMTP_USER
      ? `NodePress <${env.SMTP_USER}>`
      : `noreply@${env.SMTP_HOST}`);

    try {
      const info = await this.transporter.sendMail({
        from,
        to:      options.to,
        subject: options.subject,
        text:    options.text,
        html:    options.html,
        replyTo: options.replyTo,
      });
      this.logger.log(`Mail sent → ${options.to} | subject: "${options.subject}" | id: ${info.messageId}`);
    } catch (err: any) {
      // Never throw — a failed email must not break the caller's response
      this.logger.error(`Mail send failed → ${options.to} | ${err?.message ?? err}`);
    }
  }

  /** Interpolate {{field_name}} tokens in a template string with submission data */
  static interpolate(template: string, data: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
      data[key] !== undefined ? String(data[key]) : `{{${key}}}`,
    );
  }
}
