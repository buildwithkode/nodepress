import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AddressInfo } from 'net';
import { createTestApp, cleanDatabase, registerAdmin } from './helpers';
import { createClient, NodePressClient } from '../../client/src/index';

/** @nodepress-cms/client against the real API — catches query-string drift between the two. */
describe('@nodepress-cms/client (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let cms: NodePressClient;

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    token = await registerAdmin(app);
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;

    const auth = { Authorization: `Bearer ${token}` };
    const http = () => request(app.getHttpServer());
    await http().post('/api/content-types').set(auth).send({ name: 'writer', schema: [{ name: 'name', type: 'text' }] }).expect(201);
    const ct = await http().post('/api/content-types').set(auth).send({
      name: 'story',
      schema: [
        { name: 'title', type: 'text' },
        { name: 'score', type: 'number' },
        { name: 'writer', type: 'relation', options: { relatedContentType: 'writer', cardinality: 'one' } },
      ],
    }).expect(201);
    const writers = (await http().get('/api/content-types').set(auth)).body;
    const w = await http().post('/api/entries').set(auth)
      .send({ contentTypeId: writers.find((c: any) => c.name === 'writer').id, slug: 'ann', status: 'published', data: { name: 'Ann' } });
    for (let i = 1; i <= 5; i++) {
      await http().post('/api/entries').set(auth).send({
        contentTypeId: ct.body.id, slug: `s${i}`, status: 'published',
        data: { title: `Story ${i}`, score: i * 10, ...(i % 2 ? { writer: w.body.publicId } : {}) },
      }).expect(201);
    }
    cms = createClient({ url: `http://127.0.0.1:${port}`, token });
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  it('list, filters, populate and get', async () => {
    const stories = cms.collection('story');
    const res = await stories.list({ where: { score: { gte: 30 } }, sort: 'slug:asc', populate: ['writer'] });
    expect(res.data.map((e) => e.slug)).toEqual(['s3', 's4', 's5']);
    expect(res.data[0].data.writer.slug).toBe('ann');

    const byWriter = await stories.list({ where: { writer: { slug: { eq: 'ann' } }, OR: [{ score: 10 }, { score: { in: [50] } }] }, sort: 'slug:asc' });
    expect(byWriter.data.map((e) => e.slug)).toEqual(['s1', 's5']);

    expect((await stories.get('s2'))?.data.title).toBe('Story 2');
    expect(await stories.get('nope')).toBeNull();
  });

  it('all() pages through everything; writes and GraphQL work', async () => {
    const slugs: string[] = [];
    for await (const e of cms.collection('story').all({ limit: 2, sort: 'slug:asc' })) slugs.push(e.slug);
    expect(slugs).toEqual(['s1', 's2', 's3', 's4', 's5']);

    await cms.collection('story').create({ slug: 'new-one', data: { title: 'New' } });
    await cms.collection('story').update('new-one', { title: 'Newer' });
    const gql = await cms.graphql<{ story: { data: { title: string } } | null }>('{ story(slug: "new-one") { data { title } } }');
    expect(gql.story).toEqual({ data: { title: 'Newer' } });
    await cms.collection('story').delete('new-one');
    expect(await cms.collection('story').get('new-one')).toBeNull();
    expect((await cms.locales()).defaultLocale).toBeTruthy();

    // Drafts stay private; data is validated against the schema.
    await cms.collection('story').create({ slug: 'draft-one', data: { title: 'Draft' }, status: 'draft' });
    expect(await cms.collection('story').get('draft-one')).toBeNull();
    await expect(cms.collection('story').create({ slug: 'bad', data: { score: 'lots' } })).rejects.toMatchObject({ status: 422 });
    await expect(cms.collection('story').update('s1', { score: 'lots' })).rejects.toMatchObject({ status: 422 });
  });
});
