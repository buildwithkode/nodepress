import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as express from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser = require('cookie-parser');
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { parseQueryString } from '../src/common/query-parser';
import { setupContentDocs } from '../src/openapi/openapi.setup';
import { lintOpenApi } from '../src/openapi/openapi-lint';
import { cleanDatabase, registerAdmin } from './helpers';

/**
 * GET /api/openapi.json and the Swagger UI at /api/docs/content. The app is
 * built here rather than with createTestApp() because the Swagger UI routes
 * must be registered before app.init(), as main.ts does.
 */
describe('OpenAPI content document (e2e)', () => {
  let app: INestApplication;
  let auth: { Authorization: string };
  let blogId: number;

  const doc = async () => {
    const res = await request(app.getHttpServer()).get('/api/openapi.json').expect(200);
    return res.body;
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const a = moduleFixture.createNestApplication<NestExpressApplication>();
    a.set('query parser', parseQueryString);
    a.use(express.json({ limit: '1mb' }));
    a.use(cookieParser());
    a.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    a.setGlobalPrefix('api');
    // Same order as main.ts: the static core docs, then the content docs.
    SwaggerModule.setup('api/docs', a, SwaggerModule.createDocument(a, new DocumentBuilder().setTitle('core').build()));
    setupContentDocs(a);
    await a.init();
    app = a;

    await cleanDatabase(app);
    auth = { Authorization: `Bearer ${await registerAdmin(app)}` };
    const server = app.getHttpServer();
    await request(server).post('/api/content-types').set(auth).send({
      name: 'author',
      allowedMethods: ['list', 'read'],
      schema: [{ name: 'name', type: 'text', required: true }],
    }).expect(201);
    const blog = await request(server).post('/api/content-types').set(auth).send({
      name: 'blog',
      displayName: 'Blog',
      schema: [
        { name: 'title', type: 'text', required: true },
        { name: 'kind', type: 'select', options: { choices: ['news', 'howto'] } },
        { name: 'author', type: 'relation', options: { relatedContentType: 'author', cardinality: 'one' } },
        { name: 'sections', type: 'flexible', options: { layouts: [{ name: 'hero', fields: [{ name: 'heading', type: 'text' }] }] } },
        { name: 'secret_notes', type: 'text', options: { readRoles: ['admin'] } },
      ],
    }).expect(201);
    blogId = blog.body.id;
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  it('is public, structurally valid and follows allowedMethods', async () => {
    const d = await doc();
    expect(d.openapi).toBe('3.1.0');
    expect(lintOpenApi(d)).toEqual([]);
    expect(Object.keys(d.paths).sort()).toEqual(['/author', '/author/{slug}', '/blog', '/blog/{slug}']);
    expect(Object.keys(d.paths['/author'])).toEqual(['get']);
    expect(Object.keys(d.paths['/blog/{slug}'])).toEqual(['get', 'put', 'delete']);
    expect(d.components.schemas.Blog).toBeDefined();
    expect(d.components.schemas.BlogInput.required).toEqual(['title']);
    expect(d.components.schemas.BlogData.properties.secret_notes).toBeUndefined();
    expect(d.components.schemas.BlogSectionsHero.properties._layout.const).toBe('hero');
  });

  it('describes the real responses', async () => {
    const server = app.getHttpServer();
    await request(server).post('/api/blog').set(auth).send({ slug: 'hello', data: { title: 'Hello', kind: 'news', secret_notes: 'x' } }).expect(201);
    const entry = (await request(server).get('/api/blog/hello').expect(200)).body;
    const d = await doc();
    const entrySchema = d.components.schemas.Blog;
    for (const k of Object.keys(entry)) expect(Object.keys(entrySchema.properties)).toContain(k);
    for (const k of entrySchema.required) expect(entry).toHaveProperty(k);
    // Plugins may add keys of their own (e.g. _seo_score), so data is open; the hidden field is gone.
    expect(entry.data).toMatchObject({ title: 'Hello', kind: 'news' });
    expect(entry.data.secret_notes).toBeUndefined();
    expect(d.components.schemas.BlogData.additionalProperties).not.toBe(false);
    const list = (await request(server).get('/api/blog').expect(200)).body;
    for (const k of d.components.schemas.BlogList.required) expect(list).toHaveProperty(k);
  });

  it('rebuilds when content types change', async () => {
    const server = app.getHttpServer();
    await request(server).put(`/api/content-types/${blogId}`).set(auth).send({
      allowedMethods: ['list', 'read'],
      schema: [{ name: 'title', type: 'text', required: true }, { name: 'subtitle', type: 'text' }],
    }).expect(200);
    let d = await doc();
    expect(Object.keys(d.paths['/blog'])).toEqual(['get']);
    expect(d.components.schemas.BlogData.properties.subtitle).toBeDefined();
    expect(d.components.schemas.BlogInput).toBeUndefined();

    const author = (await request(server).get('/api/content-types').expect(200)).body.find((c: any) => c.name === 'author');
    await request(server).delete(`/api/content-types/${author.id}`).set(auth).expect(200);
    d = await doc();
    expect(d.paths['/author']).toBeUndefined();
    expect(lintOpenApi(d)).toEqual([]);
  });

  it('serves a Swagger UI for the document at /api/docs/content', async () => {
    const server = app.getHttpServer();
    const html = await request(server).get('/api/docs/content').expect(200);
    expect(html.text).toContain('swagger-ui');
    const init = await request(server).get('/api/docs/content/swagger-ui-init.js').expect(200);
    expect(init.text).toContain('NodePress Content API');
    expect(init.text).toContain('/blog/{slug}');
    // The core docs are untouched and document the JSON route.
    const core = await request(server).get('/api/docs/swagger-ui-init.js').expect(200);
    expect(core.text).toContain('/api/openapi.json');
    expect(core.text).not.toContain('NodePress Content API');
  });
});
