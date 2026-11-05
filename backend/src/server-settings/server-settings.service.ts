import { isDeepStrictEqual } from 'util';
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService, SmtpConfig, smtpFromSaved } from '../mail/mail.service';
import { ImageKitStorageAdapter } from '../media/adapters/imagekit.adapter';
import { S3StorageAdapter } from '../media/adapters/s3.adapter';
import { isStorageDriver, r2Config, sameStorageSecret } from '../media/adapters/storage-config';
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

  /** Write and delete a test file with these (or the saved) settings. */
  async testStorage(dto?: StorageSettingsDto) {
    const row = await this.row();
    const st = dto ? this.storageToSave(dto, row.storage as Saved) : (row.storage as Saved);
    if (!st || !isStorageDriver(st.driver) || st.driver === 'local') throw new BadRequestException('Local disk needs no test');
    const secretKey = open(st.secretKey);
    if (!secretKey) throw new BadRequestException(st.driver === 'imagekit' ? 'Enter the private key' : 'Enter the secret access key');
    try {
      if (st.driver === 'imagekit') {
        await ImageKitStorageAdapter.test({ privateKey: secretKey, urlEndpoint: st.urlEndpoint, folder: st.folder });
      } else if (st.driver === 'r2') {
        await S3StorageAdapter.test(r2Config({ accountId: st.accountId, bucket: st.bucket, accessKey: st.accessKey, secretKey, publicUrl: st.publicUrl }));
      } else {
        await S3StorageAdapter.test({ ...st, secretKey });
      }
    } catch (err: any) {
      throw new BadRequestException(`Storage test failed: ${err?.name ? `${err.name}: ` : ''}${err?.message ?? err}`);
    }
    return { ok: true };
  }

  // ── Site export / import: everything except passwords ─────────────────────

  /** The saved settings without their secrets. */
  async exportSettings() {
    const row = await this.row();
    const { pass: _pass, ...mail } = (row.mail ?? {}) as Record<string, any>;
    const { secretKey: _secret, ...storage } = (row.storage ?? {}) as Record<string, any>;
    return { mail: row.mail ? mail : null, storage: row.storage ? storage : null };
  }

  /**
   * What importing these settings does. A password saved here stays. With `overwrite`
   * off only what isn't set yet is filled in; env-set sections are never touched.
   */
  async planImport(file: any, overwrite: boolean) {
    const row = await this.row();
    const total = (file?.mail ? 1 : 0) + (file?.storage ? 1 : 0);
    const apply: Array<'mail' | 'storage'> = [];
    const needsSecret: string[] = [];
    let mail: Record<string, any> | undefined;
    let storage: Record<string, any> | undefined;
    if (file?.mail && !env.SMTP_HOST && (overwrite || !row.mail)) {
      mail = this.mailToSave(file.mail, row.mail as Saved);
      apply.push('mail');
      if (mail.user && !mail.pass) needsSecret.push('email');
    }
    if (file?.storage && !process.env.STORAGE_DRIVER && (overwrite || !row.storage)) {
      if (!isStorageDriver(file.storage.driver)) throw new BadRequestException('Unknown storage driver');
      storage = this.storageToSave(file.storage, row.storage as Saved);
      apply.push('storage');
      if (storage.driver !== 'local' && !storage.secretKey) needsSecret.push('storage');
    }
    const storageChanged = !!storage && !isDeepStrictEqual(storage, row.storage);
    return { total, apply, needsSecret, mail, storage, storageChanged };
  }

  async applyImport(plan: { mail?: Record<string, any>; storage?: Record<string, any> }) {
    const data: Prisma.SettingUpdateInput = {};
    if (plan.mail) data.mail = plan.mail;
    if (plan.storage) data.storage = plan.storage;
    await this.prisma.setting.update({ where: { id: 1 }, data });
    if (plan.mail) this.mail.configure(smtpFromSaved(plan.mail));
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
    // A blank secret keeps the saved one, unless that belongs to another kind of storage.
    const secretKey = dto.secretKey
      ? seal(dto.secretKey)
      : (sameStorageSecret(current?.driver, dto.driver) ? current?.secretKey ?? null : null);
    if (dto.driver === 'imagekit') {
      return {
        driver: 'imagekit',
        urlEndpoint: dto.urlEndpoint!.trim().replace(/\/+$/, ''),
        folder: dto.folder?.trim().replace(/^\/+|\/+$/g, '') || null,
        secretKey,
      };
    }
    if (dto.driver === 'r2') {
      return {
        driver: 'r2',
        accountId: dto.accountId!.trim().toLowerCase(),
        bucket: dto.bucket!.trim(),
        accessKey: dto.accessKey!.trim(),
        secretKey,
        publicUrl: dto.publicUrl!.trim(),
      };
    }
    return {
      driver: 's3',
      bucket: dto.bucket!.trim(),
      region: dto.region?.trim() || 'us-east-1',
      accessKey: dto.accessKey!.trim(),
      secretKey,
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
        accountId: process.env.STORAGE_R2_ACCOUNT_ID ?? null,
        urlEndpoint: process.env.STORAGE_IMAGEKIT_URL_ENDPOINT ?? null,
        folder: process.env.STORAGE_IMAGEKIT_FOLDER ?? null,
        hasSecret: !!(process.env.STORAGE_DRIVER === 'imagekit' ? process.env.STORAGE_IMAGEKIT_PRIVATE_KEY : process.env.STORAGE_S3_SECRET_KEY),
        active,
        restartRequired: false,
      };
    }
    const driver = isStorageDriver(saved?.driver) ? saved.driver : 'local';
    return {
      source: saved ? ('database' as const) : null,
      driver,
      bucket: saved?.bucket ?? null,
      region: saved?.region ?? null,
      endpoint: saved?.endpoint ?? null,
      publicUrl: saved?.publicUrl ?? null,
      accessKey: saved?.accessKey ?? null,
      accountId: saved?.accountId ?? null,
      urlEndpoint: saved?.urlEndpoint ?? null,
      folder: saved?.folder ?? null,
      hasSecret: !!open(saved?.secretKey),
      active,
      // Storage is picked at boot (MediaModule).
      restartRequired: active !== null && active !== driver,
      production: process.env.NODE_ENV === 'production',
    };
  }
}
