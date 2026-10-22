import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin } from './helpers';

describe('Two-way relations and relation filters (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let personCt: number;
  let postCt: number;
  const ids: Record<string, { id: number; publicId: string }> = {};

  const http = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const entry = async (key: string, contentTypeId: number, slug: string, data: any, status = 'published') => {
    const res = await http().post('/api/entries').set(auth()).send({ contentTypeId, slug, status, data }).expect(201);
    ids[key] = { id: res.body.id, publicId: res.body.publicId };
  };
  const reverseField = { name: 'posts', type: 'relation', options: { relatedContentType: 'post', cardinality: 'many', mappedBy: 'author' } };

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    token = await registerAdmin(app);
    personCt = (await http().post('/api/content-types').set(auth())
      .send({ name: 'person', schema: [{ name: 'name', type: 'text' }] }).expect(201)).body.id;
    await http().post('/api/content-types').set(auth())
      .send({ name: 'tag', schema: [{ name: 'label', type: 'text' }] }).expect(201);
    // A reverse field needs the forward field to exist first.
    await http().put(`/api/content-types/${personCt}`).set(auth())
      .send({ schema: [{ name: 'name', type: 'text' }, reverseField] }).expect(400);
    postCt = (await http().post('/api/content-types').set(auth()).send({
      name: 'post',
      schema: [
        { name: 'title', type: 'text' },
        { name: 'author', type: 'relation', options: { relatedContentType: 'person', cardinality: 'one' } },
        { name: 'tags', type: 'relation', options: { relatedContentType: 'tag', cardinality: 'many' } },
      ],
    }).expect(201)).body.id;
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  it('validates reverse fields against the other side', async () => {
    const bad = await http().put(`/api/content-types/${personCt}`).set(auth())
      .send({ schema: [{ name: 'name', type: 'text' }, { ...reverseField, options: { ...reverseField.options, mappedBy: 'tags' } }] })
      .expect(400);
    expect(bad.body.errors[0]).toMatch(/links to "tag", not "person"/);
    await http().put(`/api/content-types/${personCt}`).set(auth())
      .send({ schema: [{ name: 'name', type: 'text' }, { ...reverseField, required: true }] }).expect(400);
    await http().put(`/api/content-types/${personCt}`).set(auth())
      .send({ schema: [{ name: 'name', type: 'text' }, reverseField] }).expect(200);
  });

  it('seeds people, tags and posts', async () => {
    await entry('jane', personCt, 'jane', { name: 'Jane' });
    await entry('joe', personCt, 'joe', { name: 'Joe' });
    const tagCt = (await http().get('/api/content-types').set(auth())).body.find((c: any) => c.name === 'tag').id;
    await entry('news', tagCt, 'news', { label: 'News' });
    await entry('hidden', tagCt, 'hidden', { label: 'Hidden' }, 'draft');
    await entry('p1', postCt, 'first', { title: 'First', author: ids.jane.publicId, tags: [ids.news.publicId, ids.hidden.publicId] });
    await entry('p2', postCt, 'second', { title: 'Second', author: ids.jane.publicId });
    await entry('p3', postCt, 'third', { title: 'Third', author: ids.joe.publicId, tags: [ids.news.publicId] });
    await entry('p4', postCt, 'draft-post', { title: 'Draft', author: ids.jane.publicId }, 'draft');
  });

  it('a reverse field lists the published entries that link here', async () => {
    const jane = await http().get('/api/person/jane?populate=posts').expect(200);
    expect(jane.body.data.posts.map((p: any) => p.slug).sort()).toEqual(['first', 'second']);
    // Not populated → not present (nothing is stored on this side).
    expect((await http().get('/api/person/jane').expect(200)).body.data.posts).toBeUndefined();

    const list = await http().get('/api/person?populate=posts&sort=slug:asc').expect(200);
    expect(list.body.data.map((p: any) => [p.slug, p.data.posts.length])).toEqual([['jane', 2], ['joe', 1]]);

    // Nested: the posts' tags, through the reverse field.
    const nested = await http().get('/api/person/joe?populate=posts,posts.tags').expect(200);
    expect(nested.body.data.posts[0].data.tags.map((t: any) => t.slug)).toEqual(['news']);
  });

  it('the admin view includes drafts', async () => {
    const res = await http().get(`/api/entries/${ids.jane.id}?populate=posts`).set(auth()).expect(200);
    expect(res.body.data.posts.map((p: any) => p.slug).sort()).toEqual(['draft-post', 'first', 'second']);
  });

  it('public populate no longer leaks draft entries', async () => {
    const res = await http().get('/api/post/first?populate=tags').expect(200);
    expect(res.body.data.tags.map((t: any) => t.slug)).toEqual(['news']);
  });

  it('a reverse field is read-only', async () => {
    const res = await http().put(`/api/entries/${ids.joe.id}`).set(auth())
      .send({ data: { name: 'Joe', posts: [ids.p1.publicId] } }).expect(422);
    expect(JSON.stringify(res.body)).toMatch(/read-only/);
  });

  it('lists filter on a related entry\'s fields', async () => {
    const slugs = async (q: string) => (await http().get(`/api/post?${q}&sort=slug:asc`).expect(200)).body.data.map((e: any) => e.slug);
    expect(await slugs('where[author][slug][eq]=jane')).toEqual(['first', 'second']);
    expect(await slugs('where[author.name][eq]=Joe')).toEqual(['third']);
    expect(await slugs('where[tags][label][eq]=News')).toEqual(['first', 'third']);
    expect(await slugs('where[author][slug][eq]=nobody')).toEqual([]);
    // Draft related entries don't match public filters.
    expect(await slugs('where[tags][slug][eq]=hidden')).toEqual([]);
    // Still works next to ordinary filters, and the plain UUID form is unchanged.
    expect(await slugs('where[author][slug][eq]=jane&where[title][eq]=Second')).toEqual(['second']);
    expect(await slugs(`where[author][eq]=${ids.joe.publicId}`)).toEqual(['third']);
  });

  it('applies the related type\'s read rules to populated entries and hides its schema', async () => {
    await http().put(`/api/content-types/${personCt}`).set(auth()).send({
      schema: [{ name: 'name', type: 'text' }, { name: 'email', type: 'text', readRoles: ['admin'] }, reverseField],
    }).expect(200);
    const list = (await http().get(`/api/entries?contentTypeId=${personCt}`).set(auth())).body.data;
    const jane = list.find((e: any) => e.slug === 'jane');
    await http().put(`/api/entries/${jane.id}`).set(auth()).send({ data: { name: 'Jane', email: 'jane@example.com' } }).expect(200);

    const res = await http().get('/api/post?populate=author').expect(200);
    const author = res.body.data.map((p: any) => p.data.author).find((a: any) => a?.slug === 'jane');
    expect(author.data.name).toBe('Jane');
    expect(author.data.email).toBeUndefined();
    expect(author.contentType).toEqual({ id: personCt, name: 'person', displayName: null });
  });
});
