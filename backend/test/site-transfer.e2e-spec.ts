import { Prisma } from '@prisma/client';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { spawn } from 'child_process';
import { AddressInfo } from 'net';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createTestApp, cleanDatabase, registerAdmin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

const CLI = path.join(__dirname, '../../cli/bin/nodepress.js');

function cli(args: string[], env: Record<string, string>, cwd: string) {
  return new Promise<{ code: number; out: string; err: string }>((resolve) => {
    const proc = spawn(process.execPath, [CLI, ...args], { cwd, env: { ...process.env, NO_COLOR: '1', ...env } });
    let out = '';
    let err = '';
    proc.stdout.on('data', (c) => (out += c));
    proc.stderr.on('data', (c) => (err += c));
    proc.on('close', (code) => resolve({ code: code ?? -1, out, err }));
  });
}

/** Whole-site export / import: GET /api/site/export, POST /api/site/import, `nodepress site:*`. */
describe('Site export / import (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let prisma: PrismaService;
  let auth: { Authorization: string };
  let keys: Record<string, string> = {};
  let env: Record<string, string>;
  let dir: string;
  let bundle: any;
  let authorId: string;
  let postId: string;

  const contactForm = {
    name: 'Contact',
    slug: 'contact',
    fields: [{ name: 'email', type: 'email', required: true }],
    actions: [{ type: 'webhook', url: 'https://example.test/hook', headers: { 'X-Team': 'a' } }],
    isActive: true,
    captchaEnabled: false,
  };

  const signHook = { name: 'Rebuild', url: 'https://example.test/rebuild', secret: 'shh', events: ['entry.published'], enabled: false };
  const moved = { from: '/old', to: '/new', statusCode: 301 };

  /** Leave only users, API keys and settings behind — like a fresh install. */
  async function wipeContent() {
    await prisma.entry.deleteMany({});
    await prisma.contentType.deleteMany({});
    await prisma.choiceList.deleteMany({});
    await prisma.form.deleteMany({});
    await prisma.webhook.deleteMany({});
    await prisma.redirect.deleteMany({});
    await request(server).put('/api/locales').set(auth).send({ locales: ['en'], defaultLocale: 'en' }).expect(200);
  }

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    prisma = app.get(PrismaService);
    auth = { Authorization: `Bearer ${await registerAdmin(app)}` };
    await app.listen(0, '127.0.0.1');
    server = app.getHttpServer();
    const { port } = server.address() as AddressInfo;

    await request(server).put('/api/locales').set(auth).send({ locales: ['en', 'fr'], defaultLocale: 'en' }).expect(200);
    await request(server).post('/api/option-lists').set(auth)
      .send({ name: 'mood', label: 'Mood', choices: ['calm', 'busy'] }).expect(201);
    const author = await request(server).post('/api/content-types').set(auth)
      .send({ name: 'author', schema: [{ name: 'name', type: 'text' }] }).expect(201);
    const post = await request(server).post('/api/content-types').set(auth)
      .send({
        name: 'post',
        schema: [
          { name: 'title', type: 'text' },
          { name: 'mood', type: 'select', options: { choiceList: 'mood' } },
          { name: 'author', type: 'relation', options: { relatedContentType: 'author', cardinality: 'one' } },
          { name: 'credits', type: 'repeater', options: { subFields: [
            { name: 'who', type: 'relation', options: { relatedContentType: 'author', cardinality: 'one' } },
          ] } },
        ],
      }).expect(201);

    const a = await request(server).post('/api/entries').set(auth)
      .send({ contentTypeId: author.body.id, slug: 'asha', status: 'published', data: { name: 'Asha' } }).expect(201);
    authorId = a.body.publicId;
    const p = await request(server).post('/api/entries').set(auth)
      .send({ contentTypeId: post.body.id, slug: 'hello', status: 'published', data: { title: 'Hello', mood: 'calm', author: authorId, credits: [{ who: authorId }] } })
      .expect(201);
    postId = p.body.publicId;
    await request(server).post('/api/entries').set(auth)
      .send({ contentTypeId: post.body.id, slug: 'hello', locale: 'fr', status: 'draft', data: { title: 'Bonjour', author: authorId } }).expect(201);

    await request(server).post('/api/forms').set(auth).send(contactForm).expect(201);
    await request(server).post('/api/webhooks').set(auth).send(signHook).expect(201);
    await request(server).post('/api/redirects').set(auth).send(moved).expect(201);

    for (const [name, permissions] of [['full', { access: 'all', contentTypes: ['*'] }], ['write', { access: 'write', contentTypes: ['*'] }]] as const) {
      const res = await request(server).post('/api/api-keys').set(auth).send({ name, permissions }).expect(201);
      keys[name] = res.body.key;
    }
    env = { NODEPRESS_URL: `http://127.0.0.1:${port}`, NODEPRESS_TOKEN: keys.full };
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'np-site-'));
  });

  afterAll(async () => {
    fs.rmSync(dir, { recursive: true, force: true });
    await cleanDatabase(app);
    await app.close();
  });

  it('exports the content model and every entry in one file', async () => {
    const res = await request(server).get('/api/site/export').set(auth).expect(200);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="nodepress-site-/);
    bundle = res.body;
    expect(bundle).toMatchObject({ format: 'nodepress-site', version: 2, locales: { defaultLocale: 'en', locales: ['en', 'fr'] } });
    expect(bundle.contentTypes.map((t: any) => t.name)).toEqual(['author', 'post']);
    expect(bundle.choiceLists.map((l: any) => l.name)).toEqual(['mood']);
    expect(bundle.entries.author).toEqual([expect.objectContaining({ publicId: authorId, slug: 'asha', locale: 'en', status: 'published' })]);
    expect(bundle.entries.post.map((e: any) => `${e.slug}/${e.locale}/${e.status}`)).toEqual(['hello/en/published', 'hello/fr/draft']);
    // No credentials in the file: form webhook headers and webhook secrets stay behind.
    expect(bundle.forms).toEqual([{ ...contactForm, actions: [{ type: 'webhook', url: 'https://example.test/hook', headersRemoved: true }] }]);
    expect(bundle.webhooks[0]).not.toHaveProperty('secret');
    const { secret: _secret, ...hookInFile } = signHook;
    expect(bundle.webhooks).toEqual([hookInFile]);
    expect(bundle.redirects).toEqual([moved]);
  });

  it('previews a re-import on the same site as updates', async () => {
    const res = await request(server).post('/api/site/import?dryRun=true').set(auth).send(bundle).expect(201);
    expect(res.body.schemas.choiceLists).toEqual({ total: 1, toCreate: 0, toUpdate: 1, toSkip: 0 });
    expect(res.body).toMatchObject({
      dryRun: true, valid: true, errors: [], localesToAdd: [],
      schemas: { toCreate: 0, toUpdate: 2 },
      entries: { total: 3, toCreate: 0, toUpdate: 3, toRestore: 0, toSkip: 0, relinked: 0 },
      forms: { total: 1, toCreate: 0, toUpdate: 1, toSkip: 0 },
      webhooks: { total: 1, toCreate: 0, toUpdate: 1, toSkip: 0, active: [] },
      redirects: { total: 1, toCreate: 0, toUpdate: 1, toSkip: 0 },
    });
  });

  it('rebuilds an empty site with the same ids, so relations still resolve', async () => {
    await wipeContent();
    const res = await request(server).post('/api/site/import').set(auth).send(bundle).expect(201);
    expect(res.body.schemas.choiceLists).toEqual({ created: 1, updated: 0, skipped: 0 });
    expect(res.body).toMatchObject({ entries: { created: 3, updated: 0 }, localesAdded: ['fr'], errors: [] });
    expect(res.body.schemas).toMatchObject({ created: 2 });
    expect(res.body.forms).toEqual({ created: 1, updated: 0, skipped: 0 });
    expect(res.body.webhooks).toEqual({ created: 1, updated: 0, skipped: 0 });
    expect(res.body.redirects).toEqual({ created: 1, updated: 0, skipped: 0 });
    // The file has no signing secret, so a new webhook waits, switched off, for one.
    expect(await prisma.webhook.findFirstOrThrow({ where: { name: 'Rebuild' } })).toMatchObject({ ...signHook, secret: null, enabled: false });
    const resolved = await request(server).get('/api/redirects/resolve').query({ path: '/old' }).expect(200);
    expect(resolved.body).toMatchObject({ to: '/new', statusCode: 301 });

    const form = await prisma.form.findUniqueOrThrow({ where: { slug: 'contact' } });
    expect(form).toMatchObject({ ...contactForm, actions: [{ type: 'webhook', url: 'https://example.test/hook' }] });
    await request(server).post('/api/submit/contact').send({ data: { email: 'not an email' } }).expect((r) => expect(r.status).toBeGreaterThanOrEqual(400));
    await request(server).post('/api/submit/contact').send({ data: { email: 'a@example.test' } }).expect(201);

    const post = await request(server).get('/api/post/hello').query({ populate: 'author' }).expect(200);
    expect(post.body.id ?? post.body.publicId).toBe(postId);
    expect(post.body.data.author).toMatchObject({ slug: 'asha' });
    const fr = await prisma.entry.findFirst({ where: { slug: 'hello', locale: 'fr' } });
    expect(fr).toMatchObject({ status: 'draft', publicId: bundle.entries.post[1].publicId });
    expect(await prisma.choiceList.count()).toBe(1);
    const locales = await request(server).get('/api/locales').expect(200);
    expect(locales.body.locales).toEqual(['en', 'fr']);
  });

  it('relinks relations to an entry that has another id on this site', async () => {
    await prisma.entry.deleteMany({});
    const authorType = await prisma.contentType.findFirstOrThrow({ where: { name: 'author' } });
    const other = await request(server).post('/api/entries').set(auth)
      .send({ contentTypeId: authorType.id, slug: 'asha', status: 'published', data: { name: 'Asha here' } }).expect(201);

    const dry = await request(server).post('/api/site/import?dryRun=true').set(auth).send(bundle).expect(201);
    expect(dry.body.entries).toMatchObject({ toCreate: 2, toUpdate: 1, relinked: 1 });
    await request(server).post('/api/site/import').set(auth).send(bundle).expect(201);

    const post = await prisma.entry.findFirstOrThrow({ where: { slug: 'hello', locale: 'en' } });
    expect(post.data).toMatchObject({ author: other.body.publicId, credits: [expect.objectContaining({ who: other.body.publicId })] });
    const author = await prisma.entry.findFirstOrThrow({ where: { slug: 'asha' } });
    expect(author).toMatchObject({ publicId: other.body.publicId, data: { name: 'Asha' } });
  });

  it('keeps existing entries with overwrite=false and restores ones in the trash', async () => {
    const hello = await prisma.entry.findFirstOrThrow({ where: { slug: 'hello', locale: 'en' } });
    await prisma.entry.update({ where: { id: hello.id }, data: { data: { title: 'Changed here' } } });
    const fr = await prisma.entry.findFirstOrThrow({ where: { slug: 'hello', locale: 'fr' } });
    await prisma.entry.update({ where: { id: fr.id }, data: { deletedAt: new Date() } });

    const res = await request(server).post('/api/site/import?overwrite=false').set(auth).send(bundle).expect(201);
    expect(res.body.entries).toMatchObject({ created: 0, updated: 1, skipped: 2 });
    expect((await prisma.entry.findUniqueOrThrow({ where: { id: hello.id } })).data).toEqual({ title: 'Changed here' });
    expect((await prisma.entry.findUniqueOrThrow({ where: { id: fr.id } })).deletedAt).toBeNull();
  });

  it('updates a form in place, keeping its submissions, unless told to keep it', async () => {
    const before = await prisma.form.findUniqueOrThrow({ where: { slug: 'contact' } });
    const kept = await prisma.formSubmission.create({ data: { formId: before.id, data: { email: 'keep@example.test' } } });
    await prisma.form.update({ where: { id: before.id }, data: { name: 'Edited here' } });

    const keep = await request(server).post('/api/site/import?overwrite=false').set(auth).send(bundle).expect(201);
    expect(keep.body.forms).toEqual({ created: 0, updated: 0, skipped: 1 });
    expect((await prisma.form.findUniqueOrThrow({ where: { id: before.id } })).name).toBe('Edited here');

    const update = await request(server).post('/api/site/import').set(auth).send(bundle).expect(201);
    expect(update.body.forms).toEqual({ created: 0, updated: 1, skipped: 0 });
    expect((await prisma.form.findUniqueOrThrow({ where: { id: before.id } })).name).toBe('Contact');
    expect(await prisma.formSubmission.findUnique({ where: { id: kept.id } })).not.toBeNull();
  });

  it('updates webhooks and redirects in place, unless told to keep them', async () => {
    const hook = await prisma.webhook.findFirstOrThrow({ where: { name: 'Rebuild' } });
    await prisma.webhook.update({ where: { id: hook.id }, data: { secret: 'changed here' } });
    await prisma.redirect.update({ where: { from: '/old' }, data: { to: '/elsewhere', hits: 9 } });

    const keep = await request(server).post('/api/site/import?overwrite=false').set(auth).send(bundle).expect(201);
    expect(keep.body.webhooks).toEqual({ created: 0, updated: 0, skipped: 1 });
    expect(keep.body.redirects).toEqual({ created: 0, updated: 0, skipped: 1 });
    expect((await prisma.webhook.findUniqueOrThrow({ where: { id: hook.id } })).secret).toBe('changed here');
    expect((await prisma.redirect.findUniqueOrThrow({ where: { from: '/old' } })).to).toBe('/elsewhere');

    await request(server).post('/api/site/import').set(auth).send(bundle).expect(201);
    expect(await prisma.webhook.count()).toBe(1);
    // The file has no secret, so the one saved here stays.
    expect((await prisma.webhook.findUniqueOrThrow({ where: { id: hook.id } })).secret).toBe('changed here');
    expect(await prisma.redirect.findUniqueOrThrow({ where: { from: '/old' } })).toMatchObject({ to: '/new', hits: 9 });
    const resolved = await request(server).get('/api/redirects/resolve').query({ path: '/old' }).expect(200);
    expect(resolved.body.to).toBe('/new');
  });

  it('warns where an imported webhook will send events', async () => {
    const on = { ...bundle, webhooks: [{ ...signHook, enabled: true }] };
    const res = await request(server).post('/api/site/import?dryRun=true').set(auth).send(on).expect(201);
    expect(res.body.webhooks.active).toEqual([signHook.url]);
  });

  it('refuses redirect loops and bad rows without changing anything', async () => {
    const before = await prisma.redirect.count();
    const loop = { ...bundle, redirects: [{ from: '/a', to: '/b', statusCode: 301 }, { from: '/b', to: '/a', statusCode: 301 }] };
    const res = await request(server).post('/api/site/import').set(auth).send(loop).expect(400);
    expect(res.body.errors.join(' ')).toMatch(/loop/);
    const bad = { ...bundle, redirects: [{ from: '/c', to: 'javascript:alert(1)', statusCode: 301 }] };
    await request(server).post('/api/site/import').set(auth).send(bad).expect(400);
    expect(await prisma.redirect.count()).toBe(before);
  });

  it('saves a version of what it overwrites, which can be restored', async () => {
    await request(server).post('/api/site/import').set(auth).send(bundle).expect(201);
    const entry = await prisma.entry.findFirstOrThrow({ where: { slug: 'hello', locale: 'en' } });
    const before = await prisma.entryVersion.count({ where: { entryId: entry.id } });

    await request(server).post('/api/site/import').set(auth).send(bundle).expect(201);
    expect(await prisma.entryVersion.count({ where: { entryId: entry.id } })).toBe(before);

    await prisma.entry.update({ where: { id: entry.id }, data: { data: { ...(entry.data as object), title: 'Edited here' } } });
    await request(server).post('/api/site/import').set(auth).send(bundle).expect(201);
    expect((await prisma.entry.findUniqueOrThrow({ where: { id: entry.id } })).data).toMatchObject({ title: 'Hello' });

    const version = await prisma.entryVersion.findFirstOrThrow({ where: { entryId: entry.id }, orderBy: { id: 'desc' } });
    expect(version.data).toMatchObject({ title: 'Edited here' });
    expect(version.createdBy).toEqual(expect.any(Number));
    expect(await prisma.entryVersion.count({ where: { entryId: entry.id } })).toBe(before + 1);

    await request(server).post(`/api/entries/${entry.id}/versions/${version.id}/restore`).set(auth).expect(201);
    expect((await prisma.entry.findUniqueOrThrow({ where: { id: entry.id } })).data).toMatchObject({ title: 'Edited here' });
    await request(server).post('/api/site/import').set(auth).send(bundle).expect(201);
  });

  it('still reads a file from before forms were exported', async () => {
    const { forms, webhooks, redirects, ...old } = bundle;
    const res = await request(server).post('/api/site/import?dryRun=true').set(auth).send(old).expect(201);
    expect(res.body).toMatchObject({ valid: true, forms: { total: 0, toCreate: 0, toUpdate: 0, toSkip: 0 } });
  });

  it('refuses a file with a broken form without changing anything', async () => {
    const before = await prisma.entry.count();
    const bad = { ...bundle, forms: [{ name: 'Bad', slug: 'api', fields: [] }] };
    const res = await request(server).post('/api/site/import').set(auth).send(bad).expect(400);
    expect(res.body.errors.join(' ')).toMatch(/reserved slug/);
    expect(await prisma.form.count({ where: { name: 'Bad' } })).toBe(0);
    expect(await prisma.entry.count()).toBe(before);
  });

  it('refuses a broken file without changing anything', async () => {
    await request(server).post('/api/site/import').set(auth).send({ contentTypes: [] }).expect(400);
    const broken = { ...bundle, entries: { ...bundle.entries, post: [...bundle.entries.post, { slug: 'Not Valid', status: 'draft' }] } };
    const dry = await request(server).post('/api/site/import?dryRun=true').set(auth).send(broken).expect(201);
    expect(dry.body.valid).toBe(false);
    expect(dry.body.errors).toEqual([expect.stringContaining('Invalid slug')]);
    const before = await prisma.entry.count();
    const res = await request(server).post('/api/site/import').set(auth).send(broken).expect(400);
    expect(res.body.errors).toHaveLength(1);
    expect(await prisma.entry.count()).toBe(before);
  });

  it('accepts files over the global 1 MB body limit', async () => {
    const big = { ...bundle, entries: { author: [{ ...bundle.entries.author[0], data: { name: 'x'.repeat(1_500_000) } }] } };
    const res = await request(server).post('/api/site/import?dryRun=true').set(auth).send(big).expect(201);
    expect(res.body.valid).toBe(true);
  });

  it('needs an admin or a full-access key', async () => {
    await request(server).get('/api/site/export').expect(401);
    await request(server).get('/api/site/export').set('X-API-Key', keys.write).expect(403);
    await request(server).get('/api/site/export').set('X-API-Key', keys.full).expect(200);
  });

  it('nodepress site:export and site:import', async () => {
    const exp = await cli(['site:export', '--out', 'site.json'], env, dir);
    expect(exp.code).toBe(0);
    expect(exp.out).toMatch(/2 content types, 0 components, 1 choice list, 3 entries/);
    const file = JSON.parse(fs.readFileSync(path.join(dir, 'site.json'), 'utf8'));
    expect(file.format).toBe('nodepress-site');

    await wipeContent();
    const dry = await cli(['site:import', 'site.json', '--dry-run'], env, dir);
    expect(dry.code).toBe(0);
    expect(dry.out).toMatch(/Entries: 3 new/);
    expect(dry.out).toMatch(/Languages to add: fr/);
    expect(await prisma.entry.count()).toBe(0);

    const noTty = await cli(['site:import', 'site.json'], env, dir);
    expect(noTty.code).toBe(1);
    const run = await cli(['site:import', 'site.json', '--yes'], env, dir);
    expect(run.code).toBe(0);
    expect(run.out).toMatch(/entries 3 created/);
    expect(await prisma.entry.count()).toBe(3);
  });

  describe('everything except media files and credentials', () => {
    const png = Buffer.from('fake').toString('base64');
    let full: any;

    it('exports users, roles, media records, settings, history and the trash, with no credential in the file', async () => {
      await prisma.media.deleteMany({});
      await prisma.mediaFolder.deleteMany({});
      await prisma.setting.update({ where: { id: 1 }, data: {
        brandName: 'Moved Site',
        mail: { host: 'smtp.example.test', port: 587, secure: false, user: 'mailer', pass: 'SEALED-MAIL-PASS', from: null },
      } });
      await prisma.role.create({ data: { name: 'reviewer', label: 'Reviewer', baseRole: 'editor' } });
      await prisma.roleAccess.create({ data: { role: 'reviewer', module: 'media', level: 'view' } });
      await prisma.permission.create({ data: { role: 'reviewer', contentType: 'post', actions: ['read'] } });
      await prisma.user.create({ data: { email: 'writer@example.test', password: 'HASHED-PASSWORD-VALUE', role: 'reviewer', twoFactorSecret: 'TWO-FACTOR-VALUE' } });
      await prisma.apiKey.create({ data: { name: 'site', key: 'np_LIVE-KEY-VALUE', permissions: { access: 'read', contentTypes: ['*'] } } });
      await prisma.webhook.updateMany({ data: { secret: 'WEBHOOK-SECRET-VALUE' } });
      const folder = await prisma.mediaFolder.create({ data: { name: 'photos' } });
      const sub = await prisma.mediaFolder.create({ data: { name: '2026', parentId: folder.id } });
      await prisma.media.create({ data: {
        filename: 'a.png', url: `${process.env.APP_URL ?? 'http://old.example.test'}/uploads/a.png`, originalName: 'a.png', mimetype: 'image/png', size: 4, folderId: sub.id,
      } });
      const form = await prisma.form.findFirstOrThrow();
      await prisma.formSubmission.create({ data: { formId: form.id, data: { email: 'visitor@example.test' }, ip: '1.2.3.4', files: { create: [
        { id: 'file-1', field: 'cv', filename: 'cv.pdf', mimetype: 'application/pdf', size: 4, data: new Uint8Array(Buffer.from('fake')) },
      ] } } });
      const entry = await prisma.entry.findFirstOrThrow({ where: { deletedAt: null } });
      await prisma.entryVersion.create({ data: { entryId: entry.id, slug: entry.slug, data: { title: 'old' }, status: 'draft' } });
      const trashed = await prisma.entry.create({ data: { slug: 'binned', status: 'draft', data: {}, contentTypeId: entry.contentTypeId, deletedAt: new Date() } });
      await prisma.release.create({ data: { name: 'Launch', items: { create: [{ entryId: entry.id }] } } });

      const res = await request(server).get('/api/site/export').set(auth).expect(200);
      full = res.body;
      const text = JSON.stringify(full);
      for (const secret of ['HASHED-PASSWORD-VALUE', 'TWO-FACTOR-VALUE', 'np_LIVE-KEY-VALUE', 'WEBHOOK-SECRET-VALUE', 'SEALED-MAIL-PASS']) expect(text).not.toContain(secret);
      expect(full.users.find((u: any) => u.email === 'writer@example.test')).toEqual({ email: 'writer@example.test', role: 'reviewer', createdAt: expect.any(String) });
      expect(full.settings.mail).toEqual({ host: 'smtp.example.test', port: 587, secure: false, user: 'mailer', from: null });
      expect(full.brand.brandName).toBe('Moved Site');
      expect(full.mediaFolders).toEqual([['photos'], ['photos', '2026']]);
      expect(full.media[0]).toMatchObject({ filename: 'a.png', folder: ['photos', '2026'] });
      expect(full.formSubmissions[0].files[0]).toMatchObject({ id: 'file-1', data: png });
      expect(full.entries[Object.keys(full.entries).find((t) => full.entries[t].some((e: any) => e.slug === 'binned'))!].find((e: any) => e.slug === 'binned').deletedAt).toEqual(trashed.deletedAt!.toISOString());
      expect(full.entryVersions.length).toBeGreaterThan(0);
      expect(full.releases[0].items[0].entry).toBe(entry.publicId);
      expect(full.auditLog.length).toBeGreaterThan(0);
      expect(full).not.toHaveProperty('apiKeys');
    });

    it('keeps form webhook headers saved here, and says when a new form needs them', async () => {
      const headers = { Authorization: 'Bearer FORM-TOKEN-VALUE' };
      const action = { type: 'webhook', url: 'https://example.test/hook', headers };
      const saved = await prisma.form.create({ data: { name: 'Temp', slug: 'temp-form', fields: [{ name: 'email', type: 'email' }], actions: [action] } });
      const out = (await request(server).get('/api/site/export').set(auth).expect(200)).body;
      expect(JSON.stringify(out)).not.toContain('FORM-TOKEN-VALUE');
      const small = { format: out.format, version: out.version, forms: out.forms.filter((f: any) => f.slug === 'temp-form') };

      const update = await request(server).post('/api/site/import').set(auth).send(small).expect(201);
      expect(update.body.notes.map((n: any) => n.code)).not.toContain('formHeaders');
      expect((await prisma.form.findUniqueOrThrow({ where: { id: saved.id } })).actions).toEqual([action]);

      await prisma.form.delete({ where: { id: saved.id } });
      const fresh = await request(server).post('/api/site/import').set(auth).send(small).expect(201);
      expect(fresh.body.notes).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'formHeaders', count: 1 })]));
      const made = await prisma.form.findUniqueOrThrow({ where: { slug: 'temp-form' } });
      expect(made.actions).toEqual([{ type: 'webhook', url: 'https://example.test/hook' }]);
      await prisma.form.delete({ where: { id: made.id } });
    });

    it('an API key gets the content only, and cannot bring in users', async () => {
      const made = await request(server).post('/api/api-keys').set(auth).send({ name: 'ci', permissions: { access: 'all', contentTypes: ['*'] } }).expect(201);
      const key = { 'X-API-Key': made.body.key };
      const out = await request(server).get('/api/site/export').set(key).expect(200);
      expect(out.body.partial).toBe(true);
      for (const k of ['users', 'roles', 'media', 'formSubmissions', 'auditLog', 'settings']) expect(out.body).not.toHaveProperty(k);
      const evil = { ...out.body, users: [{ email: 'attacker@example.test', role: 'admin' }] };
      const res = await request(server).post('/api/site/import').set(key).send(evil).expect(201);
      expect(res.body.notes.map((n: any) => n.code)).toContain('adminOnly');
      expect(await prisma.user.findUnique({ where: { email: 'attacker@example.test' } })).toBeNull();
      await prisma.apiKey.deleteMany({ where: { name: 'ci' } });
    });

    it('rebuilds an emptied site, without passwords, and a second import adds nothing', async () => {
      const me = await prisma.user.findFirstOrThrow({ where: { role: 'admin' } });
      await prisma.user.deleteMany({ where: { id: { not: me.id } } });
      await prisma.apiKey.deleteMany({});
      await prisma.release.deleteMany({});
      await prisma.media.deleteMany({});
      await prisma.mediaFolder.deleteMany({});
      await prisma.auditLog.deleteMany({});
      await prisma.role.deleteMany({});
      await prisma.roleAccess.deleteMany({});
      await prisma.permission.deleteMany({ where: { role: 'reviewer' } });
      await prisma.webhook.deleteMany({});
      await wipeContent();
      await prisma.setting.update({ where: { id: 1 }, data: { brandName: 'NodePress', mail: Prisma.DbNull } });
      const file = { ...full, siteUrl: 'http://old.example.test', media: full.media.map((m: any) => ({ ...m, url: 'http://old.example.test/uploads/a.png' })) };

      const dry = await request(server).post('/api/site/import?dryRun=true').set(auth).send(file).expect(201);
      expect(dry.body.errors).toEqual([]);
      expect(dry.body.extras.users.toCreate).toBe(1);
      expect(dry.body.extras.media.toCreate).toBe(1);
      const codes = dry.body.notes.map((n: any) => n.code);
      expect(codes).toEqual(expect.arrayContaining(['usersSetPassword', 'secretsLeftOut', 'webhooksOff', 'mediaLinks', 'mediaMissing']));
      expect(await prisma.user.count()).toBe(1);

      const res = await request(server).post('/api/site/import').set(auth).send(file).expect(201);
      expect(res.body.errors).toEqual([]);
      expect(res.body.extras.formSubmissions).toEqual({ created: 1, updated: 0, skipped: 0 });

      const writer = await prisma.user.findUniqueOrThrow({ where: { email: 'writer@example.test' } });
      expect(writer.role).toBe('reviewer');
      expect(writer.twoFactorSecret).toBeNull();
      await request(server).post('/api/auth/login').send({ email: writer.email, password: 'HASHED-PASSWORD-VALUE' }).expect(401);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).password).toBe(me.password);

      const media = await prisma.media.findUniqueOrThrow({ where: { filename: 'a.png' }, include: { folder: { include: { parent: true } } } });
      expect(media.url).toBe(`${process.env.APP_URL}/uploads/a.png`);
      expect(media.folder?.name).toBe('2026');
      expect(media.folder?.parent?.name).toBe('photos');
      const setting = await prisma.setting.findUniqueOrThrow({ where: { id: 1 } });
      expect(setting.brandName).toBe('Moved Site');
      expect((setting.mail as any).pass).toBeNull();
      const hook = await prisma.webhook.findFirstOrThrow();
      expect(hook).toMatchObject({ enabled: false, secret: null });
      expect(await prisma.entry.findFirst({ where: { slug: 'binned', deletedAt: { not: null } } })).not.toBeNull();
      const sub = await prisma.formSubmission.findFirstOrThrow({ include: { files: true } });
      expect(Buffer.from(sub.files[0].data).toString()).toBe('fake');
      expect(await prisma.release.count()).toBe(1);
      expect((await prisma.release.findFirstOrThrow({ include: { items: true } })).items).toHaveLength(1);
      expect(await prisma.roleAccess.count({ where: { role: 'reviewer' } })).toBe(1);
      const versions = await prisma.entryVersion.count();
      const subs = await prisma.formSubmission.count();

      const again = await request(server).post('/api/site/import').set(auth).send(file).expect(201);
      expect(again.body.errors).toEqual([]);
      expect(await prisma.formSubmission.count()).toBe(subs);
      // Re-importing the same data adds no history.
      expect(await prisma.entryVersion.count()).toBe(versions);
      const first = full.auditLog[0];
      expect(await prisma.auditLog.count({ where: { createdAt: new Date(first.createdAt), action: first.action, resourceId: first.resourceId } })).toBe(1);
      expect(await prisma.user.count()).toBe(2);
      // The site's own secret set here survives another import.
      await prisma.webhook.update({ where: { id: hook.id }, data: { secret: 'set here', enabled: true } });
      await request(server).post('/api/site/import').set(auth).send(file).expect(201);
      expect(await prisma.webhook.findUniqueOrThrow({ where: { id: hook.id } })).toMatchObject({ secret: 'set here', enabled: true });
    });
  });
});
