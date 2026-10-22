import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env } from '../config/env';
import { BrandService } from '../brand/brand.service';
import { PrismaService } from '../prisma/prisma.service';
import { open } from '../common/secret-box';

function transportOptions(config: SmtpConfig, pool: boolean) {
  return {
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.pass ?? '' } : undefined,
    connectionTimeout: 10_000,
    // Pool connections — critical for high-volume form submissions
    ...(pool ? { pool: true, maxConnections: 5, maxMessages: 100 } : {}),
  } as nodemailer.TransportOptions;
}

/** Saved settings (Setting.mail) → SmtpConfig, or null when incomplete. */
export function smtpFromSaved(saved: unknown): SmtpConfig | null {
  const m = saved as Record<string, any> | null | undefined;
  if (!m || typeof m.host !== 'string' || !m.host) return null;
  return {
    host: m.host,
    port: Number(m.port) || 587,
    secure: !!m.secure,
    user: m.user || undefined,
    pass: open(m.pass) ?? undefined,
    from: m.from || undefined,
  };
}

/** Escape HTML so user-submitted form values can't break or inject markup in the email. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

/** Resolve a dot/bracket path (e.g. "address.city", "documents[0].url") against an object. */
function getByPath(obj: unknown, path: string): unknown {
  const parts = path.replace(/\[(\w+)\]/g, '.$1').split('.').filter(Boolean);
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

/** Flatten any value to a readable single string (for plain-text email + interpolation). */
function formatValuePlain(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) {
    const allScalar = v.every((x) => x === null || typeof x !== 'object');
    return allScalar
      ? v.map((x) => String(x ?? '')).join(', ')
      : v.map((x, i) => `#${i + 1} { ${formatValuePlain(x)} }`).join('; ');
  }
  if (typeof v === 'object') {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => `${humanizeKey(k)}: ${formatValuePlain(val)}`)
      .join(', ');
  }
  return String(v);
}

