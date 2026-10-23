/**
 * Starter templates: content types plus a little sample content, applied from
 * the admin (Content Types → Start from a template) or POST /api/templates/:id/apply.
 *
 * Relation values in `entries` are written as `@<type>/<slug>` and resolved to
 * publicIds when the template is applied. Reverse fields (mappedBy) are listed
 * in `reverseFields` because they can only be added once the forward side exists.
 */

export interface TemplateContentType {
  name: string;
  displayName: string;
  schema: any[];
}

export interface TemplateEntry {
  type: string;
  slug: string;
  data: Record<string, any>;
}

export interface StarterTemplate {
  id: string;
  name: string;
  description: string;
  contentTypes: TemplateContentType[];
  reverseFields?: Array<{ type: string; field: any }>;
  entries: TemplateEntry[];
}

const text = (name: string, label: string, extra: Record<string, any> = {}) => ({ name, label, type: 'text', ...extra });
const one = (name: string, label: string, to: string) => ({
  name, label, type: 'relation', options: { relatedContentType: to, cardinality: 'one' },
});
const many = (name: string, label: string, to: string) => ({
  name, label, type: 'relation', options: { relatedContentType: to, cardinality: 'many' },
});
const reverse = (name: string, label: string, from: string, mappedBy: string) => ({
  name, label, type: 'relation', options: { relatedContentType: from, cardinality: 'many', mappedBy },
});

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: 'blog',
    name: 'Blog',
    description: 'Posts with authors and categories, cover images and a featured flag.',
    contentTypes: [
      {
        name: 'author',
        displayName: 'Author',
        schema: [
          text('name', 'Name', { required: true }),
          { name: 'bio', label: 'Bio', type: 'textarea' },
          { name: 'avatar', label: 'Avatar', type: 'image' },
        ],
      },
      {
        name: 'category',
        displayName: 'Category',
        schema: [text('name', 'Name', { required: true }), { name: 'description', label: 'Description', type: 'textarea' }],
      },
      {
        name: 'post',
        displayName: 'Post',
        schema: [
          text('title', 'Title', { required: true }),
          { name: 'excerpt', label: 'Excerpt', type: 'textarea' },
          { name: 'body', label: 'Body', type: 'richtext' },
          { name: 'cover', label: 'Cover image', type: 'image' },
          one('author', 'Author', 'author'),
          many('categories', 'Categories', 'category'),
          { name: 'published_on', label: 'Published on', type: 'date' },
          { name: 'featured', label: 'Featured', type: 'boolean', indexed: true },
        ],
      },
    ],
    reverseFields: [
      { type: 'author', field: reverse('posts', 'Posts', 'post', 'author') },
      { type: 'category', field: reverse('posts', 'Posts', 'post', 'categories') },
    ],
    entries: [
      { type: 'author', slug: 'alex-morgan', data: { name: 'Alex Morgan', bio: 'Writes about building for the web.' } },
      { type: 'category', slug: 'news', data: { name: 'News' } },
      { type: 'category', slug: 'guides', data: { name: 'Guides', description: 'How-tos and walkthroughs.' } },
      {
        type: 'post',
        slug: 'hello-world',
        data: {
          title: 'Hello, world',
          excerpt: 'The first post on the new site.',
          body: '<p>Welcome! Edit or delete this post in the admin under <strong>Entries → Post</strong>.</p>',
          author: '@author/alex-morgan',
          categories: ['@category/news'],
          published_on: '2026-01-01',
          featured: true,
        },
      },
      {
        type: 'post',
        slug: 'fetching-posts',
        data: {
          title: 'Fetching posts from your site',
          excerpt: 'Two lines with @nodepress-cms/client.',
          body: '<p><code>cms.collection(\'post\').list({ populate: [\'author\'] })</code> returns published posts with their author.</p>',
          author: '@author/alex-morgan',
          categories: ['@category/guides'],
          published_on: '2026-01-02',
          featured: false,
        },
      },
    ],
  },
  {
    id: 'agency',
    name: 'Agency',
    description: 'Services, case studies, team, testimonials and flexible landing pages.',
    contentTypes: [
      {
        name: 'service',
        displayName: 'Service',
        schema: [
          text('title', 'Title', { required: true }),
          { name: 'summary', label: 'Summary', type: 'textarea' },
          { name: 'body', label: 'Body', type: 'richtext' },
        ],
      },
      {
        name: 'team_member',
        displayName: 'Team member',
        schema: [
          text('name', 'Name', { required: true }),
          text('role', 'Role'),
          { name: 'photo', label: 'Photo', type: 'image' },
          { name: 'bio', label: 'Bio', type: 'textarea' },
        ],
      },
      {
        name: 'project',
        displayName: 'Case study',
        schema: [
          text('title', 'Title', { required: true }),
          text('client', 'Client'),
          { name: 'summary', label: 'Summary', type: 'textarea' },
          { name: 'body', label: 'Body', type: 'richtext' },
          { name: 'cover', label: 'Cover image', type: 'image' },
          many('services', 'Services', 'service'),
        ],
      },
      {
        name: 'testimonial',
        displayName: 'Testimonial',
        schema: [
          { name: 'quote', label: 'Quote', type: 'textarea', required: true },
          text('person', 'Person'),
          text('company', 'Company'),
        ],
      },
      {
        name: 'page',
        displayName: 'Page',
        schema: [
          text('title', 'Title', { required: true }),
          {
            name: 'sections',
            label: 'Sections',
            type: 'flexible',
            options: {
              layouts: [
                { name: 'hero', label: 'Hero', fields: [text('heading', 'Heading'), { name: 'subheading', label: 'Subheading', type: 'textarea' }, { name: 'image', label: 'Image', type: 'image' }] },
                { name: 'text', label: 'Text', fields: [{ name: 'body', label: 'Body', type: 'richtext' }] },
                { name: 'cta', label: 'Call to action', fields: [text('heading', 'Heading'), text('button_label', 'Button label'), text('button_url', 'Button URL')] },
              ],
            },
          },
        ],
      },
    ],
    reverseFields: [{ type: 'service', field: reverse('projects', 'Case studies', 'project', 'services') }],
    entries: [
      { type: 'service', slug: 'web-design', data: { title: 'Web design', summary: 'Sites people enjoy using.' } },
      { type: 'service', slug: 'development', data: { title: 'Development', summary: 'Fast, accessible, maintainable builds.' } },
      { type: 'team_member', slug: 'sam-lee', data: { name: 'Sam Lee', role: 'Founder', bio: 'Leads design and strategy.' } },
      {
        type: 'project',
        slug: 'acme-relaunch',
        data: { title: 'Acme relaunch', client: 'Acme Co.', summary: 'A new site in six weeks.', services: ['@service/web-design', '@service/development'] },
      },
      { type: 'testimonial', slug: 'acme', data: { quote: 'They shipped on time and it shows.', person: 'Jordan Patel', company: 'Acme Co.' } },
      {
        type: 'page',
        slug: 'home',
        data: {
          title: 'Home',
          sections: [
            { _layout: 'hero', heading: 'We build websites that work', subheading: 'Design and development for growing teams.' },
            { _layout: 'cta', heading: 'Have a project in mind?', button_label: 'Get in touch', button_url: '/contact' },
          ],
        },
      },
    ],
  },
  {
    id: 'docs',
    name: 'Documentation',
    description: 'Docs pages grouped into ordered sections.',
    contentTypes: [
      {
        name: 'doc_section',
        displayName: 'Docs section',
        schema: [text('title', 'Title', { required: true }), { name: 'order', label: 'Order', type: 'number', indexed: true }],
      },
      {
        name: 'doc_page',
        displayName: 'Docs page',
        schema: [
          text('title', 'Title', { required: true }),
          { name: 'body', label: 'Body', type: 'richtext' },
          one('section', 'Section', 'doc_section'),
          { name: 'order', label: 'Order', type: 'number', indexed: true },
        ],
      },
    ],
    reverseFields: [{ type: 'doc_section', field: reverse('pages', 'Pages', 'doc_page', 'section') }],
    entries: [
      { type: 'doc_section', slug: 'getting-started', data: { title: 'Getting started', order: 1 } },
      { type: 'doc_page', slug: 'introduction', data: { title: 'Introduction', body: '<p>What this product does and who it is for.</p>', section: '@doc_section/getting-started', order: 1 } },
      { type: 'doc_page', slug: 'installation', data: { title: 'Installation', body: '<p>Install it in a minute.</p>', section: '@doc_section/getting-started', order: 2 } },
    ],
  },
];
