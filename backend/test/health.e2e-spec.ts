import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase } from './helpers';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  it('GET /api/health → returns status up', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);

    expect(res.body.status).toBe('ok');
    expect(res.body.info?.database?.status).toBe('up');
  });

  it('GET /api/sitemap.xml → returns valid XML', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/sitemap.xml')
      .expect(200);

    expect(res.headers['content-type']).toMatch(/xml/);
    expect(res.text).toContain('<?xml version="1.0"');
    expect(res.text).toContain('<urlset');
  });

  it('GET /api/robots.txt → returns text with User-agent and Sitemap', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/robots.txt')
      .expect(200);

    expect(res.headers['content-type']).toMatch(/text/);
    expect(res.text).toContain('User-agent: *');
    expect(res.text).toContain('Sitemap:');
  });
});
