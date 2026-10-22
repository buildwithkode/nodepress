import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService, SmtpConfig, smtpFromSaved } from '../mail/mail.service';
import { S3StorageAdapter } from '../media/adapters/s3.adapter';
import { activeStorageDriver } from '../media/media.module';
import { open, seal } from '../common/secret-box';
import { env } from '../config/env';
import { MailSettingsDto, StorageSettingsDto } from './server-settings.dto';

type Saved = Record<string, any> | null;

/**
 * Email (SMTP) and file storage set up from the admin — the setup wizard's
 * optional steps and Settings → Email & storage. Saved in Setting.mail /
 * Setting.storage with secrets encrypted. Env vars (SMTP_HOST, STORAGE_DRIVER)
 * take precedence and make the matching section read-only.
 *
 * Email changes apply at once; storage is chosen at boot, so a storage change
 * reports `restartRequired`.
 */
@Injectable()
export class ServerSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async get() {
    const row = await this.row();
    return { mail: this.mailView(row.mail as Saved), storage: this.storageView(row.storage as Saved) };
  }

  async saveMail(dto: MailSettingsDto) {
    if (env.SMTP_HOST) throw new ConflictException('Email is set by SMTP_* environment variables — change it there');
    const row = await this.row();
    const saved = dto.enabled ? this.mailToSave(dto, row.mail as Saved) : null;
    await this.prisma.setting.update({ where: { id: 1 }, data: { mail: saved ?? Prisma.DbNull } });
    this.mail.configure(smtpFromSaved(saved));
    return this.get();
  }

  /** Verify the server and send a test email — with unsaved values when given, else the saved ones. */
  async testMail(to: string, dto?: MailSettingsDto) {
    const row = await this.row();
    const config: SmtpConfig | null = env.SMTP_HOST
      ? null // env config: test through the running transporter
      : smtpFromSaved(dto?.host ? this.mailToSave(dto, row.mail as Saved) : row.mail);
    try {
      if (config) await MailService.verify(config);
      else if (!this.mail.isConfigured) throw new Error('Email is not set up');
      await this.mail.sendTest(to, config ?? undefined);
    } catch (err: any) {
      throw new BadRequestException(`Email test failed: ${err?.message ?? err}`);
    }
    return { sent: true, to };
  }

  async saveStorage(dto: StorageSettingsDto) {
    if (process.env.STORAGE_DRIVER) throw new ConflictException('Storage is set by STORAGE_* environment variables — change it there');
    const row = await this.row();
    const saved = this.storageToSave(dto, row.storage as Saved);
    await this.prisma.setting.update({ where: { id: 1 }, data: { storage: saved } });
    return this.get();
  }

  /** Write and delete a test object with these (or the saved) S3 settings. */
  async testStorage(dto?: StorageSettingsDto) {
    const row = await this.row();
    const st = dto?.bucket ? this.storageToSave({ ...dto, driver: 's3' }, row.storage as Saved) : (row.storage as Saved);
    if (!st || st.driver !== 's3') throw new BadRequestException('Local disk needs no test');
    const secretKey = open(st.secretKey);
    if (!secretKey) throw new BadRequestException('Enter the secret access key');
    try {
      await S3StorageAdapter.test({ ...st, secretKey });
    } catch (err: any) {
      throw new BadRequestException(`Storage test failed: ${err?.name ? `${err.name}: ` : ''}${err?.message ?? err}`);
    }
    return { ok: true };
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private row() {
    return this.prisma.setting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  }

  private mailToSave(dto: MailSettingsDto, current: Saved) {
    if (!dto.host?.trim()) throw new BadRequestException('Enter the SMTP server');
    return {
      host: dto.host.trim(),
      port: dto.port ?? 587,
      secure: dto.secure ?? (dto.port === 465),
      user: dto.user?.trim() || null,
      // '' / omitted keeps the saved password
      pass: dto.pass ? seal(dto.pass) : (current?.pass ?? null),
      from: dto.from?.trim() || null,
    };
  }

  private storageToSave(dto: StorageSettingsDto, current: Saved) {
    if (dto.driver === 'local') return { driver: 'local' };
    return {
      driver: 's3',
      bucket: dto.bucket!.trim(),
      region: dto.region?.trim() || 'us-east-1',
      accessKey: dto.accessKey!.trim(),
      secretKey: dto.secretKey ? seal(dto.secretKey) : (current?.secretKey ?? null),
      endpoint: dto.endpoint?.trim() || null,
      publicUrl: dto.publicUrl?.trim() || null,
    };
  }

  private mailView(saved: Saved) {
    if (env.SMTP_HOST) {
      return {
        source: 'env' as const,
        enabled: true,
        host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE === 'true',
        user: env.SMTP_USER ?? null, from: env.SMTP_FROM ?? null, hasPassword: !!env.SMTP_PASS,
      };
    }
    return {
      source: saved ? ('database' as const) : null,
      enabled: !!saved,
      host: saved?.host ?? null,
      port: saved?.port ?? 587,
      secure: !!saved?.secure,
      user: saved?.user ?? null,
      from: saved?.from ?? null,
      hasPassword: !!open(saved?.pass),
    };
  }

  private storageView(saved: Saved) {
    const active = activeStorageDriver();
    if (process.env.STORAGE_DRIVER) {
      return {
        source: 'env' as const,
        driver: process.env.STORAGE_DRIVER,
        bucket: process.env.STORAGE_S3_BUCKET ?? null,
        region: process.env.STORAGE_S3_REGION ?? null,
        endpoint: process.env.STORAGE_S3_ENDPOINT ?? null,
        publicUrl: process.env.STORAGE_S3_PUBLIC_URL ?? null,
        accessKey: process.env.STORAGE_S3_ACCESS_KEY ?? null,
        hasSecret: !!process.env.STORAGE_S3_SECRET_KEY,
        active,
        restartRequired: false,
      };
    }
    const driver = saved?.driver === 's3' ? 's3' : 'local';
    return {
      source: saved ? ('database' as const) : null,
      driver,
      bucket: saved?.bucket ?? null,
      region: saved?.region ?? null,
      endpoint: saved?.endpoint ?? null,
      publicUrl: saved?.publicUrl ?? null,
      accessKey: saved?.accessKey ?? null,
      hasSecret: !!open(saved?.secretKey),
      active,
      // Storage is picked at boot (MediaModule).
      restartRequired: active !== null && active !== driver,
      production: process.env.NODE_ENV === 'production',
    };
  }
}
