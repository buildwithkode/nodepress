import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin } from './helpers';

const PDF = Buffer.from('%PDF-1.7 resume bytes');

describe('Form file uploads (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let formId: number;
  const slug = 'apply';
  const submit = () => request(app.getHttpServer()).post(`/api/submit/${slug}`);
  const submissions = () =>
    request(app.getHttpServer())
      .get(`/api/forms/${formId}/submissions`)
      .set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    token = await registerAdmin(app);
    const res = await request(app.getHttpServer())
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Apply',
        slug,
        fields: [
          { name: 'name', label: 'Name', type: 'text' },
          { name: 'resume', label: 'Resume', type: 'file', validation: { required: true } },
        ],
      })
      .expect(201);
    formId = res.body.id;
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  it('saves a multipart submission, and only the admin can download the file', async () => {
    const res = await submit()
      .field('data', JSON.stringify({ name: 'Asha' }))
      .attach('resume', PDF, { filename: 'cv.pdf', contentType: 'text/html' })
      .expect(201);
    expect(res.body.success).toBe(true);

    const list = await submissions().expect(200);
    const row = list.body.data[0];
    expect(row.data.name).toBe('Asha');
    // The type comes from the bytes, not from what the sender claimed.
    expect(row.data.resume).toMatchObject({ filename: 'cv.pdf', mimetype: 'application/pdf', size: PDF.length });

    const url = `/api/forms/${formId}/submissions/${row.id}/files/${row.data.resume.fileId}`;
    await request(app.getHttpServer()).get(url).expect(401);

    const file = await request(app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((r, done) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(file.headers['content-disposition']).toMatch(/^attachment; filename="cv\.pdf"/);
    expect(file.headers['content-type']).toContain('application/pdf');
    expect(Buffer.compare(file.body, PDF)).toBe(0);

    // A file can't be reached through another submission's address.
    await request(app.getHttpServer())
      .get(`/api/forms/${formId}/submissions/${row.id + 1}/files/${row.data.resume.fileId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('refuses a missing file, a forged value and a disguised file', async () => {
    await submit().send({ data: { name: 'No file' } }).expect(400);
    await submit()
      .send({ data: { name: 'Forged', resume: { fileId: 'x', filename: 'x.pdf' } } })
      .expect(400);
    await submit()
      .field('data', JSON.stringify({ name: 'Fake' }))
      .attach('resume', Buffer.from('<html></html>'), 'cv.pdf')
      .expect(400);
  });

  it('removes the files along with the form', async () => {
    const list = await submissions().expect(200);
    const row = list.body.data[0];
    await request(app.getHttpServer())
      .delete(`/api/forms/${formId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/forms/${formId}/submissions/${row.id}/files/${row.data.resume.fileId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
