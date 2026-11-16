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

/** "Mon, 16 Nov 2026 10:05 UTC" — emails go to people in any time zone. */
function formatWhen(when: Date): string {
  return when.toUTCString().replace(/:\d\d GMT$/, ' UTC');
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
/** A form's uploaded file: its name is all an email needs. */
function isUploadedFile(v: unknown): v is { fileId: string; filename: string } {
  const file = v as { fileId?: unknown; filename?: unknown } | null;
  return typeof file === 'object' && file !== null && typeof file.fileId === 'string' && typeof file.filename === 'string';
}

function formatValuePlain(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) {
    const allScalar = v.every((x) => x === null || typeof x !== 'object');
    return allScalar
      ? v.map((x) => String(x ?? '')).join(', ')
      : v.map((x, i) => `#${i + 1} { ${formatValuePlain(x)} }`).join('; ');
  }
  if (typeof v === 'object') {
    if (isUploadedFile(v)) return v.filename;
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
  if (isUploadedFile(v)) return escapeHtml(v.filename);
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
    void this.start();
  }

  /** Pick up SMTP settings (env, else saved). Scripts outside Nest await this before sending. */
  async start(): Promise<void> {
    if (env.SMTP_HOST) {
      this.apply(
        { host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE === 'true', user: env.SMTP_USER, pass: env.SMTP_PASS, from: env.SMTP_FROM },
        'env',
      );
      return;
    }
    await this.loadSaved();
  }

  /** Close pooled connections so a script can exit. */
  close(): void {
    this.transporter?.close();
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
   * Tell someone an admin changed their role. Branded like form emails; replies
   * go to the admin who made the change. Never throws (see send()).
   */
  async sendRoleChanged(details: {
    to: string;
    recipientName: string;
    changedByName: string;
    changedByEmail: string;
    previousRole: string;
    newRole: string;
  }): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`[RoleChanged] No SMTP configured — skipping email to ${details.to}`);
      return;
    }

    const brand = await this.brand.get().catch(() => null);
    const brandName = brand?.brandName || 'NodePress';
    const brandColor = brand?.brandColor || '#4f46e5';
    const appUrl = (env.APP_URL || '').replace(/\/$/, '');
    // A relative logo (/uploads/...) must be absolute in an email — prefix APP_URL.
    const rawLogo = brand?.brandLogoUrl || undefined;
    const logoUrl = rawLogo && rawLogo.startsWith('/') ? `${appUrl}${rawLogo}` : rawLogo;
    // The admin's own address: SITE_URL, or the API's when both are served together.
    const adminUrl = (env.SITE_URL || env.APP_URL || '').replace(/\/$/, '');

    const { to, recipientName, changedByName, changedByEmail, previousRole, newRole } = details;
    const by = changedByName && changedByName !== changedByEmail ? `${changedByName} (${changedByEmail})` : changedByEmail;
    const subject = `Your role on ${brandName} has changed`;

    const header = logoUrl
      ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(brandName)}" style="max-height:40px;display:inline-block" />`
      : `<span style="color: #e5e5e5;font-size:18px;font-weight:700;letter-spacing:0.2px">${escapeHtml(brandName)}</span>`;
    const roleRow = (label: string, value: string, strong: boolean) =>
      `<tr>
        <td style="padding:10px 14px;color:#777;white-space:nowrap;border-bottom:1px solid #f0f0f0;width:1%">${label}</td>
        <td style="padding:10px 14px;color:#1a1a1a;border-bottom:1px solid #f0f0f0;${strong ? 'font-weight:700' : ''}">${escapeHtml(value)}</td>
       </tr>`;

    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e5e5;border-radius:10px;overflow:hidden;background:#ffffff">
        <div style="background:${escapeHtml(brandColor)};padding:20px 24px;text-align:center">${header}</div>
        <div style="padding:24px;color:#333;font-size:15px;line-height:1.5">
          <p style="margin:0 0 12px">Hi ${escapeHtml(recipientName)},</p>
          <p style="margin:0 0 16px"><strong>${escapeHtml(by)}</strong> changed your role on <strong>${escapeHtml(brandName)}</strong>.</p>
          <table style="width:100%;border-collapse:collapse;border:1px solid #e5e5e5;border-radius:6px;overflow:hidden;margin:0 0 16px">
            <tbody>${roleRow('Before', previousRole, false)}${roleRow('Now', newRole, true)}</tbody>
          </table>
          <p style="margin:0 0 20px;color:#555">The change already applies; you don't need to sign in again.</p>
          ${adminUrl ? `<p style="margin:0 0 20px"><a href="${escapeHtml(adminUrl)}" style="background:${escapeHtml(brandColor)};color:#fff;padding:11px 22px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">Open the admin</a></p>` : ''}
          <p style="margin:0;color:#888;font-size:13px">If you didn't expect this, reply to this email or contact ${escapeHtml(changedByName || changedByEmail)}.</p>
        </div>
        <div style="padding:14px 24px;background:#fafafa;border-top:1px solid #f0f0f0">
          <p style="color:#999;font-size:12px;margin:0">Sent by ${escapeHtml(brandName)}</p>
        </div>
      </div>`;

    const text =
      `Hi ${recipientName},\n\n` +
      `${by} changed your role on ${brandName}.\n\n` +
      `Before: ${previousRole}\nNow: ${newRole}\n\n` +
      `The change already applies; you don't need to sign in again.\n` +
      (adminUrl ? `\nOpen the admin: ${adminUrl}\n` : '') +
      `\nIf you didn't expect this, reply to this email or contact ${changedByName || changedByEmail}.`;

    await this.send({ to, subject, text, html, replyTo: changedByEmail || undefined });
  }

  // ─── Account notices (password, two-step sign-in, removal, new admins) ──────

  /** Brand name, colour, header markup and the admin's address, shared by account notices. */
  private async brandParts() {
    const brand = await this.brand.get().catch(() => null);
    const brandName = brand?.brandName || 'NodePress';
    const brandColor = brand?.brandColor || '#4f46e5';
    const appUrl = (env.APP_URL || '').replace(/\/$/, '');
    const rawLogo = brand?.brandLogoUrl || undefined;
    const logoUrl = rawLogo && rawLogo.startsWith('/') ? `${appUrl}${rawLogo}` : rawLogo;
    const adminUrl = (env.SITE_URL || env.APP_URL || '').replace(/\/$/, '');
    const header = logoUrl
      ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(brandName)}" style="max-height:40px;display:inline-block" />`
      : `<span style="color: #e5e5e5;font-size:18px;font-weight:700;letter-spacing:0.2px">${escapeHtml(brandName)}</span>`;
    return { brandName, brandColor, adminUrl, header };
  }

  /**
   * One branded account notice. Every string is plain text and escaped here;
   * `lead` parts marked `bold` are shown in bold.
   */
  private async sendNotice(notice: {
    to: string;
    subject: (brandName: string) => string;
    recipientName: string;
    lead: (brandName: string) => Array<string | { bold: string }>;
    rows?: Array<{ label: string; value: string; strong?: boolean }>;
    paragraphs?: string[];
    button?: { label: string; path: string };
    footnote: string;
    replyTo?: string;
    warning?: boolean;
  }): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`[AccountNotice] No SMTP configured — skipping email to ${notice.to}`);
      return;
    }
    const { brandName, brandColor, adminUrl, header } = await this.brandParts();
    const subject = notice.subject(brandName);
    const lead = notice.lead(brandName);
    const leadHtml = lead.map((p) => (typeof p === 'string' ? escapeHtml(p) : `<strong>${escapeHtml(p.bold)}</strong>`)).join('');
    const leadText = lead.map((p) => (typeof p === 'string' ? p : p.bold)).join('');
    const rows = notice.rows ?? [];
    const rowsHtml = rows.length
      ? `<table style="width:100%;border-collapse:collapse;border:1px solid #e5e5e5;border-radius:6px;overflow:hidden;margin:0 0 16px"><tbody>${rows
          .map((r) => `<tr>
        <td style="padding:10px 14px;color:#777;white-space:nowrap;border-bottom:1px solid #f0f0f0;width:1%">${escapeHtml(r.label)}</td>
        <td style="padding:10px 14px;color:#1a1a1a;border-bottom:1px solid #f0f0f0;${r.strong ? 'font-weight:700' : ''}">${escapeHtml(r.value)}</td>
       </tr>`)
          .join('')}</tbody></table>`
      : '';
    const paragraphs = notice.paragraphs ?? [];
    const buttonUrl = notice.button && adminUrl ? `${adminUrl}${notice.button.path}` : '';
    const buttonColor = notice.warning ? '#dc2626' : brandColor;

    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e5e5;border-radius:10px;overflow:hidden;background:#ffffff">
        <div style="background:${escapeHtml(brandColor)};padding:20px 24px;text-align:center">${header}</div>
        <div style="padding:24px;color:#333;font-size:15px;line-height:1.5">
          <p style="margin:0 0 12px">Hi ${escapeHtml(notice.recipientName)},</p>
          <p style="margin:0 0 16px">${leadHtml}</p>
          ${rowsHtml}
          ${paragraphs.map((p) => `<p style="margin:0 0 16px;color:#555">${escapeHtml(p)}</p>`).join('')}
          ${buttonUrl ? `<p style="margin:4px 0 20px"><a href="${escapeHtml(buttonUrl)}" style="background:${escapeHtml(buttonColor)};color:#fff;padding:11px 22px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">${escapeHtml(notice.button!.label)}</a></p>` : ''}
          <p style="margin:0;color:#888;font-size:13px">${escapeHtml(notice.footnote)}</p>
        </div>
        <div style="padding:14px 24px;background:#fafafa;border-top:1px solid #f0f0f0">
          <p style="color:#999;font-size:12px;margin:0">Sent by ${escapeHtml(brandName)}</p>
        </div>
      </div>`;

    const text =
      `Hi ${notice.recipientName},\n\n${leadText}\n\n` +
      (rows.length ? rows.map((r) => `${r.label}: ${r.value}`).join('\n') + '\n\n' : '') +
      (paragraphs.length ? paragraphs.join('\n\n') + '\n\n' : '') +
      (buttonUrl ? `${notice.button!.label}: ${buttonUrl}\n\n` : '') +
      notice.footnote;

    await this.send({ to: notice.to, subject, text, html, replyTo: notice.replyTo || undefined });
  }

  /** Your password was changed — from Profile or with a reset link. */
  async sendPasswordChanged(d: { to: string; recipientName: string; via: 'profile' | 'reset-link'; when: Date }): Promise<void> {
    await this.sendNotice({
      to: d.to,
      subject: (b) => `Your password on ${b} was changed`,
      recipientName: d.recipientName,
      lead: (b) => ['The password for your account on ', { bold: b }, ' was just changed.'],
      rows: [
        { label: 'Account', value: d.to },
        { label: 'How', value: d.via === 'profile' ? 'From your profile' : 'With a password reset link' },
        { label: 'When', value: formatWhen(d.when) },
      ],
      paragraphs: ['You were signed out on your other devices.'],
      button: { label: "Wasn't you? Reset your password", path: '/forgot-password' },
      footnote: "If you made this change, you don't need to do anything. If you didn't, reset your password now and tell an admin.",
      warning: true,
    });
  }

  /** Two-step sign-in was turned on or off for your account. */
  async sendTwoFactorChanged(d: { to: string; recipientName: string; enabled: boolean; when: Date }): Promise<void> {
    await this.sendNotice({
      to: d.to,
      subject: (b) => `Two-step sign-in was turned ${d.enabled ? 'on' : 'off'} on ${b}`,
      recipientName: d.recipientName,
      lead: (b) => ['Two-step sign-in was turned ', { bold: d.enabled ? 'on' : 'off' }, ' for your account on ', { bold: b }, '.'],
      rows: [
        { label: 'Account', value: d.to },
        { label: 'When', value: formatWhen(d.when) },
      ],
      paragraphs: d.enabled
        ? ['From now on you sign in with your password and a code from your authenticator app. Keep your recovery codes somewhere safe.']
        : ['Your account is now protected by your password alone. We recommend turning two-step sign-in back on from your profile.'],
      button: d.enabled
        ? { label: "Wasn't you? Reset your password", path: '/forgot-password' }
        : { label: 'Turn it back on', path: '/profile' },
      footnote: d.enabled
        ? "If you turned it on, you don't need to do anything. If you didn't, reset your password now and tell an admin."
        : "If you turned it off, you don't need to do anything. If you didn't, reset your password now and tell an admin — someone may have your password.",
      warning: !d.enabled,
    });
  }

  /** The emergency reset tool (npm run reset-password) was run on the server for your account. */
  async sendServerReset(d: { to: string; recipientName: string; twoFactorWasOn: boolean; when: Date }): Promise<void> {
    await this.sendNotice({
      to: d.to,
      subject: (b) => `Your ${b} account was reset from the server`,
      recipientName: d.recipientName,
      lead: (b) => ["Someone with access to the server running ", { bold: b }, ' used the emergency reset tool on your account.'],
      rows: [
        { label: 'Account', value: d.to },
        { label: 'Password', value: 'Replaced' },
        { label: 'Two-step sign-in', value: d.twoFactorWasOn ? 'Turned off' : 'Was already off' },
        { label: 'Role', value: 'Admin' },
        { label: 'Sessions', value: 'Signed out everywhere' },
        { label: 'When', value: formatWhen(d.when) },
      ],
      paragraphs: ['Sign in with the new password, change it from your profile and turn two-step sign-in back on.'],
      button: { label: 'Open your profile', path: '/profile' },
      footnote: "If you didn't ask for this, contact whoever runs the server — someone there can change any account.",
      warning: true,
    });
  }

  /** An admin removed your account. Replies go to that admin. */
  async sendAccountRemoved(d: { to: string; recipientName: string; removedByName: string; removedByEmail: string; when: Date }): Promise<void> {
    const by = d.removedByName && d.removedByName !== d.removedByEmail ? `${d.removedByName} (${d.removedByEmail})` : d.removedByEmail || 'An admin';
    await this.sendNotice({
      to: d.to,
      subject: (b) => `Your account on ${b} was removed`,
      recipientName: d.recipientName,
      lead: (b) => [{ bold: by }, ' removed your account on ', { bold: b }, '.'],
      rows: [
        { label: 'Account', value: d.to },
        { label: 'When', value: formatWhen(d.when) },
      ],
      paragraphs: ["You can no longer sign in. Content you created stays on the site."],
      footnote: `If you think this is a mistake, reply to this email or contact ${d.removedByName || d.removedByEmail || 'an admin'}.`,
      replyTo: d.removedByEmail,
    });
  }

  /** Sent to every admin when someone becomes an admin. */
  async sendNewAdmin(d: {
    to: string;
    recipientName: string;
    newAdminName: string;
    newAdminEmail: string;
    byName: string;
    byEmail: string;
    how: 'invited' | 'promoted' | 'server';
    previousRole?: string;
    when: Date;
  }): Promise<void> {
    const by = d.how === 'server'
      ? 'The emergency reset tool on the server'
      : d.byName && d.byName !== d.byEmail ? `${d.byName} (${d.byEmail})` : d.byEmail || 'An admin';
    const who = d.newAdminName && d.newAdminName !== d.newAdminEmail ? `${d.newAdminName} (${d.newAdminEmail})` : d.newAdminEmail;
    const verb = d.how === 'invited' ? ' invited ' : ' made ';
    const tail = d.how === 'invited' ? ' as an admin on ' : ' an admin on ';
    await this.sendNotice({
      to: d.to,
      subject: (b) => `New admin on ${b}: ${d.newAdminEmail}`,
      recipientName: d.recipientName,
      lead: (b) => [{ bold: by }, verb, { bold: who }, tail, { bold: b }, '.'],
      rows: [
        { label: 'New admin', value: d.newAdminEmail },
        ...(d.previousRole ? [{ label: 'Role before', value: d.previousRole }] : []),
        { label: 'When', value: formatWhen(d.when) },
      ],
      paragraphs: ['Admins can change every setting, every user and every piece of content. Every admin gets this email.'],
      button: { label: 'Review users', path: '/users' },
      footnote: "If you expected this, you don't need to do anything. If not, check the Users page and the audit log now.",
      replyTo: d.how === 'server' ? undefined : d.byEmail,
      warning: true,
    });
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
