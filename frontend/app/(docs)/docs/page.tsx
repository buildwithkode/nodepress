'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Copy, Check, BookOpen, Zap, Database, Key, Image as ImageIcon, Code2, ChevronRight, ExternalLink, Box, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Hooks ───────────────────────────────────────────────────────────────────
function useCopy(text: string) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return { copied, copy };
}

// ─── Code block ──────────────────────────────────────────────────────────────
function CodeBlock({ code, className }: { code: string; className?: string }) {
  const { copied, copy } = useCopy(code);
  return (
    <div className={cn('relative group my-3 rounded-xl overflow-hidden border border-zinc-800', className)}>
      <div className="flex items-center justify-between bg-zinc-900 px-4 py-2 border-b border-zinc-800">
        <span className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-zinc-700" />
          <span className="w-3 h-3 rounded-full bg-zinc-700" />
          <span className="w-3 h-3 rounded-full bg-zinc-700" />
        </span>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
        >
          {copied ? <><Check className="h-3.5 w-3.5 text-green-400" /> <span className="text-green-400">Copied!</span></> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
        </button>
      </div>
      <pre className="bg-zinc-950 text-zinc-200 p-4 text-xs font-mono overflow-x-auto leading-6">
        <code>{code.trim()}</code>
      </pre>
    </div>
  );
}

// ─── Inline code ─────────────────────────────────────────────────────────────
function IC({ children }: { children: React.ReactNode }) {
  return <code className="bg-muted text-pink-500 dark:text-pink-400 px-1.5 py-0.5 rounded text-[13px] font-mono">{children}</code>;
}

// ─── Method badge ─────────────────────────────────────────────────────────────
const METHOD: Record<string, string> = {
  GET:    'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  POST:   'bg-blue-500/10 text-blue-400 border-blue-500/30',
  PUT:    'bg-amber-500/10 text-amber-400 border-amber-500/30',
  DELETE: 'bg-red-500/10 text-red-400 border-red-500/30',
};
function MethodBadge({ m }: { m: string }) {
  return <span className={cn('inline-flex px-2 py-0.5 rounded text-xs font-bold border font-mono shrink-0', METHOD[m])}>{m}</span>;
}

// ─── Endpoint row ─────────────────────────────────────────────────────────────
function Endpoint({ method, path, desc, auth }: { method: string; path: string; desc: string; auth?: boolean }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-0">
      <MethodBadge m={method} />
      <div className="flex-1 min-w-0">
        <code className="text-sm font-mono text-foreground">{path}</code>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      </div>
      {auth && (
        <span className="text-[10px] border border-border rounded px-1.5 py-0.5 text-muted-foreground shrink-0">Auth</span>
      )}
    </div>
  );
}

// ─── Step card ────────────────────────────────────────────────────────────────
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">{n}</div>
        <div className="w-px flex-1 bg-border mt-2" />
      </div>
      <div className="flex-1 pb-8">
        <h3 className="font-semibold text-foreground mb-2">{title}</h3>
        <div className="text-sm text-muted-foreground leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

// ─── Section ─────────────────────────────────────────────────────────────────
function Section({ id, title, icon: Icon, children }: { id: string; title: string; icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-16 scroll-mt-24">
      <div className="flex items-center gap-2.5 mb-5">
        {Icon && <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Icon className="h-4 w-4 text-primary" /></div>}
        <h2 className="text-2xl font-bold text-foreground">{title}</h2>
      </div>
      {children}
    </section>
  );
}

// ─── Code tabs ────────────────────────────────────────────────────────────────
const CODE_TABS = ['cURL', 'JavaScript', 'React', 'Python', 'PHP'] as const;
type CodeTab = typeof CODE_TABS[number];