/** Render any value as safe HTML for the email table (nested objects/arrays included). */
function renderValueHtml(v: unknown): string {
  if (v === null || v === undefined || v === '') return '<span style="color:#bbb">—</span>';
  if (Array.isArray(v)) {
    const allScalar = v.every((x) => x === null || typeof x !== 'object');
    if (allScalar) return escapeHtml(v.map((x) => String(x ?? '')).join(', '));
    return v
      .map((x) => `<div style="margin:3px 0;padding-left:8px;border-left:2px solid #eee">${renderValueHtml(x)}</div>`)
      .join('');
  }
  if (typeof v === 'object') {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => `<div><span style="color:#888">${escapeHtml(humanizeKey(k))}:</span> ${renderValueHtml(val)}</div>`)
      .join('');
  }
  return escapeHtml(String(v));
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
/** SMTP settings, from SMTP_* env vars or saved in the admin (Settings → Email & storage). */
export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from?: string;
}

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private config: SmtpConfig | null = null;
  private configSource: 'env' | 'database' | null = null;

  constructor(
    private readonly brand: BrandService,
    @Optional() private readonly prisma?: PrismaService,
  ) { }

  /** True when SMTP is configured (env or admin settings) and the transporter was created */
  get isConfigured(): boolean {
    return this.transporter !== null;
  }

  /** Where the active SMTP settings came from. Env vars always win. */
  get source(): 'env' | 'database' | null {
    return this.configSource;
  }

  onModuleInit() {
    if (env.SMTP_HOST) {
      this.apply(
        { host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE === 'true', user: env.SMTP_USER, pass: env.SMTP_PASS, from: env.SMTP_FROM },
        'env',
      );
      return;
    }
    void this.loadSaved();
  }

  /** Settings saved from the admin — used only when SMTP_HOST isn't set. */
  private async loadSaved() {
    const saved = await this.prisma?.setting.findUnique({ where: { id: 1 }, select: { mail: true } }).catch(() => null);
    const config = smtpFromSaved(saved?.mail);
    if (config) {
      this.apply(config, 'database');
      return;
    }
    this.logger.warn(
      'Email is not configured — password reset, invitation and form emails are skipped. ' +
      'Set it up under Settings → Email & storage, or set SMTP_HOST (and SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM).',
    );
  }

  /** Switch to new admin-saved settings (null turns email off). Ignored while SMTP_* env vars are set. */
  configure(config: SmtpConfig | null) {
    if (this.configSource === 'env') return;
    this.transporter?.close();
    this.transporter = null;
    this.config = null;
    this.configSource = null;
    if (config) this.apply(config, 'database');
  }

  /** Check a server and credentials without saving them. Throws with the SMTP error. */
  static async verify(config: SmtpConfig): Promise<void> {
    const t = nodemailer.createTransport(transportOptions(config, false));
    try {
      await t.verify();
    } finally {
      t.close();
    }
  }

  private apply(config: SmtpConfig, source: 'env' | 'database') {
    this.config = config;
    this.configSource = source;
    this.transporter = nodemailer.createTransport(transportOptions(config, true));

    // Verify connectivity — non-blocking, warn only
    this.transporter.verify().then(() => {
      this.logger.log(`Mail: SMTP connection verified (${config.host}:${config.port}, from ${source})`);
    }).catch((err: Error) => {
      this.logger.warn(
        `Mail: SMTP verify failed — ${err.message}. ` +
        'Emails will fail until the SMTP server is reachable.',
      );
    });
  }

  // ─── Public send methods ───────────────────────────────────────────────────

  /** A short test message — through the running transporter, or a one-off one for unsaved settings. */
  async sendTest(to: string, config?: SmtpConfig): Promise<void> {
    const brandName = (await this.brand.get().catch(() => null))?.brandName ?? 'NodePress';
    const message = {
      to,
      subject: `${brandName}: test email`,
      text: `This is a test email from ${brandName}. Email is working.`,
      html: `<p>This is a test email from <strong>${escapeHtml(brandName)}</strong>. Email is working.</p>`,
    };
    if (!config) return this.send(message, { throwOnError: true });
    const t = nodemailer.createTransport(transportOptions(config, false));
    try {
      await t.sendMail({ ...message, from: config.from || (config.user?.includes('@') ? config.user : `noreply@${config.host}`) });
    } finally {
      t.close();
    }
  }

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
    options: { throwOnError?: boolean } = {},
  ): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`[FormEmail] No SMTP configured — skipping email to ${to}`);
      return;
    }

    // Map each data key to its form label (falling back to a humanized key).
    const labelMap = new Map((fields ?? []).map((f) => [f.name, f.label]));
    const labelFor = (key: string) => labelMap.get(key) || humanizeKey(key);

    // Branding from the install's brand settings (managed at /brand).
    const brand = await this.brand.get();
    const brandName = brand.brandName || 'NodePress';
    const brandColor = brand.brandColor || '#4f46e5';
    // A relative logo (/uploads/...) must be absolute in an email — prefix APP_URL.
    const rawLogo = brand.brandLogoUrl || undefined;
    const logoUrl = rawLogo && rawLogo.startsWith('/')
      ? `${(env.APP_URL || '').replace(/\/$/, '')}${rawLogo}`
      : rawLogo;

    const rows = Object.entries(data)
      .map(
        ([k, v]) =>
          `<tr>
            <td style="padding:10px 14px;font-weight:700;color:#555;white-space:nowrap;border-bottom:1px solid #f0f0f0;vertical-align:top">${escapeHtml(labelFor(k))}</td>
            <td style="padding:10px 14px;color:#1a1a1a;border-bottom:1px solid #f0f0f0">${renderValueHtml(v)}</td>
           </tr>`,
      )
      .join('');

    // Logo if set; otherwise the brand name in light grey on the accent bar.
    const header = logoUrl
      ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(brandName)}" style="max-height:40px;display:inline-block" />`
      : `<span style="color: #e5e5e5;font-size:18px;font-weight:700;letter-spacing:0.2px">${escapeHtml(brandName)}</span>`;

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
      .map(([k, v]) => `${labelFor(k)}: ${formatValuePlain(v)}`)
      .join('\n');

    await this.send({ to, subject, text: textLines, html, replyTo }, options);
  }

  /**
   * Generic low-level send. All public methods funnel through here.
   * Never throws — logs errors only — unless `throwOnError` is set (queued
   * jobs use it so a failed send is retried).
   */
  async send(options: {
    to: string;
    subject: string;
    text: string;
    html: string;
    replyTo?: string;
  }, { throwOnError = false }: { throwOnError?: boolean } = {}): Promise<void> {
    if (!this.transporter) return;

    const cfg = this.config!;
    const from = cfg.from || (cfg.user?.includes('@')
      ? `NodePress <${cfg.user}>`
      : `noreply@${cfg.host}`);

    try {
      const info = await this.transporter.sendMail({
        from,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        replyTo: options.replyTo,
      });
      this.logger.log(`Mail sent → ${options.to} | subject: "${options.subject}" | id: ${info.messageId}`);
    } catch (err: any) {
      // Never throw — a failed email must not break the caller's response
      this.logger.error(`Mail send failed → ${options.to} | ${err?.message ?? err}`);
      if (throwOnError) throw err;
    }
  }

  /**
   * Interpolate {{field}} tokens in a template string with submission data.
   * Supports nested dot/bracket paths, e.g. {{address.city}} or {{documents[0].url}}.
   * Arrays/objects are flattened to a readable string; unknown tokens are left intact.
   */
  static interpolate(template: string, data: Record<string, unknown>): string {
    return template.replace(/\{\{\s*([\w.[\]]+)\s*\}\}/g, (_, path) => {
      const val = getByPath(data, path);
      return val === undefined ? `{{${path}}}` : formatValuePlain(val);
    });
  }
}
