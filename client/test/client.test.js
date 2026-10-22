const { test } = require('node:test');
const assert = require('node:assert');
const { createClient, toQueryString, NodePressError } = require('../dist/cjs/index.js');

function fakeFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const r = responses.shift() ?? { status: 200, body: {} };
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } });
  };
  fn.calls = calls;
  return fn;
}

test('serializes where, populate and arrays the way the API parses them', () => {
  const qs = toQueryString({
    where: { price: { gte: 10 }, author: { slug: { eq: 'jane doe' } }, tag: { in: ['a', 'b'] }, OR: [{ a: 1 }, { b: { null: true } }] },
    populate: ['author', 'author.company'],
    limit: 5,
    locale: undefined,
  });
  assert.strictEqual(
    decodeURIComponent(qs),
    '?where[price][gte]=10&where[author][slug][eq]=jane doe&where[tag][in]=a,b&where[OR][0][a]=1&where[OR][1][b][null]=true&populate=author,author.company&limit=5',
  );
  assert.strictEqual(toQueryString({}), '');
});

test('reads send defaults and credentials; 404 is null', async () => {
  const fetch = fakeFetch([{ body: { data: [], meta: { limit: 20 } } }, { status: 404, body: { message: 'nope' } }]);
  const cms = createClient({ url: 'https://cms.test/api/', apiKey: 'np_key', locale: 'fr', fallback: true, fetch });
  await cms.collection('blog_post').list({ sort: 'slug:asc' });
  assert.strictEqual(fetch.calls[0].url, 'https://cms.test/api/blog_post?sort=slug%3Aasc&locale=fr&fallback=true');
  assert.strictEqual(fetch.calls[0].init.headers['X-API-Key'], 'np_key');
  assert.strictEqual(await cms.collection('blog_post').get('missing'), null);
});

test('errors carry status and body', async () => {
  const cms = createClient({ url: 'https://cms.test', fetch: fakeFetch([{ status: 403, body: { message: ['no', 'way'] } }]) });
  await assert.rejects(cms.collection('x').create({ slug: 'a', data: {} }), (err) => {
    assert.ok(err instanceof NodePressError);
    assert.strictEqual(err.status, 403);
    assert.strictEqual(err.message, 'no, way');
    return true;
  });
});

test('all() follows cursors', async () => {
  const fetch = fakeFetch([
    { body: { data: [{ slug: 'a' }, { slug: 'b' }], meta: { limit: 2, nextCursor: 'c1' } } },
    { body: { data: [{ slug: 'c' }], meta: { limit: 2, nextCursor: null } } },
  ]);
  const cms = createClient({ url: 'https://cms.test', fetch });
  const slugs = [];
  for await (const e of cms.collection('post').all({ limit: 2 })) slugs.push(e.slug);
  assert.deepStrictEqual(slugs, ['a', 'b', 'c']);
  assert.match(fetch.calls[1].url, /cursor=c1/);
});

test('graphql throws on errors; imageUrl only rewrites local uploads', async () => {
  const cms = createClient({ url: 'https://cms.test', fetch: fakeFetch([{ body: { data: { ok: 1 } } }, { body: { errors: [{ message: 'bad' }] } }]) });
  assert.deepStrictEqual(await cms.graphql('{ ok }'), { ok: 1 });
  await assert.rejects(cms.graphql('{ nope }'), /bad/);
  assert.strictEqual(cms.imageUrl('https://cms.test/uploads/a.png', { w: 300, format: 'auto' }), 'https://cms.test/api/media/a.png/transform?w=300&format=auto');
  assert.strictEqual(cms.imageUrl({ url: 'https://cdn.example.com/x.png' }), 'https://cdn.example.com/x.png');
});

test('esm build loads', async () => {
  const mod = await import('../dist/esm/index.js');
  assert.strictEqual(typeof mod.createClient, 'function');
});