function CodeTabs({ codes }: { codes: Partial<Record<CodeTab, string>> }) {
  const [active, setActive] = useState<CodeTab>('cURL');
  const available = CODE_TABS.filter((t) => codes[t]);
  const current = codes[active] ?? codes[available[0]];
  return (
    <div className="my-3">
      <div className="flex gap-1 mb-0 border border-b-0 border-zinc-800 rounded-t-xl overflow-hidden bg-zinc-900 px-2 pt-2">
        {available.map((tab) => (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors',
              active === tab
                ? 'bg-zinc-950 text-white'
                : 'text-zinc-400 hover:text-white',
            )}
          >
            {tab}
          </button>
        ))}
      </div>
      {current && <CodeBlock code={current} className="rounded-tl-none mt-0 border-t-0" />}
    </div>
  );
}

// ─── Field type table data ────────────────────────────────────────────────────
const FIELD_TYPES = [
  { type: 'text',     label: 'Text',          color: 'bg-blue-500/10 text-blue-400',    desc: 'Short single-line text. Good for titles, names, labels.',          example: '"My Blog Post"' },
  { type: 'textarea', label: 'Textarea',       color: 'bg-cyan-500/10 text-cyan-400',    desc: 'Multi-line plain text. Good for short descriptions.',             example: '"A short summary..."' },
  { type: 'richtext', label: 'Rich Text',      color: 'bg-purple-500/10 text-purple-400',desc: 'HTML content from the WYSIWYG editor. Supports headings, images.', example: '"<p>Hello <strong>world</strong></p>"' },
  { type: 'number',   label: 'Number',         color: 'bg-orange-500/10 text-orange-400',desc: 'Integer or decimal number.',                                      example: '42' },
  { type: 'boolean',  label: 'Boolean',        color: 'bg-green-500/10 text-green-400',  desc: 'True/false toggle. Good for published, featured, active flags.',  example: 'true' },
  { type: 'select',   label: 'Select',         color: 'bg-yellow-500/10 text-yellow-400',desc: 'One value from a predefined list of choices.',                    example: '"tech"' },
  { type: 'image',    label: 'Image URL',      color: 'bg-pink-500/10 text-pink-400',    desc: 'A URL string pointing to an image (from Media Library or external).', example: '"/uploads/photo.jpg"' },
  { type: 'repeater', label: 'Repeater',       color: 'bg-red-500/10 text-red-400',      desc: 'A list of items, each sharing the same sub-fields.',              example: '[{"name":"Kartik","role":"Dev"}]' },
  { type: 'flexible', label: 'Flexible',       color: 'bg-indigo-500/10 text-indigo-400',desc: 'A list of blocks where each block can be a different layout.',    example: '[{"_layout":"hero","heading":"Welcome"}]' },
];

