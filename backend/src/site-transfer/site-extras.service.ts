import { existsSync } from 'fs';
import { basename, join } from 'path';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { unusablePasswordHash } from '../auth/password';
import { env } from '../config/env';
import { BrandService } from '../brand/brand.service';
import { AppCacheService } from '../cache/app-cache.service';
import { ComponentsService } from '../components/components.service';
import { ContentTypeService } from '../content-type/content-type.service';
import { PluginRegistry } from '../plugin/plugin.registry';
import { PluginService } from '../plugin/plugin.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../roles/access.service';
import { BASE_ROLES, isBuiltInRole } from '../roles/roles.constants';
import { ServerSettingsService } from '../server-settings/server-settings.service';
import { rewriteBaseUrl } from './site-bundle';

export interface ExtraCounts { total: number; toCreate: number; toUpdate: number; toSkip: number }
export interface ExtraWritten { created: number; updated: number; skipped: number }
/** Something the admin should know. `code` picks the admin's translated text; `message` is for the CLI. */
export interface ExtraNote { code: string; count?: number; list?: string; message: string }

export const EXTRA_SECTIONS = [
  'brand', 'settings', 'roles', 'permissions', 'roleAccess', 'users', 'mediaFolders', 'media',
  'plugins', 'pluginPackages', 'releases', 'formSubmissions', 'entryVersions', 'schemaVersions', 'auditLog',
] as const;
export type ExtraSection = (typeof EXTRA_SECTIONS)[number];

const LEVELS = ['none', 'view', 'edit'];
const RELEASE_STATUSES = ['open', 'scheduled', 'published', 'failed'];
const HEX = /^#[0-9a-f]{3,8}$/i;
const BATCH = 500;

const isObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const validDate = (v: unknown) => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const iso = (d: Date | string) => new Date(d).toISOString();
const webUrl = (v: unknown) => typeof v === 'string' && /^(https?:\/\/|\/)/i.test(v);
const safeFile = (v: unknown) => typeof v === 'string' && !!v && v === basename(v) && !v.includes('\\') && !v.includes('..');
const folderKey = (path: string[]) => path.join('\u0000');
const empty = (): ExtraCounts => ({ total: 0, toCreate: 0, toUpdate: 0, toSkip: 0 });

export interface ExtrasPlan {
  counts: Partial<Record<ExtraSection, ExtraCounts>>;
  notes: ExtraNote[];
  errors: string[];
  write(): Promise<{ written: Partial<Record<ExtraSection, ExtraWritten>>; errors: string[]; notes: ExtraNote[] }>;
}

export interface ExtrasContext {
  overwrite: boolean;
  /** Bundle publicId → publicId on this site, where they differ. */
  remapped: Map<string, string>;
  /** publicIds the import is about to create or update. */
  entryIds: Set<string>;
  formSlugs: Set<string>;
  contentTypeNames: Set<string>;
  applyIdRemap: (value: unknown) => unknown;
}

/**
 * The parts of a site export that only an admin may see or change: brand, settings,
 * roles, users, media records, plugins, releases, submissions and history.
 *
 * The file never carries a credential. Users arrive with an unusable password and set
 * their own through the invite or reset link; API keys are not exported; email, storage
 * and plugin passwords stay behind and are entered again on the new site.
 */
