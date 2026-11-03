import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin, inviteUser } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/** The Forms page's own export and import: GET /api/forms/export, POST /api/forms/import. */
describe('Forms export / import (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let prisma: PrismaService;
  let auth: { Authorization: string };
  let file: any;

  const contact = {
    name: 'Contact',
    slug: 'contact',
    fields: [{ name: 'email', type: 'email', required: true }],
    actions: [{ type: 'email', to: 'team@example.test', subject: 'New message' }],
    isActive: true,
    captchaEnabled: false,
  };

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    prisma = app.get(PrismaService);
    auth = { Authorization: `Bearer ${await registerAdmin(app)}` };
    server = app.getHttpServer();
    await request(server).post('/api/forms').set(auth).send(contact).expect(201);
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  it('exports every form without ids or submissions', async () => {
    const res = await request(server).get('/api/forms/export').set(auth).expect(200);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="nodepress-forms-/);
    expect(res.headers['cache-control']).toBe('private, no-store');
    file = res.body;
    expect(file).toMatchObject({ format: 'nodepress-forms', version: 1 });
    expect(file.forms).toEqual([contact]);
  });

  it('previews without writing, then recreates a deleted form', async () => {
    await prisma.form.deleteMany({});
    const dry = await request(server).post('/api/forms/import?dryRun=true').set(auth).send(file).expect(201);
    expect(dry.body).toEqual({ dryRun: true, valid: true, errors: [], total: 1, toCreate: 1, toUpdate: 0, toSkip: 0 });
    expect(await prisma.form.count()).toBe(0);

    const res = await request(server).post('/api/forms/import').set(auth).send(file).expect(201);
    expect(res.body).toEqual({ created: 1, updated: 0, skipped: 0, errors: [] });
    expect(await prisma.form.findUniqueOrThrow({ where: { slug: 'contact' } })).toMatchObject(contact);
    await request(server).post('/api/submit/contact').send({ data: { email: 'a@example.test' } }).expect(201);
  });

  it('updates in place and keeps submissions, unless told to keep the form', async () => {
    const form = await prisma.form.findUniqueOrThrow({ where: { slug: 'contact' } });
    await prisma.form.update({ where: { id: form.id }, data: { name: 'Edited here' } });
    const submissions = await prisma.formSubmission.count({ where: { formId: form.id } });
    expect(submissions).toBeGreaterThan(0);

    const keep = await request(server).post('/api/forms/import?overwrite=false').set(auth).send(file).expect(201);
    expect(keep.body).toEqual({ created: 0, updated: 0, skipped: 1, errors: [] });
    expect((await prisma.form.findUniqueOrThrow({ where: { id: form.id } })).name).toBe('Edited here');

    const update = await request(server).post('/api/forms/import').set(auth).send(file).expect(201);
    expect(update.body).toEqual({ created: 0, updated: 1, skipped: 0, errors: [] });
    expect((await prisma.form.findUniqueOrThrow({ where: { id: form.id } })).name).toBe('Contact');
    expect(await prisma.formSubmission.count({ where: { formId: form.id } })).toBe(submissions);
  });

  it('refuses another kind of file, and a broken form without writing anything', async () => {
    await request(server).post('/api/forms/import').set(auth).send({ format: 'nodepress-site', version: 1 }).expect(400);
    await request(server).post('/api/forms/import').set(auth).send({ format: 'nodepress-forms', version: 99, forms: [] }).expect(400);

    const bad = { ...file, forms: [{ ...contact, slug: 'fine', name: 'Fine' }, { ...contact, slug: 'api' }] };
    const dry = await request(server).post('/api/forms/import?dryRun=true').set(auth).send(bad).expect(201);
    expect(dry.body.valid).toBe(false);
    const res = await request(server).post('/api/forms/import').set(auth).send(bad).expect(400);
    expect(res.body.errors.join(' ')).toMatch(/reserved slug/);
    expect(await prisma.form.count({ where: { slug: 'fine' } })).toBe(0);
  });

  it('needs a login, and edit access to import', async () => {
    await request(server).get('/api/forms/export').expect(401);
    await request(server).post('/api/forms/import').send(file).expect(401);
    const { token } = await inviteUser(app, auth.Authorization.slice(7), 'viewer@example.test', 'viewer');
    await request(server).post('/api/forms/import').set({ Authorization: `Bearer ${token}` }).send(file).expect(403);
  });
});