// ─── TOC ─────────────────────────────────────────────────────────────────────
const TOC_ITEMS = [
  { id: 'introduction',   label: 'Introduction' },
  { id: 'quick-start',    label: 'Quick Start' },
  { id: 'content-types',  label: 'Content Types' },
  { id: 'field-types',    label: 'Field Types' },
  { id: 'entries',        label: 'Entries & Slugs' },
  { id: 'media',          label: 'Media Library' },
  { id: 'api-keys',       label: 'API Keys' },
  { id: 'api-reference',  label: 'API Reference' },
  { id: 'code-examples',  label: 'Code Examples' },
];

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DocsPage() {
  const [activeId, setActiveId] = useState('introduction');
  const [baseUrl, setBaseUrl] = useState('https://your-domain.com');

  // Detect base URL client-side
  useEffect(() => {
    setBaseUrl(window.location.origin);
  }, []);

  // Active section tracking via IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => { if (e.isIntersecting) setActiveId(e.target.id); });
      },
      { rootMargin: '-20% 0px -70% 0px' },
    );
    TOC_ITEMS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/90 backdrop-blur border-b border-border">
        <div className="w-full px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground text-xs font-extrabold">N</span>
            </div>
            <span className="font-semibold text-sm">NodePress</span>
            <span className="text-muted-foreground/40">/</span>
            <span className="text-muted-foreground text-sm">Documentation</span>
          </div>
          <Link href="/" className="text-sm text-primary hover:underline flex items-center gap-1">
            Admin Panel <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      <div className="w-full px-6 py-10 flex gap-10">

        {/* ── TOC sidebar ───────────────────────────────────────────────────── */}
        <aside className="hidden lg:block w-52 shrink-0">
          <div className="sticky top-24">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">On this page</p>
            <ul className="space-y-0.5">
              {TOC_ITEMS.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className={cn(
                      'block text-sm py-1 px-2 rounded transition-colors',
                      activeId === item.id
                        ? 'text-primary bg-primary/5 font-medium'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* ── Main content ──────────────────────────────────────────────────── */}
        <main className="flex-1 min-w-0">

          {/* Hero */}
          <div className="mb-14">
            <div className="flex items-center gap-2 mb-4">
              {['v1.0', 'Self-hosted', 'REST API'].map((t) => (
                <span key={t} className="text-[11px] px-2 py-0.5 rounded-full border border-border text-muted-foreground">{t}</span>
              ))}
            </div>
            <h1 className="text-4xl font-extrabold mb-3">NodePress CMS</h1>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl">
              A self-hosted headless CMS. Define your content structure, fill it with data through the
              admin panel, then consume it via a clean REST API from any website, app, or platform.
            </p>
          </div>

          {/* ── Introduction ──────────────────────────────────────────────── */}
          <Section id="introduction" title="Introduction" icon={BookOpen}>
            <p className="text-muted-foreground leading-relaxed mb-6">
              NodePress works in three steps: you <strong className="text-foreground">define</strong> the shape
              of your content, you <strong className="text-foreground">fill it</strong> with data in the admin
              panel, and then your website or app <strong className="text-foreground">reads</strong> it through
              the API. No coding required for steps 1 and 2.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { icon: Layers, title: 'Content Types', desc: 'Define the structure — like a "Blog Post" with title, content, and thumbnail fields.' },
                { icon: Database, title: 'Entries', desc: 'Fill in the actual content. Each entry has a unique slug and validates against your schema.' },
                { icon: ImageIcon, title: 'Media', desc: 'Upload images, PDFs, and videos. Use their URLs inside your entries.' },
                { icon: Key, title: 'API Keys', desc: 'Generate read or write keys for external apps to access your content securely.' },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="rounded-xl border border-border p-4">
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center mb-3">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold text-sm mb-1">{title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* ── Quick Start ───────────────────────────────────────────────── */}
          <Section id="quick-start" title="Quick Start" icon={Zap}>
            <p className="text-muted-foreground mb-8">
              From zero to a live API in 5 steps. No code required.
            </p>
            <div>
              <Step n={1} title="Create a Content Type">
                Go to <strong>Content Types → New Content Type</strong>. Give it a name like{' '}
                <IC>blog</IC>. The API endpoint is shown in real-time: it will be{' '}
                <IC>GET /api/blog</IC>. Add fields — for example a <IC>title</IC> (text) and{' '}
                <IC>content</IC> (rich text).
              </Step>
              <Step n={2} title="Add Fields to Your Schema">
                For each field, choose a name and a type. The field name becomes the key in the API
                response. Names are automatically converted to <IC>snake_case</IC> — so "Blog Title"
                becomes <IC>blog_title</IC> in the API output.
              </Step>
              <Step n={3} title="Create an Entry">
                Go to <strong>Entries → select your content type → New Entry</strong>. Fill in the
                fields and save. The slug is auto-generated from the first text field — you can change
                it. Slugs must be unique per content type.
              </Step>
              <Step n={4} title="Upload Media (Optional)">
                Go to <strong>Media</strong> and upload images or files. Copy the URL from the media
                library and paste it into an <IC>image</IC> field in your entry.
              </Step>
              <Step n={5} title="Call Your API">
                Your content is now live. Fetch it from any device, app, or website — no auth required
                for reading:
                <CodeBlock code={`# List all blog entries\nGET ${baseUrl}/api/blog\n\n# Get one specific entry\nGET ${baseUrl}/api/blog/my-first-post`} />
              </Step>
            </div>
          </Section>

          {/* ── Content Types ─────────────────────────────────────────────── */}
          <Section id="content-types" title="Content Types" icon={Layers}>
            <p className="text-muted-foreground leading-relaxed mb-4">
              A Content Type is a template — like a database table — that defines the shape of your
              content. Examples: <IC>blog</IC>, <IC>product</IC>, <IC>team_member</IC>, <IC>faq</IC>.
            </p>

            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 mb-6 text-sm">
              <strong className="text-amber-400">Name normalization</strong>
              <p className="text-muted-foreground mt-1">
                Content type names are automatically converted to <IC>snake_case</IC>.
                "My Blog Posts" → <IC>my_blog_posts</IC>. This becomes part of the API URL:{' '}
                <IC>GET /api/my_blog_posts</IC>. The API endpoint is shown as you type on the Create page.
              </p>
            </div>

            <h3 className="font-semibold mb-3">Actions available</h3>
            <div className="space-y-2 mb-6">
              {[
                ['Edit', 'Change the name or add/remove/reorder fields at any time.'],
                ['Duplicate', 'Copy the schema to a new content type. Useful for similar structures.'],
                ['Export JSON', 'Download the schema as a JSON file to back it up or share it.'],
                ['Import JSON', 'Restore or import a schema from a previously exported file (on the New page).'],
                ['Delete', 'Permanently removes the content type AND all its entries.'],
              ].map(([action, desc]) => (
                <div key={action} className="flex gap-3 text-sm">
                  <span className="font-medium text-foreground w-24 shrink-0">{action}</span>
                  <span className="text-muted-foreground">{desc}</span>
                </div>
              ))}
            </div>

            <h3 className="font-semibold mb-3">Reserved names (cannot be used)</h3>
            <div className="flex flex-wrap gap-2">
              {['auth', 'media', 'entries', 'content-types', 'uploads'].map((n) => (
                <IC key={n}>{n}</IC>
              ))}
            </div>
          </Section>

          {/* ── Field Types ───────────────────────────────────────────────── */}
          <Section id="field-types" title="Field Types" icon={Box}>
            <p className="text-muted-foreground mb-6">
              NodePress supports 9 field types. Each field name is normalized to{' '}
              <IC>snake_case</IC> in the API response.
            </p>

            <div className="rounded-xl border border-border overflow-hidden mb-8">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Description</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">API value example</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {FIELD_TYPES.map(({ type, label, color, desc, example }) => (
                    <tr key={type}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={cn('inline-flex px-2 py-0.5 rounded text-xs font-medium', color)}>{label}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs leading-relaxed">{desc}</td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <code className="text-xs font-mono text-pink-400">{example}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="font-semibold mb-3">Repeater — example schema & output</h3>
            <p className="text-muted-foreground text-sm mb-2">Define sub-fields once, add unlimited rows in the editor.</p>
            <CodeBlock code={`// Schema definition
{
  "name": "gallery",
  "type": "repeater",
  "subFields": [
    { "name": "image", "type": "image", "required": true },
    { "name": "caption", "type": "text" }
  ]
}

// API output
"gallery": [
  { "image": "/uploads/photo1.jpg", "caption": "First photo" },
  { "image": "/uploads/photo2.jpg", "caption": "Second photo" }
]`} />

            <h3 className="font-semibold mb-3 mt-6">Flexible — example schema & output</h3>
            <p className="text-muted-foreground text-sm mb-2">Each item can be a different "layout" — perfect for page builders.</p>
            <CodeBlock code={`// Schema definition
{
  "name": "sections",
  "type": "flexible",
  "layouts": [
    {
      "name": "hero",
      "label": "Hero Banner",
      "fields": [{ "name": "heading", "type": "text" }]
    },
    {
      "name": "text_block",
      "label": "Text Block",
      "fields": [{ "name": "body", "type": "richtext" }]
    }
  ]
}

// API output — _layout tells you which block type it is
"sections": [
  { "_layout": "hero",       "heading": "Welcome to NodePress" },
  { "_layout": "text_block", "body": "<p>Some content here</p>" }
]`} />
          </Section>

          {/* ── Entries ───────────────────────────────────────────────────── */}
          <Section id="entries" title="Entries & Slugs" icon={Database}>
            <p className="text-muted-foreground leading-relaxed mb-4">
              An Entry is a single piece of content — like one blog post, one product, or one team
              member. Each entry belongs to a Content Type and has a <strong className="text-foreground">slug</strong> —
              a URL-friendly identifier that must be unique within that content type.
            </p>

            <div className="rounded-xl border border-border p-4 mb-6 bg-muted/20">
              <h4 className="font-semibold text-sm mb-2">How slugs work</h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
                <li>Auto-generated from the first <IC>text</IC> or <IC>textarea</IC> field as you type</li>
                <li>Converted to lowercase kebab-case — "My Blog Post" → <IC>my-blog-post</IC></li>
                <li>You can override the slug manually before saving</li>
                <li>Once an entry is created, the slug is <strong className="text-foreground">locked</strong> and cannot be changed (to keep URLs stable)</li>
                <li>The slug becomes the second URL segment: <IC>/api/blog/my-blog-post</IC></li>
              </ul>
            </div>

            <h3 className="font-semibold mb-3">Actions available</h3>
            <div className="space-y-2 mb-6">
              {[
                ['Edit', 'Update any field value. The slug is locked after creation.'],
                ['Duplicate', 'Creates a copy with slug "-copy" appended. Opens the edit page so you can adjust content.'],
                ['Delete', 'Permanently removes the entry.'],
              ].map(([action, desc]) => (
                <div key={action} className="flex gap-3 text-sm">
                  <span className="font-medium text-foreground w-24 shrink-0">{action}</span>
                  <span className="text-muted-foreground">{desc}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* ── Media ─────────────────────────────────────────────────────── */}
          <Section id="media" title="Media Library" icon={ImageIcon}>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Upload images, PDFs, and videos through the Media page. Files are stored on the server and
              served at <IC>/uploads/filename</IC>. Copy a file's URL and paste it into an{' '}
              <IC>image</IC> field in any entry.
            </p>
            <div className="grid grid-cols-2 gap-3 mb-6">
              {[
                { label: 'Images', value: 'JPEG, PNG, GIF, WebP' },
                { label: 'Documents', value: 'PDF' },
                { label: 'Video', value: 'MP4' },
                { label: 'Max size', value: '10 MB per file' },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-sm font-medium mt-0.5">{value}</p>
                </div>
              ))}
            </div>
            <CodeBlock code={`# Upload a file
curl -X POST ${baseUrl}/api/media/upload \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -F "file=@/path/to/photo.jpg"

# Response
{
  "id": 1,
  "filename": "1712345678-abc123.jpg",
  "url": "${baseUrl}/uploads/1712345678-abc123.jpg",
  "mimetype": "image/jpeg"
}`} />
          </Section>

          {/* ── API Keys ──────────────────────────────────────────────────── */}
          <Section id="api-keys" title="API Keys" icon={Key}>
            <p className="text-muted-foreground leading-relaxed mb-4">
              API Keys let external apps read or write content without a JWT token. They are prefixed
              with <IC>np_</IC>. The full key is only shown once — save it somewhere safe.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              {[
                { access: 'read', desc: 'GET requests only. Cannot create, update, or delete.' },
                { access: 'write', desc: 'POST and PUT only. Cannot delete.' },
                { access: 'all', desc: 'Full access — GET, POST, PUT, DELETE.' },
              ].map(({ access, desc }) => (
                <div key={access} className="rounded-xl border border-border p-4">
                  <IC>{access}</IC>
                  <p className="text-xs text-muted-foreground mt-2">{desc}</p>
                </div>
              ))}
            </div>

            <p className="text-sm text-muted-foreground mb-3">
              You can also restrict a key to specific content types. A key with
              <IC>contentTypes: ["blog"]</IC> cannot access <IC>/api/product</IC>.
            </p>

            <CodeBlock code={`# Use the key in the X-API-Key header
curl ${baseUrl}/api/blog \\
  -H "X-API-Key: np_your_key_here"

# Or for write operations
curl -X POST ${baseUrl}/api/blog \\
  -H "X-API-Key: np_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"slug":"new-post","data":{"title":"Hello"}}'`} />
          </Section>

          {/* ── API Reference ─────────────────────────────────────────────── */}
          <Section id="api-reference" title="API Reference" icon={Code2}>

            <h3 className="font-semibold mb-3">Base URL</h3>
            <CodeBlock code={`${baseUrl}/api`} />

            <h3 className="font-semibold mb-3 mt-6">Authentication</h3>
            <p className="text-muted-foreground text-sm mb-3">
              GET requests are <strong className="text-foreground">public</strong> — no auth needed.
              Write operations require either a JWT token (admin) or an API key with write access.
            </p>
            <CodeBlock code={`# JWT token (admin login)
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...

# API key (for external apps)
X-API-Key: np_abc123...`} />

            <h3 className="font-semibold mb-3 mt-6">Dynamic content API</h3>
            <p className="text-muted-foreground text-sm mb-3">
              Every content type you create automatically gets these 5 endpoints.
              Replace <IC>{'{type}'}</IC> with your content type name (e.g. <IC>blog</IC>, <IC>product</IC>).
            </p>
            <div className="rounded-xl border border-border overflow-hidden mb-6">
              <Endpoint method="GET"    path="/api/{type}"        desc="List all entries for this content type" />
              <Endpoint method="GET"    path="/api/{type}/{slug}" desc="Get a single entry by its slug" />
              <Endpoint method="POST"   path="/api/{type}"        desc="Create a new entry" auth />
              <Endpoint method="PUT"    path="/api/{type}/{slug}" desc="Update an existing entry" auth />
              <Endpoint method="DELETE" path="/api/{type}/{slug}" desc="Delete an entry" auth />
            </div>

            <h3 className="font-semibold mb-3">Admin API (require JWT)</h3>
            <div className="rounded-xl border border-border overflow-hidden mb-6">
              <Endpoint method="GET"    path="/api/content-types"     desc="List all content types" />
              <Endpoint method="POST"   path="/api/content-types"     desc="Create a content type" auth />
              <Endpoint method="PUT"    path="/api/content-types/:id" desc="Update a content type" auth />
              <Endpoint method="DELETE" path="/api/content-types/:id" desc="Delete a content type + all its entries" auth />
              <Endpoint method="GET"    path="/api/entries"           desc="List all entries (filter by ?contentTypeId=)" />
              <Endpoint method="POST"   path="/api/media/upload"      desc="Upload a file" auth />
              <Endpoint method="GET"    path="/api/media"             desc="List all media files" />
              <Endpoint method="POST"   path="/api/auth/login"        desc="Login and get a JWT token" />
            </div>

            <h3 className="font-semibold mb-3">Response format</h3>
            <CodeBlock code={`// GET /api/blog — returns an array
[
  {
    "id": 1,
    "slug": "my-first-post",
    "data": {
      "title": "My First Post",
      "content": "<p>Hello world</p>",
      "thumbnail": "/uploads/photo.jpg"
    },
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
]

// GET /api/blog/my-first-post — returns a single object
{
  "id": 1,
  "slug": "my-first-post",
  "data": { ... },
  "createdAt": "...",
  "updatedAt": "..."
}`} />

            <h3 className="font-semibold mb-3 mt-6">Error responses</h3>
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Meaning</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-muted-foreground text-xs">
                  {[
                    ['400', 'Bad Request — missing or invalid fields'],
                    ['401', 'Unauthorized — missing or expired token / invalid API key'],
                    ['403', 'Forbidden — API key lacks permission for this operation'],
                    ['404', 'Not Found — content type or entry does not exist'],
                    ['409', 'Conflict — slug already exists in this content type'],
                  ].map(([code, meaning]) => (
                    <tr key={code}>
                      <td className="px-4 py-2.5 font-mono font-semibold text-foreground">{code}</td>
                      <td className="px-4 py-2.5">{meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* ── Code Examples ─────────────────────────────────────────────── */}
          <Section id="code-examples" title="Code Examples" icon={Code2}>
            <p className="text-muted-foreground text-sm mb-6">
              Generic examples for any content type. Replace <IC>blog</IC> and the base URL with your own.
            </p>

            <h3 className="font-semibold mb-2">Fetch all entries</h3>
            <CodeTabs codes={{
              cURL: `curl ${baseUrl}/api/blog`,
              JavaScript: `const res = await fetch('${baseUrl}/api/blog');\nconst posts = await res.json();\nconsole.log(posts);`,
              React: `import { useEffect, useState } from 'react';

export default function BlogList() {
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    fetch('${baseUrl}/api/blog')
      .then(r => r.json())
      .then(setPosts);
  }, []);

  return (
    <ul>
      {posts.map(post => (
        <li key={post.slug}>
          <a href={\`/blog/\${post.slug}\`}>{post.data.title}</a>
        </li>
      ))}
    </ul>
  );
}`,
              Python: `import requests

posts = requests.get('${baseUrl}/api/blog').json()
for post in posts:
    print(post['slug'], '-', post['data'].get('title', ''))`,
              PHP: `<?php
$posts = json_decode(file_get_contents('${baseUrl}/api/blog'), true);
foreach ($posts as $post) {
    echo $post['slug'] . ' - ' . $post['data']['title'] . PHP_EOL;
}`,
            }} />

            <h3 className="font-semibold mb-2 mt-6">Fetch a single entry</h3>
            <CodeTabs codes={{
              cURL: `curl ${baseUrl}/api/blog/my-first-post`,
              JavaScript: `const res = await fetch('${baseUrl}/api/blog/my-first-post');\nconst post = await res.json();\nconsole.log(post.data.title);`,
              React: `import { useEffect, useState } from 'react';

export default function BlogPost({ slug }) {
  const [post, setPost] = useState(null);

  useEffect(() => {
    fetch(\`${baseUrl}/api/blog/\${slug}\`)
      .then(r => r.json())
      .then(setPost);
  }, [slug]);

  if (!post) return <p>Loading...</p>;

  return (
    <article>
      <h1>{post.data.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: post.data.content }} />
    </article>
  );
}`,
              Python: `import requests

slug = 'my-first-post'
post = requests.get(f'${baseUrl}/api/blog/{slug}').json()
print(post['data']['title'])`,
              PHP: `<?php
$slug = 'my-first-post';
$post = json_decode(
    file_get_contents('${baseUrl}/api/blog/' . $slug),
    true
);
echo $post['data']['title'];`,
            }} />

            <h3 className="font-semibold mb-2 mt-6">Create an entry with an API key</h3>
            <CodeTabs codes={{
              cURL: `curl -X POST ${baseUrl}/api/blog \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: np_your_key_here" \\
  -d '{
    "slug": "new-post",
    "data": {
      "title": "New Post",
      "content": "<p>Hello world</p>"
    }
  }'`,
              JavaScript: `const res = await fetch('${baseUrl}/api/blog', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'np_your_key_here',
  },
  body: JSON.stringify({
    slug: 'new-post',
    data: {
      title: 'New Post',
      content: '<p>Hello world</p>',
    },
  }),
});
const created = await res.json();
console.log(created.slug);`,
              Python: `import requests

response = requests.post(
    '${baseUrl}/api/blog',
    headers={'X-API-Key': 'np_your_key_here'},
    json={
        'slug': 'new-post',
        'data': {
            'title': 'New Post',
            'content': '<p>Hello world</p>',
        }
    }
)
print(response.json())`,
              PHP: `<?php
$data = json_encode([
    'slug' => 'new-post',
    'data' => [
        'title' => 'New Post',
        'content' => '<p>Hello world</p>',
    ]
]);

$context = stream_context_create([
    'http' => [
        'method' => 'POST',
        'header' => "Content-Type: application/json\r\nX-API-Key: np_your_key_here",
        'content' => $data,
    ]
]);

$result = json_decode(
    file_get_contents('${baseUrl}/api/blog', false, $context),
    true
);
echo $result['slug'];`,
            }} />
          </Section>

          {/* Footer note */}
          <div className="border-t border-border pt-8 mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>NodePress CMS — self-hosted headless CMS</span>
            <Link href="/" className="flex items-center gap-1 hover:text-foreground transition-colors">
              Back to Admin <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}
