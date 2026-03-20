import Link from 'next/link';

export const metadata = {
  title: 'Documentation — NodePress CMS',
  description: 'NodePress headless CMS documentation',
};

const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
  <section id={id} className="mb-12 scroll-mt-24">
    <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b border-gray-200">{title}</h2>
    {children}
  </section>
);

const SubSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-6">
    <h3 className="text-lg font-semibold text-gray-800 mb-2">{title}</h3>
    {children}
  </div>
);

const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="bg-gray-100 text-pink-600 px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>
);

const CodeBlock = ({ children, lang = '' }: { children: string; lang?: string }) => (
  <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-sm overflow-x-auto mb-4 font-mono leading-relaxed">
    <code>{children.trim()}</code>
  </pre>
);

const Badge = ({ children, color = 'blue' }: { children: React.ReactNode; color?: string }) => {
  const colors: Record<string, string> = {
    blue:   'bg-blue-100 text-blue-700',
    green:  'bg-green-100 text-green-700',
    orange: 'bg-orange-100 text-orange-700',
    purple: 'bg-purple-100 text-purple-700',
    gray:   'bg-gray-100 text-gray-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[color] ?? colors.blue}`}>
      {children}
    </span>
  );
};

const toc = [
  { id: 'overview',       label: 'Overview' },
  { id: 'getting-started', label: 'Getting Started' },
  { id: 'content-types',  label: 'Content Types' },
  { id: 'field-types',    label: 'Field Types' },
  { id: 'entries',        label: 'Entries' },
  { id: 'media',          label: 'Media' },
  { id: 'api-keys',       label: 'API Keys' },
  { id: 'public-api',     label: 'Public API' },
  { id: 'auth',           label: 'Authentication' },
  { id: 'tech-stack',     label: 'Tech Stack' },
];

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center">
              <span className="text-white text-xs font-extrabold">N</span>
            </div>
            <span className="font-semibold text-gray-900">NodePress</span>
            <span className="text-gray-400">/</span>
            <span className="text-gray-500 text-sm">Documentation</span>
          </div>
          <Link href="/" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            Admin Panel →
          </Link>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-10 flex gap-10">
        {/* Sidebar TOC */}
        <aside className="hidden lg:block w-56 shrink-0">
          <div className="sticky top-24">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">On this page</p>
            <ul className="space-y-1">
              {toc.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className="block text-sm text-gray-600 hover:text-blue-600 py-0.5 transition-colors"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          {/* Hero */}
          <div className="mb-12">
            <div className="flex items-center gap-2 mb-4">
              <Badge color="blue">v1.0</Badge>
              <Badge color="green">Open Source</Badge>
              <Badge color="gray">Self-hosted</Badge>
            </div>
            <h1 className="text-4xl font-extrabold text-gray-900 mb-3">NodePress CMS</h1>
            <p className="text-xl text-gray-500 leading-relaxed max-w-2xl">
              A self-hosted headless CMS with a flexible content type builder, rich field system,
              and a clean REST API — inspired by WordPress ACF and Strapi.
            </p>
          </div>

          {/* Overview */}
          <Section id="overview" title="Overview">
            <p className="text-gray-600 leading-relaxed mb-4">
              NodePress lets you define your own content structures (called <strong>Content Types</strong>) with
              fully custom fields, then create and manage <strong>Entries</strong> for those types. All content
              is exposed through a public REST API that any frontend — a website, mobile app, or static site
              generator — can consume.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { title: 'Content Type Builder', desc: 'Design custom schemas with 9 field types including repeaters and flexible layouts.' },
                { title: 'Public REST API', desc: 'Read any content type via clean URLs. No auth required for GET requests.' },
                { title: 'Media Library', desc: 'Upload and manage images and files. Served directly by the backend.' },
                { title: 'API Key System', desc: 'Generate scoped keys for external apps with per-content-type permissions.' },
              ].map((card) => (
                <div key={card.title} className="border border-gray-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-1">{card.title}</h4>
                  <p className="text-sm text-gray-500">{card.desc}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* Getting Started */}
          <Section id="getting-started" title="Getting Started">
            <SubSection title="Requirements">
              <ul className="list-disc pl-5 text-gray-600 space-y-1 text-sm">
                <li>Node.js 18+</li>
                <li>PostgreSQL 14+</li>
                <li>npm 9+</li>
              </ul>
            </SubSection>

            <SubSection title="1. Backend setup">
              <CodeBlock>{`cd backend
npm install
cp .env.example .env         # fill in DATABASE_URL, JWT_SECRET
npx prisma migrate dev --name init
npm run start:dev             # runs on port 3000`}</CodeBlock>
            </SubSection>

            <SubSection title="2. Frontend setup">
              <CodeBlock>{`cd frontend
npm install
# create frontend/.env.local
echo "BACKEND_URL=http://localhost:3000" > .env.local
npm run dev                   # runs on port 5173`}</CodeBlock>
            </SubSection>

            <SubSection title="3. First-time setup">
              <p className="text-gray-600 text-sm mb-2">
                Open <Code>http://localhost:5173</Code>. You will be redirected to <Code>/setup</Code> to
                create your admin account and name your site. After setup, this page is locked — only one
                admin can be registered this way.
              </p>
            </SubSection>

            <SubSection title="Environment variables">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-gray-700 border-b border-gray-200">Variable</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-700 border-b border-gray-200">File</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-700 border-b border-gray-200">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {[
                      ['DATABASE_URL', 'backend/.env', 'PostgreSQL connection string'],
                      ['JWT_SECRET', 'backend/.env', 'Secret key for signing JWT tokens'],
                      ['JWT_EXPIRES_IN', 'backend/.env', 'Token lifetime e.g. 7d'],
                      ['PORT', 'backend/.env', 'Backend port (default 3000)'],
                      ['CORS_ORIGIN', 'backend/.env', 'Allowed frontend origin'],
                      ['APP_URL', 'backend/.env', 'Public URL of the backend'],
                      ['BACKEND_URL', 'frontend/.env.local', 'Used by server components to call the API directly'],
                    ].map(([v, f, d]) => (
                      <tr key={v}>
                        <td className="px-4 py-2 font-mono text-pink-600">{v}</td>
                        <td className="px-4 py-2 text-gray-500">{f}</td>
                        <td className="px-4 py-2 text-gray-600">{d}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SubSection>
          </Section>

          {/* Content Types */}
          <Section id="content-types" title="Content Types">
            <p className="text-gray-600 leading-relaxed mb-4">
              A Content Type defines the structure of a group of content — like a <em>Blog Post</em>, <em>Product</em>,
              or <em>Team Member</em>. Each type has a name (stored as <Code>snake_case</Code>) and a schema array of
              field definitions.
            </p>
            <SubSection title="API endpoints">
              <CodeBlock>{`GET    /api/content-types          List all content types
POST   /api/content-types          Create a content type
GET    /api/content-types/:id      Get a single content type
PATCH  /api/content-types/:id      Update a content type
DELETE /api/content-types/:id      Delete a content type
GET    /api/content-types/:id/form Get form structure for frontend`}</CodeBlock>
            </SubSection>
            <SubSection title="Reserved names">
              <p className="text-sm text-gray-600 mb-2">These names cannot be used as content type names:</p>
              <div className="flex flex-wrap gap-2">
                {['auth', 'media', 'entries', 'content-types', 'uploads'].map((n) => (
                  <Code key={n}>{n}</Code>
                ))}
              </div>
            </SubSection>
          </Section>

          {/* Field Types */}
          <Section id="field-types" title="Field Types">
            <p className="text-gray-600 mb-4">NodePress supports 9 field types across two categories:</p>

            <SubSection title="Simple fields">
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-gray-700 border-b border-gray-200">Type</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-700 border-b border-gray-200">Widget</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-700 border-b border-gray-200">Constraints</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {[
                      ['text',     'Text Input',      'minLength, maxLength, pattern'],
                      ['textarea', 'Textarea',        'minLength, maxLength'],
                      ['richtext', 'TipTap Editor',   '—'],
                      ['number',   'Number Input',    'min, max, integer'],
                      ['boolean',  'Toggle Switch',   '—'],
                      ['select',   'Dropdown',        'choices (required, non-empty array)'],
                      ['image',    'URL Input',       '—'],
                    ].map(([t, w, c]) => (
                      <tr key={t}>
                        <td className="px-4 py-2"><Code>{t}</Code></td>
                        <td className="px-4 py-2 text-gray-600">{w}</td>
                        <td className="px-4 py-2 text-gray-500 text-xs">{c}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SubSection>

            <SubSection title="Complex fields">
              <div className="space-y-4">
                <div className="border border-orange-200 bg-orange-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Code>repeater</Code>
                    <Badge color="orange">Complex</Badge>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">
                    A list of items, each with the same set of sub-fields. Great for galleries, team members,
                    FAQ lists, etc.
                  </p>
                  <CodeBlock>{`{
  "name": "gallery",
  "type": "repeater",
  "subFields": [
    { "name": "image", "type": "image", "required": true },
    { "name": "caption", "type": "text" }
  ]
}`}</CodeBlock>
                </div>
                <div className="border border-pink-200 bg-pink-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Code>flexible</Code>
                    <Badge color="purple">Complex</Badge>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">
                    A list of blocks where each block can be a different layout. Ideal for page builders,
                    landing pages, and mixed content sections.
                  </p>
                  <CodeBlock>{`{
  "name": "sections",
  "type": "flexible",
  "layouts": [
    {
      "name": "hero",
      "label": "Hero Banner",
      "fields": [
        { "name": "heading", "type": "text", "required": true },
        { "name": "subtext", "type": "textarea" }
      ]
    },
    {
      "name": "cta",
      "label": "Call to Action",
      "fields": [
        { "name": "button_label", "type": "text" },
        { "name": "button_url", "type": "text" }
      ]
    }
  ]
}`}</CodeBlock>
                </div>
              </div>
            </SubSection>
          </Section>

          {/* Entries */}
          <Section id="entries" title="Entries">
            <p className="text-gray-600 leading-relaxed mb-4">
              An Entry is a single record that belongs to a Content Type. Each entry has a <Code>slug</Code>
              (auto-generated from the first text field, unique per content type) and a <Code>data</Code> object
              whose shape is validated against the content type's schema.
            </p>
            <SubSection title="API endpoints">
              <CodeBlock>{`GET    /api/entries?contentTypeId=:id   List entries
POST   /api/entries                    Create an entry
GET    /api/entries/:id                Get a single entry
PATCH  /api/entries/:id                Update an entry (partial)
DELETE /api/entries/:id                Delete an entry`}</CodeBlock>
            </SubSection>
            <SubSection title="Example payload">
              <CodeBlock>{`POST /api/entries
{
  "contentTypeId": 1,
  "slug": "my-first-post",
  "data": {
    "title": "My First Post",
    "body": "<p>Hello world</p>",
    "published": true
  }
}`}</CodeBlock>
            </SubSection>
          </Section>

          {/* Media */}
          <Section id="media" title="Media">
            <p className="text-gray-600 leading-relaxed mb-4">
              Files are uploaded to <Code>backend/uploads/</Code> and served at <Code>/uploads/:filename</Code>.
            </p>
            <SubSection title="Allowed file types">
              <div className="flex flex-wrap gap-2 mb-3">
                {['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'video/mp4'].map((t) => (
                  <Code key={t}>{t}</Code>
                ))}
              </div>
              <p className="text-sm text-gray-500">Max file size: <strong>10 MB</strong></p>
            </SubSection>
            <SubSection title="API endpoints">
              <CodeBlock>{`POST   /api/media           Upload a file (multipart/form-data, field: "file")
GET    /api/media           List all uploaded files
DELETE /api/media/:filename Delete a file`}</CodeBlock>
            </SubSection>
          </Section>

          {/* API Keys */}
          <Section id="api-keys" title="API Keys">
            <p className="text-gray-600 leading-relaxed mb-4">
              API keys allow external applications to read or write content without a JWT token.
              Keys are prefixed with <Code>np_</Code> followed by 48 random hex characters.
            </p>
            <SubSection title="Permissions shape">
              <CodeBlock>{`{
  "access": "read" | "write" | "all",
  "contentTypes": ["blog", "products"]   // or ["*"] for all types
}`}</CodeBlock>
            </SubSection>
            <SubSection title="Usage">
              <CodeBlock>{`# Pass the key in the X-API-Key header
curl https://your-site.com/api/blog \\
  -H "X-API-Key: np_abc123..."`}</CodeBlock>
            </SubSection>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
              <strong>Note:</strong> The full key is only shown once at creation time. Store it securely — it
              cannot be retrieved again.
            </div>
          </Section>

          {/* Public API */}
          <Section id="public-api" title="Public API">
            <p className="text-gray-600 leading-relaxed mb-4">
              GET requests to content types are public — no auth required. Write operations require
              either a JWT token or an API key with <Code>write</Code>/<Code>all</Code> access.
            </p>
            <SubSection title="Endpoints">
              <CodeBlock>{`GET  /api/:type           List all entries for a content type
GET  /api/:type/:slug    Get a single entry by slug
POST /api/:type          Create an entry  (auth required)
PUT  /api/:type/:slug    Update an entry  (auth required)
DELETE /api/:type/:slug  Delete an entry  (auth required)`}</CodeBlock>
            </SubSection>
            <SubSection title="Examples">
              <CodeBlock>{`# List all blog posts
GET /api/blog

# Get a specific post
GET /api/blog/my-first-post

# Content type names are case-insensitive
GET /api/Blog   →  resolves to content type "blog"`}</CodeBlock>
            </SubSection>
          </Section>

          {/* Auth */}
          <Section id="auth" title="Authentication">
            <SubSection title="JWT (Admin)">
              <CodeBlock>{`# Login
POST /api/auth/login
{ "email": "admin@example.com", "password": "secret" }

# Response
{ "access_token": "eyJ..." }

# Use in subsequent requests
Authorization: Bearer eyJ...`}</CodeBlock>
            </SubSection>
            <SubSection title="Setup status">
              <CodeBlock>{`GET /api/auth/setup-status
# Returns { "required": true }  → redirect to /setup
# Returns { "required": false } → login normally`}</CodeBlock>
            </SubSection>
          </Section>

          {/* Tech Stack */}
          <Section id="tech-stack" title="Tech Stack">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { layer: 'Backend Framework', tech: 'NestJS', desc: 'Modular Node.js framework' },
                { layer: 'Database', tech: 'PostgreSQL', desc: 'Relational DB with JSONB support' },
                { layer: 'ORM', tech: 'Prisma v5', desc: 'Type-safe DB client + migrations' },
                { layer: 'Auth', tech: 'Passport JWT', desc: 'Stateless token auth' },
                { layer: 'Frontend', tech: 'Next.js 14', desc: 'App Router + server components' },
                { layer: 'UI', tech: 'Tailwind + shadcn', desc: 'Radix UI primitives + CSS tokens' },
                { layer: 'Forms', tech: 'react-hook-form', desc: 'Performant form management' },
                { layer: 'Rich Text', tech: 'TipTap', desc: 'ProseMirror-based editor' },
              ].map((row) => (
                <div key={row.layer} className="flex items-start gap-3 border border-gray-200 rounded-lg p-3">
                  <div className="flex-1">
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{row.layer}</p>
                    <p className="font-semibold text-gray-900">{row.tech}</p>
                    <p className="text-sm text-gray-500">{row.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-6 text-center text-sm text-gray-400">
        NodePress CMS — self-hosted headless CMS
      </footer>
    </div>
  );
}