@Injectable()
export class SiteExtrasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brand: BrandService,
    private readonly settings: ServerSettingsService,
    private readonly access: AccessService,
    private readonly registry: PluginRegistry,
    private readonly plugins: PluginService,
    private readonly contentTypes: ContentTypeService,
    private readonly components: ComponentsService,
    private readonly cache: AppCacheService,
  ) {}

  async export() {
    const users = await this.prisma.user.findMany({ orderBy: { id: 'asc' }, select: { id: true, email: true, name: true, role: true, createdAt: true } });
    const emailOf = new Map(users.map((u) => [u.id, u.email]));
    const by = (id: number | null) => (id == null ? null : emailOf.get(id) ?? null);

    const b = await this.brand.get();
    const folders = await this.prisma.mediaFolder.findMany({ select: { id: true, name: true, parentId: true } });
    const byId = new Map(folders.map((f) => [f.id, f]));
    const pathOf = (id: number | null): string[] => {
      const out: string[] = [];
      for (let f = id == null ? undefined : byId.get(id); f; f = f.parentId == null ? undefined : byId.get(f.parentId)) out.unshift(f.name);
      return out;
    };
    const media = await this.prisma.media.findMany({ orderBy: { id: 'asc' } });
    const packages = await this.prisma.pluginPackage.findMany({ orderBy: { id: 'asc' }, select: { id: true, manifest: true, archive: true } });
    const pkgManifest = new Map(packages.map((p) => [p.id, p.manifest as any]));
    const installed = await this.prisma.installedPlugin.findMany({ orderBy: { id: 'asc' } });
    const releases = await this.prisma.release.findMany({
      orderBy: { id: 'asc' },
      include: { items: { select: { action: true, entry: { select: { publicId: true } } } } },
    });
    const forms = await this.prisma.form.findMany({ select: { id: true, slug: true } });
    const slugOf = new Map(forms.map((f) => [f.id, f.slug]));
    const submissions = await this.prisma.formSubmission.findMany({ orderBy: { id: 'asc' }, include: { files: true } });
    const versions = await this.prisma.entryVersion.findMany({ orderBy: { id: 'asc' }, include: { entry: { select: { publicId: true } } } });
    const types = await this.prisma.contentType.findMany({ orderBy: [{ position: 'asc' }, { id: 'asc' }], select: { id: true, name: true } });
    const typeOf = new Map(types.map((t) => [t.id, t.name]));
    const schemaVersions = await this.prisma.contentTypeSchemaVersion.findMany({ orderBy: { id: 'asc' } });
    const components = await this.prisma.component.findMany({ orderBy: [{ position: 'asc' }, { id: 'asc' }], select: { name: true } });
    const audit = await this.prisma.auditLog.findMany({ orderBy: { id: 'asc' } });

    return {
      siteUrl: env.APP_URL ?? null,
      order: { contentTypes: types.map((t) => t.name), components: components.map((c) => c.name) },
      brand: { brandName: b.brandName, brandLogoUrl: b.brandLogoUrl, brandColor: b.brandColor, buttonColor: b.buttonColor, inputColor: b.inputColor },
      settings: await this.settings.exportSettings(),
      roles: await this.prisma.role.findMany({ orderBy: { name: 'asc' }, select: { name: true, label: true, description: true, baseRole: true } }),
      permissions: await this.prisma.permission.findMany({ orderBy: [{ role: 'asc' }, { contentType: 'asc' }], select: { role: true, contentType: true, actions: true } }),
      roleAccess: await this.prisma.roleAccess.findMany({ orderBy: [{ role: 'asc' }, { module: 'asc' }], select: { role: true, module: true, level: true } }),
      users: users.map((u) => ({ email: u.email, ...(u.name && { name: u.name }), role: u.role, createdAt: u.createdAt })),
      mediaFolders: folders.map((f) => pathOf(f.id)).sort((x, y) => x.length - y.length || folderKey(x).localeCompare(folderKey(y))),
      media: media.map(({ id, folderId, uploadedBy, ...row }) => ({ ...row, folder: pathOf(folderId), uploadedBy: by(uploadedBy) })),
      plugins: installed.map((p) => {
        const schema = this.registry.get(p.id)?.manifest.configSchema ?? pkgManifest.get(p.id)?.configSchema;
        // Without a schema a secret can't be told from a setting, so nothing is copied.
        const secret = new Set((schema ?? []).filter((f: any) => f.type === 'password').map((f: any) => f.name));
        const config = schema ? Object.fromEntries(Object.entries((p.config ?? {}) as object).filter(([k]) => !secret.has(k))) : {};
        return { id: p.id, enabled: p.enabled, config };
      }),
      pluginPackages: packages.map((p) => ({ id: p.id, archive: Buffer.from(p.archive).toString('base64') })),
      releases: releases.map((r) => ({
        name: r.name, description: r.description, status: r.status, scheduledAt: r.scheduledAt, publishedAt: r.publishedAt,
        error: r.error, createdBy: by(r.createdBy), createdAt: r.createdAt,
        items: r.items.map((i) => ({ entry: i.entry.publicId, action: i.action })),
      })),
      formSubmissions: submissions.map((s) => ({
        form: slugOf.get(s.formId), data: s.data, ip: s.ip, createdAt: s.createdAt,
        files: s.files.map((f) => ({ id: f.id, field: f.field, filename: f.filename, mimetype: f.mimetype, size: f.size, createdAt: f.createdAt, data: Buffer.from(f.data).toString('base64') })),
      })),
      entryVersions: versions.map((v) => ({ entry: v.entry.publicId, slug: v.slug, data: v.data, status: v.status, createdBy: by(v.createdBy), createdAt: v.createdAt })),
      schemaVersions: schemaVersions.map((v) => ({ contentType: typeOf.get(v.contentTypeId), schema: v.schema, changedBy: by(v.changedBy), createdAt: v.createdAt })),
      auditLog: audit.map(({ id, userId, ...row }) => row),
    };
  }

  /** Work out what the import does with these sections, without writing. */
  async plan(bundle: any, ctx: ExtrasContext): Promise<ExtrasPlan> {
    const { overwrite } = ctx;
    const errors: string[] = [];
    const notes: ExtraNote[] = [];
    const counts: Partial<Record<ExtraSection, ExtraCounts>> = {};
    const steps: Array<[ExtraSection, () => Promise<void>]> = [];
    const after: Array<() => Promise<void>> = [];
    const list = (name: string): any[] => {
      const v = bundle[name];
      if (v === undefined || v === null) return [];
      if (Array.isArray(v)) return v;
      errors.push(`"${name}" must be a list`);
      return [];
    };
    const rewrite = <T>(v: T): T => rewriteBaseUrl(v, bundle.siteUrl, env.APP_URL) as T;
    const section = (name: ExtraSection) => (counts[name] = counts[name] ?? empty());
    const bad = (where: string, what: string) => errors.push(`${where}: ${what}`);

    // ── Brand ──
    if (bundle.brand !== undefined && bundle.brand !== null) {
      const b = bundle.brand;
      if (!isObject(b) || typeof b.brandName !== 'string' || !b.brandName.trim()) bad('brand', 'needs a brandName');
      else if ([b.brandColor, b.buttonColor, b.inputColor].some((c) => c != null && (typeof c !== 'string' || !HEX.test(c)))) bad('brand', 'colors must be hex values');
      else if (b.brandLogoUrl != null && !webUrl(b.brandLogoUrl)) bad('brand', 'brandLogoUrl must be a web address');
      else {
        const c = section('brand');
        c.total = 1;
        if (overwrite) {
          c.toUpdate = 1;
          steps.push(['brand', async () => {
            await this.brand.update({ brandName: b.brandName, brandLogoUrl: b.brandLogoUrl == null ? null : rewrite(b.brandLogoUrl), brandColor: b.brandColor ?? undefined, buttonColor: b.buttonColor ?? null, inputColor: b.inputColor ?? null });
          }]);
        } else c.toSkip = 1;
      }
    }

    // ── Email and storage settings (never with a password) ──
    if (bundle.settings !== undefined && bundle.settings !== null) {
      try {
        const p = await this.settings.planImport(bundle.settings, overwrite);
        const c = section('settings');
        c.total = p.total;
        c.toUpdate = p.apply.length;
        c.toSkip = p.total - p.apply.length;
        if (p.needsSecret.length) notes.push({ code: 'secretsLeftOut', list: p.needsSecret.join(', '), message: `Passwords aren't in the file. Enter them again under Settings → Email & storage: ${p.needsSecret.join(', ')}.` });
        if (p.apply.length) steps.push(['settings', async () => { await this.settings.applyImport(p); }]);
        if (p.storageChanged) notes.push({ code: 'restartStorage', message: 'Restart the server for the storage settings to take effect.' });
      } catch (err: any) {
        bad('settings', err?.response?.message ?? err.message);
      }
    }

    // ── Roles, permissions, module access ──
    const existingRoles = new Set((await this.prisma.role.findMany({ select: { name: true } })).map((r) => r.name));
    const roles = list('roles');
    const fileRoles = new Set<string>();
    const roleWrites: any[] = [];
    if (roles.length) section('roles').total = roles.length;
    roles.forEach((r, i) => {
      if (!isObject(r) || typeof r.name !== 'string' || !r.name || typeof r.label !== 'string') return void bad(`roles[${i}]`, 'needs a name and label');
      if (!(BASE_ROLES as readonly string[]).includes(r.baseRole)) return void bad(`roles[${i}] "${r.name}"`, 'baseRole must be editor, contributor or viewer');
      if (isBuiltInRole(r.name)) return void bad(`roles[${i}] "${r.name}"`, 'is a built-in role');
      fileRoles.add(r.name);
      const c = section('roles');
      if (!existingRoles.has(r.name)) c.toCreate++;
      else if (overwrite) c.toUpdate++;
      else return void c.toSkip++;
      roleWrites.push(r);
    });
    if (roleWrites.length) steps.push(['roles', async () => {
      for (const r of roleWrites) {
        const data = { label: r.label, description: r.description ?? null, baseRole: r.baseRole };
        await this.prisma.role.upsert({ where: { name: r.name }, create: { name: r.name, ...data }, update: data });
      }
    }]);
    const roleKnown = (name: unknown) => typeof name === 'string' && (isBuiltInRole(name) || fileRoles.has(name) || existingRoles.has(name));

    const existingPerms = new Set((await this.prisma.permission.findMany({ select: { role: true, contentType: true } })).map((p) => `${p.role}\u0000${p.contentType}`));
    const perms = list('permissions');
    const permWrites: any[] = [];
    if (perms.length) section('permissions').total = perms.length;
    perms.forEach((p, i) => {
      if (!isObject(p) || !roleKnown(p.role) || typeof p.contentType !== 'string' || !Array.isArray(p.actions) || !p.actions.every((a: unknown) => typeof a === 'string')) return void bad(`permissions[${i}]`, 'needs a known role, a contentType and a list of actions');
      const c = section('permissions');
      if (!existingPerms.has(`${p.role}\u0000${p.contentType}`)) c.toCreate++;
      else if (overwrite) c.toUpdate++;
      else return void c.toSkip++;
      permWrites.push(p);
    });
    if (permWrites.length) steps.push(['permissions', async () => {
      for (const p of permWrites) {
        await this.prisma.permission.upsert({ where: { role_contentType: { role: p.role, contentType: p.contentType } }, create: { role: p.role, contentType: p.contentType, actions: p.actions }, update: { actions: p.actions } });
      }
    }]);

    const existingAccess = new Set((await this.prisma.roleAccess.findMany({ select: { role: true, module: true } })).map((a) => `${a.role}\u0000${a.module}`));
    const accessRows = list('roleAccess');
    const accessWrites: any[] = [];
    if (accessRows.length) section('roleAccess').total = accessRows.length;
    accessRows.forEach((a, i) => {
      if (!isObject(a) || !roleKnown(a.role) || typeof a.module !== 'string' || !LEVELS.includes(a.level)) return void bad(`roleAccess[${i}]`, 'needs a known role, a module and a level of none, view or edit');
      const c = section('roleAccess');
      if (!existingAccess.has(`${a.role}\u0000${a.module}`)) c.toCreate++;
      else if (overwrite) c.toUpdate++;
      else return void c.toSkip++;
      accessWrites.push(a);
    });
    if (accessWrites.length) steps.push(['roleAccess', async () => {
      for (const a of accessWrites) {
        await this.prisma.roleAccess.upsert({ where: { role_module: { role: a.role, module: a.module } }, create: { role: a.role, module: a.module, level: a.level }, update: { level: a.level } });
      }
    }]);

    // ── Users: someone already here is never touched, so nobody loses a login or a role ──
    const existingUsers = await this.prisma.user.findMany({ select: { email: true } });
    const taken = new Set(existingUsers.map((u) => u.email.toLowerCase()));
    const users = list('users');
    const newUsers: any[] = [];
    if (users.length) section('users').total = users.length;
    users.forEach((u, i) => {
      if (!isObject(u) || typeof u.email !== 'string' || !u.email.includes('@')) return void bad(`users[${i}]`, 'needs an email');
      if (!roleKnown(u.role)) return void bad(`users[${i}] ${u.email}`, `unknown role "${u.role}"`);
      const c = section('users');
      if (taken.has(u.email.toLowerCase())) return void c.toSkip++;
      taken.add(u.email.toLowerCase());
      c.toCreate++;
      newUsers.push(u);
    });
    if (newUsers.length) {
      notes.push({ code: 'usersSetPassword', count: newUsers.length, message: `${newUsers.length} new user(s) have no password yet. Send each one an invite from the Users page, or they can use "Forgot password".` });
      steps.push(['users', async () => {
        for (const u of newUsers) {
          // Random and unknown to anyone, as for an invited user.
          const password = await unusablePasswordHash();
          await this.prisma.user.create({ data: { email: u.email, role: u.role, password, ...(typeof u.name === 'string' && u.name.trim() && { name: u.name.trim().slice(0, 100) }), ...(validDate(u.createdAt) ? { createdAt: new Date(u.createdAt) } : {}) } });
        }
      }]);
    }
    const userIds = async () => new Map((await this.prisma.user.findMany({ select: { id: true, email: true } })).map((u) => [u.email.toLowerCase(), u.id]));
    const idFor = (ids: Map<string, number>, email: unknown) => (typeof email === 'string' ? ids.get(email.toLowerCase()) ?? null : null);

    // ── Media folders and records (the files are copied by hand) ──
    const currentFolders = await this.prisma.mediaFolder.findMany({ select: { id: true, name: true, parentId: true } });
    const folderIds = this.folderMap(currentFolders);
    const folderRows = list('mediaFolders');
    const newFolders: string[][] = [];
    const validPath = (p: unknown): p is string[] => Array.isArray(p) && p.every((n) => typeof n === 'string' && !!n);
    if (folderRows.length) section('mediaFolders').total = folderRows.length;
    folderRows.forEach((p, i) => {
      if (!validPath(p) || !p.length) return void bad(`mediaFolders[${i}]`, 'must be a list of folder names');
      const c = section('mediaFolders');
      if (folderIds.has(folderKey(p))) return void c.toSkip++;
      c.toCreate++;
      newFolders.push(p);
    });
    const mediaRows = list('media');
    const existingMedia = new Set((await this.prisma.media.findMany({ select: { filename: true } })).map((m) => m.filename));
    const mediaWrites: any[] = [];
    const seenFiles = new Set<string>();
    let missing = 0;
    const ours = env.APP_URL ? `${env.APP_URL.replace(/\/+$/, '')}/uploads/` : null;
    if (mediaRows.length) section('media').total = mediaRows.length;
    mediaRows.forEach((m, i) => {
      if (!isObject(m) || !safeFile(m.filename) || !webUrl(m.url) || typeof m.originalName !== 'string' || typeof m.mimetype !== 'string' || typeof m.size !== 'number') return void bad(`media[${i}]`, 'needs a plain filename, url, originalName, mimetype and size');
      if ((m.webpFilename != null && !safeFile(m.webpFilename)) || (m.webpUrl != null && !webUrl(m.webpUrl)) || !validPath(m.folder ?? [])) return void bad(`media[${i}] ${m.filename}`, 'has an invalid WebP file or folder');
      if (seenFiles.has(m.filename)) return void bad(`media[${i}] ${m.filename}`, 'appears twice in the file');
      seenFiles.add(m.filename);
      if (ours && rewrite(m.url).startsWith(ours) && !existsSync(join(process.cwd(), 'uploads', m.filename))) missing++;
      const c = section('media');
      if (!existingMedia.has(m.filename)) c.toCreate++;
      else if (overwrite) c.toUpdate++;
      else return void c.toSkip++;
      mediaWrites.push(m);
    });
    if (missing) notes.push({ code: 'mediaMissing', count: missing, message: `${missing} media file(s) aren't in this server's uploads folder yet. Copy the folder across, or those images won't load.` });
    if (newFolders.length || mediaWrites.length) {
      steps.push(['mediaFolders', async () => {
        const known = this.folderMap(await this.prisma.mediaFolder.findMany({ select: { id: true, name: true, parentId: true } }));
        const ensure = async (path: string[]): Promise<number | null> => {
          if (!path.length) return null;
          const hit = known.get(folderKey(path));
          if (hit) return hit;
          const parentId = await ensure(path.slice(0, -1));
          const made = await this.prisma.mediaFolder.create({ data: { name: path[path.length - 1], parentId } });
          known.set(folderKey(path), made.id);
          return made.id;
        };
        for (const p of newFolders) await ensure(p);
        const ids = await userIds();
        for (const m of mediaWrites) {
          const data = {
            webpFilename: m.webpFilename ?? null, url: rewrite(m.url), webpUrl: m.webpUrl == null ? null : rewrite(m.webpUrl),
            originalName: m.originalName, mimetype: m.mimetype, size: m.size, width: m.width ?? null, height: m.height ?? null,
            focalX: m.focalX ?? null, focalY: m.focalY ?? null, uploadedBy: idFor(ids, m.uploadedBy), folderId: await ensure(m.folder ?? []),
          };
          const createdAt = validDate(m.createdAt) ? { createdAt: new Date(m.createdAt) } : {};
          await this.prisma.media.upsert({ where: { filename: m.filename }, create: { filename: m.filename, ...data, ...createdAt }, update: data });
        }
      }]);
    }

    // ── Uploaded plugins: through the normal review and signature policy, and they start switched off ──
    const pkgRows = list('pluginPackages');
    const existingPkgs = new Set((await this.prisma.pluginPackage.findMany({ select: { id: true } })).map((p) => p.id));
    const pkgWrites: Array<{ id: string; archive: Buffer }> = [];
    const blocked: string[] = [];
    if (pkgRows.length) section('pluginPackages').total = pkgRows.length;
    for (const [i, p] of pkgRows.entries()) {
      if (!isObject(p) || typeof p.id !== 'string' || typeof p.archive !== 'string') {
        bad(`pluginPackages[${i}]`, 'needs an id and an archive');
        continue;
      }
      const c = section('pluginPackages');
      if (existingPkgs.has(p.id) && !overwrite) {
        c.toSkip++;
        continue;
      }
      const archive = Buffer.from(p.archive, 'base64');
      let problem: string | undefined;
      try {
        const review: any = await this.plugins.uploadPackage(archive, true);
        if (!review.installable) problem = review.problems?.[0] ?? 'not installable';
      } catch (err: any) {
        problem = err?.message ?? 'not installable';
      }
      if (problem) {
        c.toSkip++;
        blocked.push(`${p.id} (${problem})`);
        continue;
      }
      if (existingPkgs.has(p.id)) c.toUpdate++;
      else c.toCreate++;
      pkgWrites.push({ id: p.id, archive });
    }
    if (blocked.length) notes.push({ code: 'pluginsBlocked', list: blocked.join('; '), message: `These plugins can't be installed here: ${blocked.join('; ')}.` });
    if (pkgWrites.length) {
      notes.push({ code: 'pluginsInstall', list: pkgWrites.map((p) => p.id).join(', '), message: `These uploaded plugins will be installed: ${pkgWrites.map((p) => p.id).join(', ')}. New ones start switched off; restart the server, then turn them on.` });
      steps.push(['pluginPackages', async () => {
        for (const p of pkgWrites) await this.plugins.uploadPackage(p.archive, false, 'site import');
      }]);
    }

    const pluginRows = list('plugins');
    const pluginWrites: any[] = [];
    const absent: string[] = [];
    if (pluginRows.length) section('plugins').total = pluginRows.length;
    pluginRows.forEach((p, i) => {
      if (!isObject(p) || typeof p.id !== 'string' || typeof p.enabled !== 'boolean' || !isObject(p.config ?? {})) return void bad(`plugins[${i}]`, 'needs an id and an on/off state');
      const c = section('plugins');
      const registered = !!this.registry.get(p.id);
      if (!registered && !pkgWrites.some((w) => w.id === p.id) && !existingPkgs.has(p.id)) {
        absent.push(p.id);
        return void c.toSkip++;
      }
      if (!overwrite) return void c.toSkip++;
      c.toUpdate++;
      pluginWrites.push(p);
    });
    if (absent.length) notes.push({ code: 'pluginsAbsent', list: absent.join(', '), message: `Settings skipped for plugins this site doesn't have: ${absent.join(', ')}.` });
    if (pluginWrites.length) steps.push(['plugins', async () => {
      for (const p of pluginWrites) {
        if (this.registry.get(p.id)) {
          await this.plugins.updatePluginConfig(p.id, p.config ?? {}, 'site import');
          if (this.registry.get(p.id)!.enabled !== p.enabled) await this.plugins.togglePlugin(p.id, p.enabled, 'site import');
        } else {
          // Not running until a restart: settings only, and it stays off until an admin turns it on.
          const stored = await this.prisma.installedPlugin.findUnique({ where: { id: p.id } });
          const config = { ...((stored?.config ?? {}) as object), ...(p.config ?? {}) };
          await this.prisma.installedPlugin.upsert({ where: { id: p.id }, create: { id: p.id, enabled: false, config }, update: { config } });
        }
      }
    }]);

    // ── Entries already on this site, for releases and versions ──
    const finalId = (id: string) => ctx.remapped.get(id) ?? id;
    const versionRows = list('entryVersions');
    const releaseRows = list('releases');
    const wanted = [...new Set([...versionRows.map((v) => v?.entry), ...releaseRows.flatMap((r) => (Array.isArray(r?.items) ? r.items.map((i: any) => i?.entry) : []))].filter((v) => typeof v === 'string').map(finalId))];
    const present = await this.prisma.entry.findMany({ where: { publicId: { in: wanted } }, select: { id: true, publicId: true } });
    const presentIds = new Set(present.map((e) => e.publicId));
    const reachable = (id: unknown) => typeof id === 'string' && (presentIds.has(finalId(id)) || ctx.entryIds.has(finalId(id)));
    const entryLookup = async () => new Map((await this.prisma.entry.findMany({ where: { publicId: { in: wanted } }, select: { id: true, publicId: true } })).map((e) => [e.publicId, e.id]));

    // ── Releases: no unique key, so matched by name + creation time ──
    const existingReleases = new Map((await this.prisma.release.findMany({ select: { id: true, name: true, createdAt: true } })).map((r) => [`${r.name}\u0000${iso(r.createdAt)}`, r.id]));
    const releaseWrites: Array<{ row: any; id?: number }> = [];
    if (releaseRows.length) section('releases').total = releaseRows.length;
    releaseRows.forEach((r, i) => {
      if (!isObject(r) || typeof r.name !== 'string' || !validDate(r.createdAt) || !Array.isArray(r.items)) return void bad(`releases[${i}]`, 'needs a name, createdAt and items');
      const c = section('releases');
      const id = existingReleases.get(`${r.name}\u0000${iso(r.createdAt)}`);
      if (id === undefined) c.toCreate++;
      else if (overwrite) c.toUpdate++;
      else return void c.toSkip++;
      releaseWrites.push({ row: r, id });
    });
    if (releaseWrites.length) steps.push(['releases', async () => {
      const entryIds = await entryLookup();
      const ids = await userIds();
      for (const { row, id } of releaseWrites) {
        // A release caught mid-publish on the old site goes back to open rather than sticking.
        const status = RELEASE_STATUSES.includes(row.status) ? row.status : 'open';
        const data = {
          name: row.name, description: row.description ?? null, status, scheduledAt: validDate(row.scheduledAt) ? new Date(row.scheduledAt) : null,
          publishedAt: validDate(row.publishedAt) ? new Date(row.publishedAt) : null, error: row.error ?? null, createdBy: idFor(ids, row.createdBy),
        };
        const items = row.items
          .map((it: any) => ({ entryId: typeof it?.entry === 'string' ? entryIds.get(finalId(it.entry)) : undefined, action: typeof it?.action === 'string' ? it.action : 'publish' }))
          .filter((it: any) => it.entryId !== undefined);
        if (id === undefined) {
          await this.prisma.release.create({ data: { ...data, createdAt: new Date(row.createdAt), items: { create: items } } });
        } else {
          await this.prisma.releaseItem.deleteMany({ where: { releaseId: id } });
          await this.prisma.release.update({ where: { id }, data: { ...data, items: { create: items } } });
        }
      }
    }]);

    // ── Form submissions: added, never overwritten ──
    const formIds = new Map((await this.prisma.form.findMany({ select: { id: true, slug: true } })).map((f) => [f.slug, f.id]));
    const subKey = (formSlug: string, at: Date | string, ip: unknown) => `${formSlug}\u0000${iso(at)}\u0000${ip ?? ''}`;
    const slugById = new Map([...formIds].map(([slug, id]) => [id, slug]));
    const existingSubs = new Set((await this.prisma.formSubmission.findMany({ select: { formId: true, createdAt: true, ip: true } })).map((s) => subKey(slugById.get(s.formId)!, s.createdAt, s.ip)));
    const subRows = list('formSubmissions');
    const subWrites: any[] = [];
    if (subRows.length) section('formSubmissions').total = subRows.length;
    subRows.forEach((s, i) => {
      if (!isObject(s) || typeof s.form !== 'string' || !isObject(s.data) || !validDate(s.createdAt)) return void bad(`formSubmissions[${i}]`, 'needs a form, data and createdAt');
      if (!ctx.formSlugs.has(s.form)) return void bad(`formSubmissions[${i}]`, `no form "${s.form}" in the file or on this site`);
      const files = s.files ?? [];
      if (!Array.isArray(files) || !files.every((f: any) => isObject(f) && typeof f.id === 'string' && typeof f.data === 'string' && typeof f.filename === 'string' && typeof f.mimetype === 'string' && typeof f.field === 'string')) return void bad(`formSubmissions[${i}]`, 'has an invalid file');
      const c = section('formSubmissions');
      const key = subKey(s.form, s.createdAt, s.ip);
      if (existingSubs.has(key)) return void c.toSkip++;
      existingSubs.add(key);
      c.toCreate++;
      subWrites.push(s);
    });
    if (subWrites.length) steps.push(['formSubmissions', async () => {
      const ids = new Map((await this.prisma.form.findMany({ select: { id: true, slug: true } })).map((f) => [f.slug, f.id]));
      const fileIds = subWrites.flatMap((s) => (s.files ?? []).map((f: any) => f.id));
      const takenFiles = new Set((await this.prisma.formFile.findMany({ where: { id: { in: fileIds } }, select: { id: true } })).map((f) => f.id));
      for (const s of subWrites) {
        const files = (s.files ?? []).filter((f: any) => !takenFiles.has(f.id)).map((f: any) => {
          const data = Buffer.from(f.data, 'base64');
          return { id: f.id, field: f.field, filename: f.filename, mimetype: f.mimetype, size: data.length, data: new Uint8Array(data), ...(validDate(f.createdAt) ? { createdAt: new Date(f.createdAt) } : {}) };
        });
        await this.prisma.formSubmission.create({ data: { formId: ids.get(s.form)!, data: s.data, ip: s.ip ?? null, createdAt: new Date(s.createdAt), files: { create: files } } });
      }
    }]);

    // ── Entry version history ──
    const presentById = new Map(present.map((e) => [e.id, e.publicId]));
    const existingVersions = new Set((await this.prisma.entryVersion.findMany({ where: { entryId: { in: present.map((e) => e.id) } }, select: { entryId: true, createdAt: true } })).map((v) => `${presentById.get(v.entryId)}\u0000${iso(v.createdAt)}`));
    const versionWrites: any[] = [];
    if (versionRows.length) section('entryVersions').total = versionRows.length;
    versionRows.forEach((v, i) => {
      if (!isObject(v) || typeof v.entry !== 'string' || typeof v.slug !== 'string' || typeof v.status !== 'string' || !isObject(v.data) || !validDate(v.createdAt)) return void bad(`entryVersions[${i}]`, 'needs an entry, slug, status, data and createdAt');
      const c = section('entryVersions');
      const key = `${finalId(v.entry)}\u0000${iso(v.createdAt)}`;
      if (!reachable(v.entry) || existingVersions.has(key)) return void c.toSkip++;
      existingVersions.add(key);
      c.toCreate++;
      versionWrites.push(v);
    });
    if (versionWrites.length) steps.push(['entryVersions', async () => {
      const entryIds = await entryLookup();
      const ids = await userIds();
      const rows = versionWrites.filter((v) => entryIds.has(finalId(v.entry))).map((v) => ({
        entryId: entryIds.get(finalId(v.entry))!, slug: v.slug, status: v.status,
        data: rewrite(ctx.applyIdRemap(v.data)) as Prisma.InputJsonValue, createdBy: idFor(ids, v.createdBy), createdAt: new Date(v.createdAt),
      }));
      for (let i = 0; i < rows.length; i += BATCH) await this.prisma.entryVersion.createMany({ data: rows.slice(i, i + BATCH) });
    }]);

    // ── Content type schema history ──
    const typeRows = await this.prisma.contentType.findMany({ select: { id: true, name: true } });
    const typeById = new Map(typeRows.map((t) => [t.id, t.name]));
    const existingSchemaVersions = new Set((await this.prisma.contentTypeSchemaVersion.findMany({ select: { contentTypeId: true, createdAt: true } })).map((v) => `${typeById.get(v.contentTypeId)}\u0000${iso(v.createdAt)}`));
    const schemaRows = list('schemaVersions');
    const schemaWrites: any[] = [];
    if (schemaRows.length) section('schemaVersions').total = schemaRows.length;
    schemaRows.forEach((v, i) => {
      if (!isObject(v) || typeof v.contentType !== 'string' || !Array.isArray(v.schema) || !validDate(v.createdAt)) return void bad(`schemaVersions[${i}]`, 'needs a contentType, schema and createdAt');
      const c = section('schemaVersions');
      const key = `${v.contentType}\u0000${iso(v.createdAt)}`;
      if (!ctx.contentTypeNames.has(v.contentType) || existingSchemaVersions.has(key)) return void c.toSkip++;
      existingSchemaVersions.add(key);
      c.toCreate++;
      schemaWrites.push(v);
    });
    if (schemaWrites.length) steps.push(['schemaVersions', async () => {
      const typeIds = new Map((await this.prisma.contentType.findMany({ select: { id: true, name: true } })).map((t) => [t.name, t.id]));
      const ids = await userIds();
      const rows = schemaWrites.filter((v) => typeIds.has(v.contentType)).map((v) => ({
        contentTypeId: typeIds.get(v.contentType)!, schema: v.schema, changedBy: idFor(ids, v.changedBy), createdAt: new Date(v.createdAt),
      }));
      for (let i = 0; i < rows.length; i += BATCH) await this.prisma.contentTypeSchemaVersion.createMany({ data: rows.slice(i, i + BATCH) });
    }]);

    // ── Audit log: added, never overwritten ──
    const auditKey = (a: any) => [iso(a.createdAt), a.userEmail, a.action, a.resource, a.resourceId].join('\u0000');
    const existingAudit = new Set((await this.prisma.auditLog.findMany({ select: { createdAt: true, userEmail: true, action: true, resource: true, resourceId: true } })).map(auditKey));
    const auditRows = list('auditLog');
    const auditWrites: any[] = [];
    if (auditRows.length) section('auditLog').total = auditRows.length;
    auditRows.forEach((a, i) => {
      if (!isObject(a) || typeof a.userEmail !== 'string' || typeof a.action !== 'string' || typeof a.resource !== 'string' || typeof a.resourceId !== 'string' || !validDate(a.createdAt)) return void bad(`auditLog[${i}]`, 'needs userEmail, action, resource, resourceId and createdAt');
      const c = section('auditLog');
      const key = auditKey(a);
      if (existingAudit.has(key)) return void c.toSkip++;
      existingAudit.add(key);
      c.toCreate++;
      auditWrites.push(a);
    });
    if (auditWrites.length) steps.push(['auditLog', async () => {
      const ids = await userIds();
      const rows = auditWrites.map((a) => ({
        userId: idFor(ids, a.userEmail), userEmail: a.userEmail, action: a.action, resource: a.resource, resourceId: a.resourceId,
        metadata: a.metadata ?? Prisma.DbNull, ip: a.ip ?? null, createdAt: new Date(a.createdAt),
      }));
      for (let i = 0; i < rows.length; i += BATCH) await this.prisma.auditLog.createMany({ data: rows.slice(i, i + BATCH) });
    }]);

    // ── Order of the Content Types and Components pages ──
    const order = bundle.order;
    if (overwrite && isObject(order)) {
      after.push(async () => {
        const sorted = <T extends { id: number; name: string }>(rows: T[], names: unknown) => {
          const rank = new Map((Array.isArray(names) ? names : []).map((n, i) => [n, i]));
          return [...rows].sort((a, b) => (rank.get(a.name) ?? rank.size) - (rank.get(b.name) ?? rank.size)).map((r) => r.id);
        };
        await this.contentTypes.reorder(sorted(await this.prisma.contentType.findMany({ orderBy: [{ position: 'asc' }, { id: 'asc' }], select: { id: true, name: true } }), order.contentTypes));
        await this.components.reorder(sorted(await this.prisma.component.findMany({ orderBy: [{ position: 'asc' }, { id: 'asc' }], select: { id: true, name: true } }), order.components));
      });
    }

    return {
      counts,
      notes,
      errors,
      write: async () => {
        const writeErrors: string[] = [];
        const failed = new Set<ExtraSection>();
        for (const [name, run] of steps) {
          try {
            await run();
          } catch (err: any) {
            failed.add(name);
            writeErrors.push(`${name}: ${err?.message ?? 'unknown error'}`);
          }
        }
        for (const run of after) {
          try {
            await run();
          } catch (err: any) {
            writeErrors.push(`order: ${err?.message ?? 'unknown error'}`);
          }
        }
        await this.access.invalidate();
        await this.cache.invalidatePrefix('roles:def:');
        const written: Partial<Record<ExtraSection, ExtraWritten>> = {};
        for (const [name, c] of Object.entries(counts) as Array<[ExtraSection, ExtraCounts]>) {
          written[name] = failed.has(name) ? { created: 0, updated: 0, skipped: c.toSkip } : { created: c.toCreate, updated: c.toUpdate, skipped: c.toSkip };
        }
        return { written, errors: writeErrors, notes };
      },
    };
  }

  /** Folder path (joined names) → id. */
  private folderMap(rows: Array<{ id: number; name: string; parentId: number | null }>) {
    const byId = new Map(rows.map((f) => [f.id, f]));
    const out = new Map<string, number>();
    for (const row of rows) {
      const path: string[] = [];
      for (let f: typeof row | undefined = row; f; f = f.parentId == null ? undefined : byId.get(f.parentId)) path.unshift(f.name);
      out.set(folderKey(path), row.id);
    }
    return out;
  }
}
