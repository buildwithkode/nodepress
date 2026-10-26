import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin } from './helpers';

/**
 * Nested containers, like ACF flexible content: a flexible field whose layout
 * holds a repeater of groups — stored, validated, sanitized, migrated, typed
 * in GraphQL — plus components and choice lists inside them, and the depth limit.
 */
describe('Nested repeaters, groups and flexible fields (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let ctId: number;

  const http = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const gql = (query: string) =>
    http().post('/graphql').set('Content-Type', 'application/json; charset=utf-8').send(JSON.stringify({ query }));

  // blocks (flexible) → hero → buttons (repeater) → link (group) → url
  const schema = (buttonFields: any[]) => [
    { name: 'title', type: 'text', required: true },
    {
      name: 'blocks', type: 'flexible',
      options: {
        layouts: [
          {
            name: 'hero', label: 'Hero',
            fields: [
              { name: 'heading', type: 'text' },
              { name: 'buttons', type: 'repeater', options: { subFields: buttonFields } },
            ],
          },
          { name: 'text', label: 'Text', fields: [{ name: 'body', type: 'richtext' }, { name: 'meta', type: 'group', options: { subFields: [{ name: 'note', type: 'richtext' }] } }] },
        ],
      },
    },
  ];
  const buttons = [
    { name: 'label', type: 'text', required: true },
    { name: 'link', type: 'group', options: { subFields: [{ name: 'href', type: 'text' }, { name: 'new_tab', type: 'boolean' }] } },
  ];

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    token = await registerAdmin(app);
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  it('creates a content type with containers three levels deep', async () => {
    const res = await http().post('/api/content-types').set(auth())
      .send({ name: 'landing page', schema: schema([...buttons.slice(0, 1), { ...buttons[1], options: { subFields: [{ name: 'Href', type: 'text' }, { name: 'New Tab', type: 'boolean' }] } }]) })
      .expect(201);
    ctId = res.body.id;
    // Names are normalized at every depth.
    const link = res.body.schema[1].options.layouts[0].fields[1].options.subFields[1];
    expect(link.options.subFields.map((f: any) => f.name)).toEqual(['href', 'new_tab']);
  });

  it('refuses a fourth level and components below the top level', async () => {
    const deep = schema([{ name: 'link', type: 'group', options: { subFields: [{ name: 'extra', type: 'repeater', options: { subFields: [{ name: 'x', type: 'text' }] } }] } }]);
    const tooDeep = await http().post('/api/content-types').set(auth()).send({ name: 'too_deep', schema: deep }).expect(400);
    expect(tooDeep.body.errors.join(' ')).toMatch(/at most 3 levels/);

    const nestedRef = schema([{ name: 'seo', type: 'group', options: { component: 'seo', subFields: [{ name: 'a', type: 'text' }] } }]);
    const ref = await http().post('/api/content-types').set(auth()).send({ name: 'nested_ref', schema: nestedRef }).expect(400);
    expect(ref.body.errors.join(' ')).toMatch(/components can only be used by top-level fields/);
  });

  it('validates and stores entry data at every depth, sanitizing rich text in groups', async () => {
    const data = {
      title: 'Home',
      blocks: [
        { _layout: 'hero', heading: 'Welcome', buttons: [{ label: 'Docs', link: { href: '/docs', new_tab: true } }, { label: 'Blog', link: { href: '/blog' } }] },
        { _layout: 'text', body: '<p>Hi</p>', meta: { note: '<p>Note<script>alert(1)</script></p>' } },
      ],
    };
    const bad = await http().post('/api/entries').set(auth()).send({
      contentTypeId: ctId, slug: 'bad', data: { ...data, blocks: [{ _layout: 'hero', buttons: [{ link: { href: 5 } }] }] },
    }).expect(422);
    expect(bad.body.errors).toEqual(expect.arrayContaining([
      'blocks[0].buttons[0].label: required',
      expect.stringMatching(/^blocks\[0\]\.buttons\[0\]\.link\.href: /),
    ]));

    await http().post('/api/entries').set(auth()).send({ contentTypeId: ctId, slug: 'home', status: 'published', data }).expect(201);
    const pub = await http().get('/api/landing-page/home').expect(200);
    const [hero, text] = pub.body.data.blocks;
    expect(hero.buttons.map((b: any) => b.link.href)).toEqual(['/docs', '/blog']);
    expect(hero.buttons[0]._id).toEqual(expect.any(String)); // nested rows get ids too
    expect(text.meta.note).toBe('<p>Note</p>');
  });

  it('types nested containers in GraphQL', async () => {
    const res = await gql(`{
      landingPage(slug: "home") { data { blocks {
        __typename
        ... on LandingPageBlocksHero { heading buttons { label link { href new_tab } } }
      } } }
    }`).expect(200);
    expect(res.body.errors).toBeUndefined();
    expect(res.body.data.landingPage.data.blocks[0]).toEqual({
      __typename: 'LandingPageBlocksHero', heading: 'Welcome',
      buttons: [{ label: 'Docs', link: { href: '/docs', new_tab: true } }, { label: 'Blog', link: { href: '/blog', new_tab: null } }],
    });
  });

  it('migrates a rename three levels down, in every block and row', async () => {
    const next = schema([buttons[0], { ...buttons[1], options: { subFields: [{ name: 'url', type: 'text' }, { name: 'new_tab', type: 'boolean' }] } }]);
    const fieldMigrations = { renames: [{ from: 'blocks.hero.buttons.link.href', to: 'blocks.hero.buttons.link.url' }] };
    const impact = await http().post(`/api/content-types/${ctId}/schema-impact`).set(auth()).send({ schema: next, fieldMigrations }).expect(200);
    expect(impact.body.steps).toEqual([expect.objectContaining({ kind: 'rename', field: 'blocks.hero.buttons.link.url', entries: 1 })]);

    await http().put(`/api/content-types/${ctId}`).set(auth()).send({ schema: next, fieldMigrations }).expect(200);
    const pub = await http().get('/api/landing-page/home').expect(200);
    const links = pub.body.data.blocks[0].buttons.map((b: any) => b.link);
    expect(links).toEqual([{ url: '/docs', new_tab: true }, { url: '/blog' }]);
    expect(pub.body.data.blocks[1].meta.note).toBe('<p>Note</p>'); // other blocks untouched
  });

  it('lets a component hold a repeater and be used as a flexible layout', async () => {
    await http().post('/api/choice-lists').set(auth()).send({ name: 'tone', label: 'Tone', choices: ['primary', 'ghost'] }).expect(201);
    await http().post('/api/components').set(auth()).send({
      name: 'cta_row', displayName: 'CTA row',
      fields: [
        { name: 'Heading', type: 'text' },
        { name: 'items', type: 'repeater', options: { subFields: [{ name: 'Label', type: 'text' }, { name: 'tone', type: 'select', options: { choiceList: 'tone' } }] } },
      ],
    }).expect(201);
    const ct = await http().post('/api/content-types').set(auth()).send({
      name: 'promo',
      schema: [{ name: 'sections', type: 'flexible', options: { layouts: [{ component: 'cta_row' }] } }],
    }).expect(201);
    const layout = ct.body.schema[0].options.layouts[0];
    expect(layout).toMatchObject({ name: 'cta_row', component: 'cta_row' });
    const tone = layout.fields[1].options.subFields[1];
    expect(tone.options.choices).toEqual(['primary', 'ghost']); // the choice list reached the nested select

    await http().post('/api/entries').set(auth()).send({
      contentTypeId: ct.body.id, slug: 'spring', status: 'published',
      data: { sections: [{ _layout: 'cta_row', heading: 'Go', items: [{ label: 'Buy', tone: 'primary' }] }] },
    }).expect(201);
    await http().post('/api/entries').set(auth()).send({
      contentTypeId: ct.body.id, slug: 'bad-tone',
      data: { sections: [{ _layout: 'cta_row', items: [{ label: 'X', tone: 'loud' }] }] },
    }).expect(422);
  });
});
