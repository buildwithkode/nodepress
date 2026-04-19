'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Copy, Check, BookOpen, Zap, Database, Key, Image as ImageIcon, Code2, ChevronRight, ExternalLink, Box, Layers, ClipboardList, Terminal, Globe, Webhook, History, Trash2, Server, Activity, Link2, Languages, Radio, Puzzle, ShieldCheck } from 'lucide-react';
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
  PATCH:  'bg-violet-500/10 text-violet-400 border-violet-500/30',
  DELETE: 'bg-red-500/10 text-red-400 border-red-500/30',
};
function MethodBadge({ m }: { m: string }) {
  return <span className={cn('inline-flex px-2 py-0.5 rounded text-xs font-bold border font-mono shrink-0', METHOD[m])}>{m}</span>;
}

// ─── Endpoint row ─────────────────────────────────────────────────────────────
function Endpoint({ method, path, desc, auth }: { method: string; path: string; desc: string; auth?: boolean }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-border last:border-0">
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
  { type: 'relation', label: 'Relation',       color: 'bg-teal-500/10 text-teal-400',    desc: 'Link to one or many entries in another content type. Returns publicId UUID(s). Use ?populate= to inline the related data.', example: '"uuid-v4" or ["uuid1","uuid2"]' },
];

// ─── Form field types ─────────────────────────────────────────────────────────
const FORM_FIELD_TYPES = [
  { type: 'text',     label: 'Text',     color: 'bg-blue-500/10 text-blue-400',     desc: 'Single-line text input. Good for names, subjects, short answers.' },
  { type: 'email',    label: 'Email',    color: 'bg-cyan-500/10 text-cyan-400',     desc: 'Email address input. Validated server-side — must be a valid address.' },
  { type: 'textarea', label: 'Textarea', color: 'bg-purple-500/10 text-purple-400', desc: 'Multi-line text. Good for messages, comments, longer answers.' },
  { type: 'number',   label: 'Number',   color: 'bg-orange-500/10 text-orange-400', desc: 'Numeric value — integer or decimal. Validated to be a number.' },
  { type: 'select',   label: 'Select',   color: 'bg-yellow-500/10 text-yellow-400', desc: 'Dropdown — pick one from a predefined list. Options set in admin.' },
  { type: 'radio',    label: 'Radio',    color: 'bg-pink-500/10 text-pink-400',     desc: 'Radio buttons — pick one option. Displayed inline. Options set in admin.' },
  { type: 'checkbox', label: 'Checkbox', color: 'bg-green-500/10 text-green-400',   desc: 'Yes/No toggle. Good for newsletter consent, terms agreement.' },
];

// ─── TOC ─────────────────────────────────────────────────────────────────────
const TOC_ITEMS = [
  { id: 'installation',   label: 'Installation (CLI)' },
  { id: 'introduction',   label: 'Introduction' },
  { id: 'quick-start',    label: 'Quick Start' },
  { id: 'content-types',  label: 'Content Types' },
  { id: 'field-types',    label: 'Field Types' },
  { id: 'entries',        label: 'Entries & Slugs' },
  { id: 'i18n',           label: 'i18n / Multi-locale' },
  { id: 'relations',      label: 'Content Relations' },
  { id: 'graphql',        label: 'GraphQL API' },
  { id: 'realtime',       label: 'Real-time (WebSocket)' },
  { id: 'roles',          label: 'Roles & Permissions' },
  { id: 'plugins',        label: 'Plugin System' },
  { id: 'media',          label: 'Media Library' },
  { id: 'api-keys',       label: 'API Keys' },
  { id: 'forms',          label: 'Forms' },
  { id: 'webhooks',       label: 'Webhooks' },
  { id: 'seo',            label: 'SEO & Sitemap' },
  { id: 'self-hosting',   label: 'Self-Hosting' },
  { id: 'observability',  label: 'Observability' },
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
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              {['v1.0', 'Self-hosted', 'REST API', 'GraphQL', 'Real-time', 'i18n', 'MIT License'].map((t) => (
                <span key={t} className="text-[11px] px-2 py-0.5 rounded-full border border-border text-muted-foreground">{t}</span>
              ))}
            </div>
            <h1 className="text-4xl font-extrabold mb-3">NodePress CMS</h1>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl">
              A self-hosted headless CMS. Define your content structure, fill it with data through the
              admin panel, then consume it via REST or GraphQL from any website, app, or platform.
              Built-in i18n, content relations, real-time WebSocket updates, and a plugin system.
            </p>
          </div>

          {/* ── Installation ──────────────────────────────────────────────── */}
          <Section id="installation" title="Installation — Step by Step" icon={Terminal}>
            <p className="text-muted-foreground leading-relaxed mb-6">
              Follow these steps in order. Each step takes only a few minutes. No prior coding experience required.
            </p>

            {/* Quick check callout */}
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 mb-8">
              <p className="text-sm font-medium text-blue-400 mb-2">Already have some tools installed?</p>
              <p className="text-xs text-muted-foreground mb-3">Run these commands in your terminal to check. If you see a version number, you can skip that step.</p>
              <CodeBlock code={`node -v        # v18 or higher? → skip Step 1
git --version  # any version?   → skip Step 2`} />
            </div>

            {/* Step 1 — Node.js */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">1</div>
                <h3 className="font-semibold text-foreground">Install Node.js</h3>
              </div>
              <div className="ml-10 space-y-3">
                <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-3 text-xs text-green-300">
                  <strong>Already installed?</strong> Run <IC>node -v</IC> in your terminal. If it shows <IC>v18</IC> or higher — skip to Step 2.
                </div>
                <p className="text-sm text-muted-foreground">
                  Node.js is the engine that runs NodePress. Download and install version 18 or newer.
                </p>
                <a href="https://nodejs.org" target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-primary border border-primary/30 rounded-lg px-4 py-2 hover:bg-primary/5 transition-colors">
                  <ExternalLink className="h-3.5 w-3.5" /> Download Node.js from nodejs.org
                </a>
                <p className="text-xs text-muted-foreground">After installing, verify it works: <IC>node -v</IC> — it should print a version like <IC>v22.0.0</IC></p>
              </div>
            </div>

            {/* Step 2 — Git */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">2</div>
                <h3 className="font-semibold text-foreground">Install Git</h3>
              </div>
              <div className="ml-10 space-y-3">
                <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-3 text-xs text-green-300">
                  <strong>Already installed?</strong> Run <IC>git --version</IC> in your terminal. If it shows a version number — skip to Step 3.
                </div>
                <p className="text-sm text-muted-foreground">
                  Git is used to download the NodePress source code. You only need to install it — you don't need to know how to use it.
                </p>
                <a href="https://git-scm.com/downloads" target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-primary border border-primary/30 rounded-lg px-4 py-2 hover:bg-primary/5 transition-colors">
                  <ExternalLink className="h-3.5 w-3.5" /> Download Git from git-scm.com
                </a>
                <p className="text-xs text-muted-foreground">On Windows: click Next through all the options — the defaults are fine.</p>
              </div>
            </div>

            {/* Step 3 — PostgreSQL */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">3</div>
                <h3 className="font-semibold text-foreground">Install PostgreSQL</h3>
              </div>
              <div className="ml-10 space-y-3">
                <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-3 text-xs text-green-300">
                  <strong>Already installed?</strong> Make sure you remember the password you set for the <IC>postgres</IC> user — you'll need it in Step 5. Then skip to Step 4.
                </div>
                <p className="text-sm text-muted-foreground">
                  PostgreSQL is the database where all your content is stored. Think of it as the filing cabinet behind the scenes.
                </p>
                <a href="https://www.postgresql.org/download/" target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-primary border border-primary/30 rounded-lg px-4 py-2 hover:bg-primary/5 transition-colors">
                  <ExternalLink className="h-3.5 w-3.5" /> Download PostgreSQL from postgresql.org
                </a>
                <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-3 text-xs text-green-300">
                  <strong>Have Docker?</strong> Skip this step and Step 5 — Docker will manage the database for you. Run <IC>docker-compose up -d</IC> inside your project folder after Step 4.
                </div>
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm">
                  <strong className="text-amber-400">⚠ Important during installation:</strong>
                  <ul className="text-muted-foreground mt-2 space-y-1 list-disc list-inside text-xs">
                    <li>When asked to set a <strong className="text-foreground">password for the postgres user</strong>, write it down — you will need it in Step 5.</li>
                    <li>Leave the port as <strong className="text-foreground">5432</strong> (the default).</li>
                    <li>Keep PostgreSQL running in the background (it starts automatically after install).</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Step 4 — Scaffold */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">4</div>
                <h3 className="font-semibold text-foreground">Create your NodePress project</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-3 ml-10">
                Open a terminal (Command Prompt or Terminal), navigate to the folder where you want your project, and run:
              </p>
              <div className="ml-10">
                <CodeBlock code={`npx create-nodepress-app my-project`} />
                <p className="text-xs text-muted-foreground mt-1">Replace <IC>my-project</IC> with whatever you want to call your project. This command downloads NodePress, generates secret keys, and installs all dependencies automatically. It takes 2–5 minutes.</p>
              </div>
            </div>

            {/* Step 5 — DATABASE_URL */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">5</div>
                <h3 className="font-semibold text-foreground">Connect NodePress to your database</h3>
              </div>
              <div className="ml-10 space-y-3">
                <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-3 text-xs text-green-300">
                  <strong>Using Docker?</strong> Skip this step. Run <IC>docker-compose up -d</IC> in your project folder instead — Docker manages the database password automatically.
                </div>
                <p className="text-sm text-muted-foreground">
                  The CLI generates a random database password, but NodePress needs to connect to <em>your</em> PostgreSQL using the password you set in Step 3.
                </p>
                <p className="text-sm text-muted-foreground">
                  Open the file <IC>my-project/backend/.env</IC> in any text editor (Notepad is fine) and find this line:
                </p>
                <CodeBlock code={`DATABASE_URL="postgresql://postgres:RANDOM_PASSWORD@localhost:5432/YOUR_NODEPRESS_DATABASE"`} />
                <p className="text-sm text-muted-foreground">Replace <IC>RANDOM_PASSWORD</IC> with the password you chose when installing PostgreSQL:</p>
                <CodeBlock code={`DATABASE_URL="postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/YOUR_NODEPRESS_DATABASE"`} />
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm">
                  <strong className="text-blue-400">What is DATABASE_URL?</strong>
                  <p className="text-muted-foreground mt-1 text-xs">
                    It's the address NodePress uses to find and log into your database. Think of it like a home address: <IC>postgresql://</IC> is the transport, <IC>postgres</IC> is the username, the part after <IC>:</IC> is the password, <IC>localhost:5432</IC> is where the database lives on your computer, and <IC>YOUR_NODEPRESS_DATABASE</IC> is the database name — you can name it anything you like.
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-muted/30 p-4 text-xs text-muted-foreground">
                  <strong className="text-foreground">Didn't set a password?</strong> If you clicked through the PostgreSQL installer without setting a password, try leaving it out entirely:<br />
                  <IC>DATABASE_URL="postgresql://postgres@localhost:5432/YOUR_NODEPRESS_DATABASE"</IC>
                </div>
              </div>
            </div>

            {/* Step 6 — Migrate */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">6</div>
                <h3 className="font-semibold text-foreground">Create the database tables</h3>
              </div>
              <div className="ml-10 space-y-3">
                <p className="text-sm text-muted-foreground">
                  This command creates all the tables NodePress needs inside your PostgreSQL database. You only run this once.
                </p>
                <CodeBlock code={`cd my-project/backend

# Local PostgreSQL (recommended for development)
npx prisma migrate dev

# Cloud database — Neon, Supabase, Railway, RDS (use deploy instead)
npx prisma migrate deploy`} />
                <p className="text-xs text-muted-foreground mt-1">
                  Both commands apply all existing migrations to a fresh database.
                  Use <IC>migrate dev</IC> locally — it also generates new migration files when you change the schema.
                  Use <IC>migrate deploy</IC> for cloud databases — it only applies existing files and never prompts.
                </p>
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300 mt-2">
                  <strong>Getting an authentication error?</strong> It means the password in <IC>DATABASE_URL</IC> doesn't match your PostgreSQL password. Go back to Step 5 and double-check the password.
                </div>
              </div>
            </div>

            {/* Step 7 — Start backend */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">7</div>
                <h3 className="font-semibold text-foreground">Start the backend</h3>
              </div>
              <div className="ml-10">
                <CodeBlock code={`cd my-cms/backend
npm run start:dev`} />
                <p className="text-xs text-muted-foreground mt-2">The backend API is now running at <IC>http://localhost:3000</IC>. Keep this terminal open.</p>
              </div>
            </div>

            {/* Step 8 — Start frontend */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">8</div>
                <h3 className="font-semibold text-foreground">Start the admin panel</h3>
              </div>
              <div className="ml-10">
                <p className="text-sm text-muted-foreground mb-3">Open a <strong className="text-foreground">new terminal window</strong> (keep the backend one running) and run:</p>
                <CodeBlock code={`cd my-cms/frontend
npm run dev`} />
                <p className="text-xs text-muted-foreground mt-2">The admin panel is now running at <IC>http://localhost:5173</IC>. Keep this terminal open too.</p>
              </div>
            </div>

            {/* Step 9 — First login */}
            <div className="mb-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">9</div>
                <h3 className="font-semibold text-foreground">Create your admin account</h3>
              </div>
              <div className="ml-10">
                <p className="text-sm text-muted-foreground mb-3">
                  Open your browser and go to <IC>http://localhost:5173</IC>. You will be automatically taken to the setup page. Enter your site name, email, and a password to create your admin account.
                </p>
                <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 text-sm">
                  <strong className="text-green-400">🎉 You're done!</strong>
                  <p className="text-muted-foreground mt-1 text-xs">
                    NodePress is running. You can now create content types, add entries, upload media, and use the API. The setup page only appears once — after that it's disabled permanently for security.
                  </p>
                </div>
              </div>
            </div>
          </Section>

          {/* ── Introduction ──────────────────────────────────────────────── */}
          <Section id="introduction" title="Introduction" icon={BookOpen}>
            <p className="text-muted-foreground leading-relaxed mb-6">
              NodePress works in three steps: you <strong className="text-foreground">define</strong> the shape
              of your content, you <strong className="text-foreground">fill it</strong> with data in the admin
              panel, and then your website or app <strong className="text-foreground">reads</strong> it through
              the API. No coding required for steps 1 and 2.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { icon: Layers,        title: 'Content Types',      desc: 'Define the structure — like a "Blog Post" with title, content, and thumbnail fields.' },
                { icon: Database,      title: 'Entries',            desc: 'Fill in content. Each entry has a slug, status (draft/published), SEO fields, and scheduled publish date.' },
                { icon: History,       title: 'Versioning',         desc: 'Every update snapshots the previous version. Restore any past version with one click.' },
                { icon: ImageIcon,     title: 'Media',              desc: 'Upload images, PDFs, and videos. Images are auto-optimized and a WebP sibling is generated.' },
                { icon: Key,           title: 'API Keys',           desc: 'Generate read or write keys for external apps to access your content securely.' },
                { icon: ClipboardList, title: 'Forms',              desc: 'Build contact forms with custom fields. Submissions trigger email or webhook actions.' },
                { icon: Webhook,       title: 'Webhooks',           desc: 'Get notified on entry.created, entry.updated, and more. Signed with HMAC-SHA256.' },
                { icon: Globe,         title: 'SEO & Sitemap',      desc: 'Per-entry SEO title, description, OG image, noIndex. Auto-generated sitemap.xml and robots.txt.' },
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
                Content type names are stored as <IC>snake_case</IC> internally.
                "My Blog Posts" → stored as <IC>my_blog_posts</IC>, but the API URL uses hyphens:{' '}
                <IC>GET /api/my-blog-posts</IC>. The API endpoint is shown as you type on the Create page.
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
                <li>Once an entry is created, the slug is <strong className="text-foreground">locked</strong> (to keep URLs stable)</li>
                <li>The slug becomes the second URL segment: <IC>/api/blog/my-blog-post</IC></li>
              </ul>
            </div>

            <h3 className="font-semibold mb-3">Status</h3>
            <div className="space-y-2 mb-6">
              {[
                ['draft',          'Not visible on the public API. Editable in the admin panel.'],
                ['published',      'Visible on the public API. Default for new entries.'],
                ['pending_review', 'Waiting for approval before publishing. Not visible on the public API. Use the status filter in the admin entries list to see these entries.'],
                ['archived',       'Hidden from both the public API and the default admin list.'],
              ].map(([status, desc]) => (
                <div key={status} className="flex gap-3 text-sm">
                  <IC>{status}</IC>
                  <span className="text-muted-foreground">{desc}</span>
                </div>
              ))}
            </div>

            <h3 className="font-semibold mb-3">Scheduled publishing</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Set a <IC>publishAt</IC> date and time on any draft entry. A background job runs every
              minute and automatically promotes it to <IC>published</IC> when the time arrives.
              The field is shown on the entry edit page when status is <IC>draft</IC>.
            </p>

            <h3 className="font-semibold mb-3">SEO fields</h3>
            <p className="text-muted-foreground text-sm mb-2">
              Every entry has an optional SEO accordion on the edit page. These fields power the
              public page's <IC>{`<head>`}</IC> meta tags via <IC>generateMetadata()</IC> in Next.js.
            </p>
            <div className="space-y-2 mb-6">
              {[
                ['seo.title',       'Override the browser tab title and OG title.'],
                ['seo.description', 'Meta description and OG description (recommended 120–160 chars).'],
                ['seo.image',       'Open Graph image URL shown in link previews.'],
                ['seo.noIndex',     'Add <meta name="robots" content="noindex"> to hide from search engines.'],
              ].map(([field, desc]) => (
                <div key={field} className="flex gap-3 text-sm">
                  <IC>{field}</IC>
                  <span className="text-muted-foreground">{desc}</span>
                </div>
              ))}
            </div>

            <h3 className="font-semibold mb-3">Version history</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Every time you save an entry, the previous state is snapshotted automatically.
              Open an entry and click <strong className="text-foreground">Version History</strong> to
              see all past versions and restore any of them with one click.
            </p>

            <h3 className="font-semibold mb-3">Trash (soft delete)</h3>
            <p className="text-muted-foreground text-sm mb-2">
              Deleting an entry moves it to the Trash — it disappears from the public API and the
              normal admin list, but is not permanently removed. Use the{' '}
              <strong className="text-foreground">Trash</strong> filter to see deleted entries.
            </p>
            <div className="space-y-2 mb-6">
              {[
                ['Delete',   'Moves to Trash. Disappears from public API immediately.'],
                ['Restore',  'Moves the entry back out of Trash to its previous status.'],
                ['Purge',    'Permanently and irreversibly deletes the entry and all its versions.'],
              ].map(([action, desc]) => (
                <div key={action} className="flex gap-3 text-sm">
                  <span className="font-medium text-foreground w-20 shrink-0">{action}</span>
                  <span className="text-muted-foreground">{desc}</span>
                </div>
              ))}
            </div>

            <h3 className="font-semibold mb-3">Other actions</h3>
            <div className="space-y-2 mb-6">
              {[
                ['Edit',       'Update any field value. The slug is locked after creation.'],
                ['Duplicate',  'Creates a copy with slug "-copy" appended.'],
              ].map(([action, desc]) => (
                <div key={action} className="flex gap-3 text-sm">
                  <span className="font-medium text-foreground w-20 shrink-0">{action}</span>
                  <span className="text-muted-foreground">{desc}</span>
                </div>
              ))}
            </div>

            <h3 className="font-semibold mb-3">Autosave</h3>
            <p className="text-muted-foreground text-sm">
              The entry editor automatically saves your changes 3 seconds after you stop typing.
              A <strong className="text-foreground">Saving…</strong> / <strong className="text-foreground">Saved</strong> indicator
              appears in the card header. Autosave performs a silent PUT in the background — no page navigation or notification.
            </p>
          </Section>

          {/* ── i18n ──────────────────────────────────────────────────────── */}
          <Section id="i18n" title="i18n / Multi-locale" icon={Languages}>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Every entry carries a <IC>locale</IC> field (BCP 47 code, e.g. <IC>en</IC>, <IC>fr</IC>, <IC>de</IC>).
              The same slug can exist in multiple locales — each combination is a unique entry.
            </p>

            <h3 className="font-semibold mb-2">Creating a localized entry</h3>
            <p className="text-muted-foreground text-sm mb-2">In the admin panel, select the locale from the dropdown next to Status when creating or editing an entry. Via API:</p>
            <CodeBlock code={`POST /api/entries
{
  "contentTypeId": 1,
  "slug": "mon-article",
  "locale": "fr",
  "data": { "title": "Mon premier article" }
}`} />

            <h3 className="font-semibold mb-2 mt-5">Fetching by locale (public API)</h3>
            <CodeBlock code={`# All French articles
GET /api/article?locale=fr

# Single entry in French
GET /api/article/mon-article?locale=fr`} />

            <h3 className="font-semibold mb-2 mt-5">Supported locales</h3>
            <p className="text-muted-foreground text-sm mb-2">
              Any BCP 47 code is accepted. The admin panel includes shortcuts for:
            </p>
            <div className="flex flex-wrap gap-2">
              {['en', 'fr', 'de', 'es', 'it', 'pt', 'ja', 'zh', 'ar'].map((l) => (
                <span key={l} className="px-2 py-1 rounded bg-muted font-mono text-xs">{l}</span>
              ))}
            </div>

            <div className="mt-5 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm">
              <strong className="text-blue-400">Unique constraint:</strong>
              <p className="text-muted-foreground mt-1 text-xs">
                The combination of <IC>contentTypeId + slug + locale</IC> must be unique.
                The same slug <IC>hello-world</IC> can exist in <IC>en</IC>, <IC>fr</IC>, and <IC>de</IC> simultaneously.
              </p>
            </div>
          </Section>

          {/* ── Relations ─────────────────────────────────────────────────── */}
          <Section id="relations" title="Content Relations" icon={Link2}>
            <p className="text-muted-foreground leading-relaxed mb-4">
              The <IC>relation</IC> field type links entries across content types using their public UUID (<IC>publicId</IC>).
              Relations support one-to-one and one-to-many cardinality.
            </p>

            <h3 className="font-semibold mb-2">Defining a relation field</h3>
            <p className="text-muted-foreground text-sm mb-2">In the content type builder, add a field of type <IC>Relation</IC> and configure:</p>
            <div className="overflow-x-auto rounded-xl border border-border mb-4">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border bg-muted/30"><th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Option</th><th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Values</th><th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Description</th></tr></thead>
                <tbody className="text-muted-foreground divide-y divide-border">
                  <tr><td className="px-4 py-2.5 font-mono">relatedContentType</td><td className="px-4 py-2.5">any content type name</td><td className="px-4 py-2.5">The content type to link to</td></tr>
                  <tr><td className="px-4 py-2.5 font-mono">cardinality</td><td className="px-4 py-2.5"><IC>one</IC> | <IC>many</IC></td><td className="px-4 py-2.5">Single link or multi-select</td></tr>
                </tbody>
              </table>
            </div>

            <h3 className="font-semibold mb-2 mt-5">Storing relation values</h3>
            <p className="text-muted-foreground text-sm mb-2">The field stores the <IC>publicId</IC> UUID(s) of linked entries:</p>
            <CodeBlock code={`// cardinality: "one"
{ "author": "550e8400-e29b-41d4-a716-446655440000" }

// cardinality: "many"
{ "tags": ["uuid-1", "uuid-2", "uuid-3"] }`} />

            <h3 className="font-semibold mb-2 mt-5">Populating relations</h3>
            <p className="text-muted-foreground text-sm mb-2">Use <IC>?populate=fieldName</IC> to replace UUIDs with full entry objects in the response. Supports dot-notation for nested relations (up to 3 levels deep):</p>
            <CodeBlock code={`# Single field
GET /api/article/my-post?populate=author

# Multiple fields
GET /api/article/my-post?populate=author,tags

# Nested — also resolve author's "company" relation
GET /api/article/my-post?populate=author,author.company

# Deep nesting — up to 3 levels
GET /api/article/my-post?populate=author,author.company,author.company.address

# Response — author is now a full object instead of a UUID string
{
  "slug": "my-post",
  "data": {
    "title": "My Post",
    "author": {
      "id": "550e8400-...",
      "slug": "john-doe",
      "data": {
        "name": "John Doe",
        "bio": "...",
        "company": {
          "slug": "acme-corp",
          "data": { "name": "Acme Corp", "address": "..." }
        }
      }
    }
  }
}`} />

            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm mt-4">
              <strong className="text-blue-400">Performance note.</strong>
              <p className="text-muted-foreground mt-1 text-xs">
                Each depth level makes one additional batched DB query — not N queries per relation. Caching is bypassed when <IC>?populate</IC> is used because the response shape varies per request.
              </p>
            </div>
          </Section>

          {/* ── GraphQL ───────────────────────────────────────────────────── */}
          <Section id="graphql" title="GraphQL API" icon={Code2}>
            <p className="text-muted-foreground leading-relaxed mb-4">
              NodePress exposes a GraphQL endpoint at <IC>/graphql</IC> alongside the REST API.
              Use GraphQL when you need to fetch multiple resources in one round-trip or want strict typing.
            </p>

            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm mb-4">
              <strong className="text-blue-400">Playground available in all environments.</strong>
              <p className="text-muted-foreground mt-1 text-xs">
                Click <strong>GraphQL Playground</strong> in the Developer section of the sidebar. It opens Apollo Sandbox at <IC>/graphql</IC> — works in both development and production.
              </p>
            </div>

            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm mb-5">
              <strong className="text-amber-400">Playground shows blank page?</strong>
              <p className="text-muted-foreground mt-1 text-xs">
                This is a browser cache issue — the browser cached an old response with stale security headers.
                Fix: open an <strong>Incognito window</strong> (works immediately) or press <strong>Ctrl+Shift+Delete</strong> → clear <em>Cached images and files</em> → refresh.
                This only happens once after a server restart with changed headers.
              </p>
            </div>

            <h3 className="font-semibold mb-3">Step-by-step: first query</h3>
            <p className="text-muted-foreground text-sm mb-3">
              This walkthrough assumes you have a <IC>blog</IC> content type with fields <IC>title</IC> (text) and <IC>body</IC> (richtext). Create it in <strong>Content Types</strong> and add a few entries first.
            </p>

            <div className="space-y-3 mb-5">
              <div className="rounded-lg border border-border bg-card p-3 text-sm">
                <p className="font-medium mb-1">1 — Open the playground</p>
                <p className="text-xs text-muted-foreground">Click <strong>GraphQL Playground ↗</strong> in the sidebar. Apollo Sandbox opens at <IC>/graphql</IC>.</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-3 text-sm">
                <p className="font-medium mb-1">2 — Add your auth token (for protected queries)</p>
                <p className="text-xs text-muted-foreground mb-2">In Apollo Sandbox click <strong>Headers</strong> at the bottom and add:</p>
                <CodeBlock code={`{ "Authorization": "Bearer YOUR_JWT_TOKEN" }`} />
                <p className="text-xs text-muted-foreground mt-2">Get your token from <IC>POST /api/auth/login</IC> or copy it from your browser's cookies (<IC>np_token</IC>).</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-3 text-sm">
                <p className="font-medium mb-1">3 — Run your first query</p>
                <p className="text-xs text-muted-foreground mb-2">Paste this into the editor and click Run:</p>
                <CodeBlock code={`query ListBlogPosts {
  entries(contentTypeId: 1, status: "published", locale: "en", page: 1, limit: 10) {
    total
    data {
      id
      slug
      status
      data
      createdAt
    }
  }
}`} />
              </div>
            </div>

            <h3 className="font-semibold mb-2">Sample queries</h3>
            <CodeBlock code={`# List published blog posts
query ListBlogPosts {
  entries(contentTypeId: 1, status: "published", locale: "en", page: 1, limit: 10) {
    total
    data {
      id
      slug
      status
      data
      createdAt
    }
  }
}

# Fetch a single entry by ID
query GetPost {
  entry(id: 1) {
    id
    slug
    status
    locale
    data
    createdAt
    updatedAt
  }
}

# List all content types
query GetContentTypes {
  contentTypes {
    id
    name
    schema
  }
}

# List media files (auth required)
query GetMedia {
  mediaFiles(page: 1, limit: 20) {
    total
    data {
      id
      filename
      url
      mimetype
      size
    }
  }
}

# List webhooks (admin only)
query GetWebhooks {
  webhooks {
    id
    name
    url
    events
    enabled
  }
}`} />

            <h3 className="font-semibold mb-2 mt-5">Entry mutations</h3>
            <CodeBlock code={`# Create an entry (editor / contributor / admin)
mutation CreatePost {
  createEntry(
    contentTypeId: 1
    slug: "hello-world"
    locale: "en"
    status: "draft"
    data: "{\\"title\\":\\"Hello World\\",\\"body\\":\\"<p>My first post.</p>\\"}"
  ) {
    id
    slug
    status
    createdAt
  }
}

# Update an entry
mutation UpdatePost {
  updateEntry(
    id: 1
    status: "published"
    data: "{\\"title\\":\\"Updated Title\\",\\"body\\":\\"<p>Edited.</p>\\"}"
  ) {
    id
    slug
    status
    updatedAt
  }
}

# Soft-delete an entry (editor / admin)
mutation DeletePost {
  deleteEntry(id: 1) { message }
}

# Restore a soft-deleted entry
mutation RestorePost {
  restoreEntry(id: 1) { id slug status }
}

# Permanently delete (admin only)
mutation PurgePost {
  purgeEntry(id: 1) { message }
}

# Restore to a previous version
mutation RestoreVersion {
  restoreEntryVersion(entryId: 1, versionId: 3) { id slug updatedAt }
}

# Bulk operations
mutation BulkPublish  { bulkPublishEntries(ids: [1, 2, 3])          { affected } }
mutation BulkArchive  { bulkArchiveEntries(ids: [4, 5])              { affected } }
mutation BulkPending  { bulkSetPendingReviewEntries(ids: [6, 7])     { affected } }
mutation BulkDelete   { bulkDeleteEntries(ids: [8, 9])               { affected } }`} />

            <h3 className="font-semibold mb-2 mt-5">Content type mutations</h3>
            <CodeBlock code={`# Create a content type (admin only)
# schema arg is a JSON array of field definitions
mutation CreateBlogType {
  createContentType(
    name: "blog"
    schema: "[{\\"name\\":\\"title\\",\\"type\\":\\"text\\",\\"required\\":true},{\\"name\\":\\"body\\",\\"type\\":\\"richtext\\"}]"
  ) {
    id
    name
    schema
  }
}

# Update a content type
mutation UpdateBlogType {
  updateContentType(
    id: 1
    schema: "[{\\"name\\":\\"title\\",\\"type\\":\\"text\\"},{\\"name\\":\\"body\\",\\"type\\":\\"richtext\\"},{\\"name\\":\\"tags\\",\\"type\\":\\"select\\"}]"
  ) {
    id
    name
    schema
    updatedAt
  }
}

# Delete a content type (also deletes all entries)
mutation DeleteBlogType {
  deleteContentType(id: 1) { id name }
}`} />

            <h3 className="font-semibold mb-2 mt-5">Webhook mutations</h3>
            <CodeBlock code={`# Create a webhook (admin only)
mutation CreateWebhook {
  createWebhook(
    name: "Deploy trigger"
    url: "https://example.com/hooks/deploy"
    events: ["entry.created", "entry.updated"]
    secret: "my-hmac-secret"
    enabled: true
  ) {
    id
    name
    url
    events
    enabled
  }
}

# Enable / disable
mutation ToggleWebhook {
  toggleWebhook(id: 1, enabled: false) { id enabled }
}

# Send a test ping
mutation PingWebhook {
  pingWebhook(id: 1) { message }
}

# Delete a webhook
mutation DeleteWebhook {
  deleteWebhook(id: 1) { message }
}`} />

            <h3 className="font-semibold mb-2 mt-5">Authentication</h3>
            <p className="text-muted-foreground text-sm mb-2">
              Public queries (<IC>entries</IC>, <IC>contentTypes</IC>) work without auth and return only published entries.
              Authenticated users (JWT Bearer token) see all statuses. Write mutations require <IC>editor</IC> or <IC>admin</IC> role.
            </p>
            <CodeBlock code={`fetch('/graphql', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_JWT_TOKEN',
  },
  body: JSON.stringify({
    query: \`
      query {
        entries(contentTypeId: 1, status: "published") {
          total
          data { id slug data }
        }
      }
    \`
  }),
})`} />

            <h3 className="font-semibold mb-2 mt-5">Query depth limit</h3>
            <p className="text-muted-foreground text-sm">Queries are limited to a depth of <strong className="text-foreground">6</strong> to prevent abuse. Queries deeper than 6 nested fields are rejected with a validation error.</p>
          </Section>

          {/* ── Real-time ─────────────────────────────────────────────────── */}
          <Section id="realtime" title="Real-time (WebSocket)" icon={Radio}>
            <p className="text-muted-foreground leading-relaxed mb-4">
              NodePress broadcasts content changes over WebSocket using Socket.io.
              Connect to <IC>ws://your-api/api/realtime</IC> to receive live updates in your frontend.
            </p>

            <h3 className="font-semibold mb-2">Events emitted by the server</h3>
            <div className="overflow-x-auto rounded-xl border border-border mb-4">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border bg-muted/30"><th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Event</th><th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Payload</th></tr></thead>
                <tbody className="text-muted-foreground divide-y divide-border">
                  <tr><td className="px-4 py-2.5 font-mono text-xs">entry:created</td><td className="px-4 py-2.5 font-mono text-xs">{'{ id, slug, contentType, locale }'}</td></tr>
                  <tr><td className="px-4 py-2.5 font-mono text-xs">entry:updated</td><td className="px-4 py-2.5 font-mono text-xs">{'{ id, slug, contentType, locale, status }'}</td></tr>
                  <tr><td className="px-4 py-2.5 font-mono text-xs">entry:deleted</td><td className="px-4 py-2.5 font-mono text-xs">{'{ id, slug, contentType? }'}</td></tr>
                  <tr><td className="px-4 py-2.5 font-mono text-xs">media:uploaded</td><td className="px-4 py-2.5 font-mono text-xs">{'{ id, filename, url, mimetype }'}</td></tr>
                  <tr><td className="px-4 py-2.5 font-mono text-xs">media:deleted</td><td className="px-4 py-2.5 font-mono text-xs">{'{ filename }'}</td></tr>
                </tbody>
              </table>
            </div>

            <h3 className="font-semibold mb-2">Rooms</h3>
            <p className="text-muted-foreground text-sm mb-2">
              Every client automatically joins the <IC>global</IC> room (all events). Subscribe to a content-type room to receive only events for that type:
            </p>
            <CodeBlock code={`// Subscribe to article events only
socket.emit('subscribe', { contentType: 'article' });

// Unsubscribe
socket.emit('unsubscribe', { contentType: 'article' });`} />

            <h3 className="font-semibold mb-2 mt-5">React hook (built-in)</h3>
            <p className="text-muted-foreground text-sm mb-2">Import <IC>useRealtimeEvents</IC> from <IC>lib/useRealtimeEvents</IC>:</p>
            <CodeBlock code={`import { useRealtimeEvents } from '@/lib/useRealtimeEvents';

export default function LiveDashboard() {
  useRealtimeEvents(
    {
      onEntryCreated: (p) => console.log('New entry:', p.slug),
      onEntryUpdated: (p) => console.log('Updated:', p.slug, p.status),
      onMediaUploaded: (p) => console.log('Uploaded:', p.filename),
    },
    ['article', 'page'],   // subscribe to these content types
  );

  return <div>Watching for updates...</div>;
}`} />

            <h3 className="font-semibold mb-2 mt-5">Authentication</h3>
            <p className="text-muted-foreground text-sm mb-2">
              Every connection must provide a valid <strong>JWT token</strong> or <strong>API key</strong>. Unauthenticated connections receive an <IC>error</IC> event and are immediately disconnected.
            </p>

            <div className="rounded-lg border border-border bg-card p-4 text-sm mb-4 space-y-2">
              <p className="font-medium">How to get your Bearer token</p>
              <p className="text-xs text-muted-foreground"><strong>Option A — Login API:</strong> call <IC>POST /api/auth/login</IC> with your email and password. The response contains <IC>access_token</IC>. Use it as <IC>Bearer {'<'}access_token{'>'}</IC>.</p>
              <CodeBlock code={`# Step 1 — login and get your token
curl -X POST https://your-api.com/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email":"you@example.com","password":"yourpassword"}'

# Response:
# { "access_token": "eyJhbGci...", "user": { ... } }

# Step 2 — use it
Authorization: Bearer eyJhbGci...`} />
              <p className="text-xs text-muted-foreground"><strong>Option B — From the browser:</strong> after logging into the admin panel, open DevTools → Application → Cookies → find <IC>np_token</IC>. Copy its value — that is your Bearer token.</p>
              <p className="text-xs text-muted-foreground"><strong>Option C — API key:</strong> create one in Admin → API Keys. Use it as the <IC>apiKey</IC> option instead of a token (no expiry).</p>
            </div>

            <CodeBlock code={`import { io } from 'socket.io-client';

// Option 1 — JWT token (get from POST /api/auth/login or np_token cookie)
const socket = io('https://your-api.com', {
  path: '/api/realtime',
  withCredentials: true,
  auth: { token: 'Bearer eyJhbGci...' },
});

// Option 2 — API key (server-to-server, no expiry)
const socket = io('https://your-api.com', {
  path: '/api/realtime',
  auth: { apiKey: 'np_your_api_key_here' },
});

// Listen for events
socket.on('entry:created', ({ id, slug, contentType }) => {
  console.log(\`New \${contentType} entry: \${slug}\`);
});

socket.on('entry:updated', ({ slug, status }) => {
  if (status === 'published') refreshPage(slug);
});

socket.on('error', ({ message }) => {
  console.error('WebSocket auth failed:', message);
});`} />

            <h3 className="font-semibold mb-2 mt-5">Multi-instance scaling (Redis)</h3>
            <p className="text-muted-foreground text-sm mb-2">
              When <IC>REDIS_URL</IC> is set, NodePress automatically attaches the <IC>@socket.io/redis-adapter</IC> to Socket.io.
              This syncs rooms and events across all backend instances — a broadcast from instance A reaches clients connected to instance B.
            </p>
            <CodeBlock code={`# Set in your .env to enable multi-instance WebSocket sync
REDIS_URL=redis://localhost:6379

# When unset, falls back to the in-memory adapter (single-instance mode)`} />
            <p className="text-muted-foreground text-xs mt-2">
              The Redis adapter is lazy-loaded and fails open — if Redis is unavailable at startup, the backend continues with the in-memory adapter and logs a warning. No restart required to re-enable after Redis recovers (set the env var and restart the process).
            </p>
          </Section>

          {/* ── Roles & Permissions ───────────────────────────────────────── */}
          <Section id="roles" title="Roles & Permissions" icon={ShieldCheck}>
            <p className="text-muted-foreground leading-relaxed mb-4">
              NodePress has four built-in roles. Access to admin routes is enforced server-side — the frontend role display is for UX only.
            </p>

            <div className="overflow-x-auto rounded-xl border border-border mb-5">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border bg-muted/30"><th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Role</th><th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Can do</th><th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Cannot do</th></tr></thead>
                <tbody className="text-muted-foreground divide-y divide-border">
                  <tr><td className="px-4 py-2.5 font-semibold text-foreground">admin</td><td className="px-4 py-2.5">Everything — users, permissions, content types, entries, media, webhooks</td><td className="px-4 py-2.5">—</td></tr>
                  <tr><td className="px-4 py-2.5 font-semibold text-foreground">editor</td><td className="px-4 py-2.5">Create, read, update, delete, publish any entry or media</td><td className="px-4 py-2.5">Manage users, content types, webhooks, permissions</td></tr>
                  <tr><td className="px-4 py-2.5 font-semibold text-foreground">contributor</td><td className="px-4 py-2.5">Create and update entries (cannot delete or publish)</td><td className="px-4 py-2.5">Delete, publish, manage settings</td></tr>
                  <tr><td className="px-4 py-2.5 font-semibold text-foreground">viewer</td><td className="px-4 py-2.5">Read-only access to the admin panel</td><td className="px-4 py-2.5">Create, edit, or delete anything</td></tr>
                </tbody>
              </table>
            </div>

            <h3 className="font-semibold mb-2">Per-content-type overrides</h3>
            <p className="text-muted-foreground text-sm mb-2">
              Go to <strong className="text-foreground">Users → Permissions</strong> to set which actions each role can perform on specific content types.
              A wildcard row (<IC>*</IC>) applies to all content types unless overridden.
            </p>
            <CodeBlock code={`# Get all permissions
GET /api/permissions

# Get permissions for a role
GET /api/permissions/editor

# Update permissions for a role + content type
PUT /api/permissions/editor/article
{
  "actions": ["create", "read", "update"]
}

# Reset all permissions to defaults
PUT /api/permissions/reset/all`} />

            <div className="mt-4 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm">
              <strong className="text-blue-400">How permissions are checked:</strong>
              <ol className="text-muted-foreground mt-1 text-xs space-y-1 list-decimal list-inside">
                <li>Check for an exact <IC>role + contentType</IC> row</li>
                <li>Fall back to the wildcard <IC>role + *</IC> row</li>
                <li>If neither exists, deny by default</li>
              </ol>
            </div>
          </Section>

          {/* ── Plugin System ─────────────────────────────────────────────── */}
          <Section id="plugins" title="Plugin System" icon={Puzzle}>
            <p className="text-muted-foreground leading-relaxed mb-4">
              NodePress ships with a plugin architecture that lets you extend the CMS with custom NestJS modules — new REST endpoints, event listeners, background jobs, and more.
            </p>

            <h3 className="font-semibold mb-2">Plugin contract</h3>
            <p className="text-muted-foreground text-sm mb-2">A plugin is a folder that exports two things:</p>
            <CodeBlock code={`// src/plugins/my-plugin/manifest.ts
import { PluginManifest } from '../../plugin/plugin-sdk';

export const MyPluginManifest: PluginManifest = {
  id: 'my-plugin',           // kebab-case unique ID
  name: 'My Plugin',
  version: '1.0.0',
  description: 'What this plugin does',
  permissions: ['entries:read'],
};

// src/plugins/my-plugin/my-plugin.module.ts
import { Module } from '@nestjs/common';
import { MyPluginService } from './my-plugin.service';

@Module({ providers: [MyPluginService] })
export class MyPluginModule {}`} />

            <h3 className="font-semibold mb-2 mt-5">Enabling a plugin</h3>
            <p className="text-muted-foreground text-sm mb-2">Add it to <IC>src/plugin/plugins.config.ts</IC>:</p>
            <CodeBlock code={`import { MyPluginManifest, MyPluginModule } from '../plugins/my-plugin';

export const ENABLED_PLUGINS = [
  { manifest: MyPluginManifest, module: MyPluginModule },
];`} />

            <h3 className="font-semibold mb-2 mt-5">Reacting to entry lifecycle events</h3>
            <p className="text-muted-foreground text-sm mb-2">Install <IC>@nestjs/event-emitter</IC> and use <IC>@OnEvent()</IC> in your plugin service:</p>
            <CodeBlock code={`import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PluginEvents, EntryLifecyclePayload } from '../../plugin/plugin-sdk';

@Injectable()
export class MyPluginService {
  @OnEvent(PluginEvents.ENTRY_AFTER_CREATE)
  handleCreate(payload: EntryLifecyclePayload) {
    console.log('Entry created:', payload.slug, payload.contentType);
  }

  @OnEvent(PluginEvents.ENTRY_AFTER_PUBLISH)
  handlePublish(payload: EntryLifecyclePayload) {
    // e.g. post to social media, ping a CDN, update a search index
  }
}`} />

            <h3 className="font-semibold mb-2 mt-5">Available lifecycle events</h3>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border bg-muted/30"><th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Event constant</th><th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Fires when</th></tr></thead>
                <tbody className="text-muted-foreground divide-y divide-border font-mono text-xs">
                  {[
                    ['ENTRY_BEFORE_CREATE / ENTRY_AFTER_CREATE', 'Entry is being / has been created'],
                    ['ENTRY_BEFORE_UPDATE / ENTRY_AFTER_UPDATE', 'Entry is being / has been updated'],
                    ['ENTRY_BEFORE_DELETE / ENTRY_AFTER_DELETE', 'Entry is being / has been soft-deleted'],
                    ['ENTRY_BEFORE_PUBLISH / ENTRY_AFTER_PUBLISH', 'Entry status changes to published'],
                  ].map(([event, desc]) => (
                    <tr key={event}><td className="px-4 py-2.5">{event}</td><td className="px-4 py-2.5 font-sans">{desc}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm">
              <strong className="text-blue-400">Discover installed plugins:</strong>
              <p className="text-muted-foreground mt-1 text-xs"><IC>GET /api/plugins</IC> — returns all registered plugins with their manifest, version, and enabled status.</p>
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
  "webpUrl": "${baseUrl}/uploads/1712345678-abc123.webp",
  "mimetype": "image/jpeg",
  "width": 1920,
  "height": 1080
}`} />

            <h3 className="font-semibold mb-3 mt-6">Media Folders</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Organise your uploads into folders. Folders support nesting — create sub-folders
              under any parent. The folder tree is shown in the left sidebar on the Media page.
              Deleting a folder unfiles its media (files stay, just move to root); sub-folders are
              deleted recursively.
            </p>
            <div className="rounded-xl border border-border overflow-hidden text-sm mb-4">
              <Endpoint method="GET"    path="/api/media/folders"            desc="List all folders (flat list — build tree from parentId)" auth />
              <Endpoint method="POST"   path="/api/media/folders"            desc="Create a folder — body: { name, parentId? }" auth />
              <Endpoint method="DELETE" path="/api/media/folders/:id"        desc="Delete a folder (cascades to sub-folders; files become unfiled)" auth />
              <Endpoint method="PUT"    path="/api/media/:filename/folder"   desc="Move a file into a folder — body: { folderId } (null = root)" auth />
              <Endpoint method="GET"    path="/api/media?folderId=:id"       desc="List files in a specific folder — use folderId=null for unfiled files" />
            </div>
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

            <h3 className="font-semibold mb-3 mt-6">Per-key rate limiting</h3>
            <p className="text-muted-foreground text-sm mb-3">
              Every API key request is tracked with a fixed 60-second window. Limits by access level:
            </p>
            <div className="space-y-2 mb-4">
              {[
                ['read', '120 req / min'],
                ['write', '60 req / min'],
                ['all', '120 req / min'],
              ].map(([access, limit]) => (
                <div key={access} className="flex gap-3 text-sm">
                  <IC>{access}</IC>
                  <span className="text-muted-foreground">{limit}</span>
                </div>
              ))}
            </div>
            <p className="text-muted-foreground text-sm mb-2">
              Every API-key response includes these headers:
            </p>
            <CodeBlock code={`X-RateLimit-Limit: 120       # max requests in this window
X-RateLimit-Remaining: 119  # requests left
X-RateLimit-Reset: 60       # seconds until window resets

# When exceeded — HTTP 429:
{ "statusCode": 429, "message": "API key rate limit exceeded. Try again in 60 seconds." }`} />
            <p className="text-muted-foreground text-sm mt-3">
              JWT-authenticated admin requests are <strong className="text-foreground">not</strong> subject to per-key limits —
              only <IC>X-API-Key</IC> requests count. The global IP-based throttle (120 req/min) still applies to all traffic.
            </p>
          </Section>

          {/* ── Forms ─────────────────────────────────────────────────────── */}
          <Section id="forms" title="Forms" icon={ClipboardList}>
            <p className="text-muted-foreground leading-relaxed mb-4">
              The Forms module lets you build dynamic contact forms from the admin panel and collect
              submissions from any website, app, or platform — no backend code required.
              Submissions are stored in the database and can trigger <strong className="text-foreground">email notifications</strong> or{' '}
              <strong className="text-foreground">webhook calls</strong> automatically.
            </p>

            {/* How it works */}
            <div className="rounded-xl border border-border p-5 mb-6 bg-muted/20 space-y-3">
              <h4 className="font-semibold text-sm">How it works</h4>
              <div className="space-y-2 text-sm text-muted-foreground">
                {[
                  ['1. Create a form', 'Go to Forms → New Form. Give it a name, a URL-safe slug, and add your fields.'],
                  ['2. Configure actions', 'Optionally add an Email action (sends a notification on each submission) or a Webhook action (POSTs data to any URL).'],
                  ['3. Call the submit API', 'Call POST /api/submit/:slug from any platform — React, React Native, curl, or any HTTP client.'],
                  ['4. View submissions', 'Every submission is stored. Open Forms → click the submission count → expand any row to see full details.'],
                ].map(([step, desc]) => (
                  <div key={step} className="flex gap-3">
                    <span className="font-medium text-foreground w-44 shrink-0">{step}</span>
                    <span>{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Form field types */}
            <h3 className="font-semibold mb-3">Form Field Types</h3>
            <p className="text-muted-foreground text-sm mb-3">
              All fields are validated server-side on submission. Required fields return a clear error message if missing.
            </p>
            <div className="rounded-xl border border-border overflow-hidden mb-8">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {FORM_FIELD_TYPES.map(({ type, label, color, desc }) => (
                    <tr key={type}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={cn('inline-flex px-2 py-0.5 rounded text-xs font-medium', color)}>{label}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs leading-relaxed">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Actions */}
            <h3 className="font-semibold mb-3">Actions</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              <div className="rounded-xl border border-border p-4">
                <p className="text-sm font-semibold mb-1 text-blue-400">Email Action</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Sends an email on every submission. Set the recipient address and subject.
                  Use <IC>{'{{field_name}}'}</IC> in the subject to insert submitted values.
                  Optionally set a Reply-To field (e.g. the user's email field) so you can reply directly.
                </p>
              </div>
              <div className="rounded-xl border border-border p-4">
                <p className="text-sm font-semibold mb-1 text-purple-400">Webhook Action</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  POSTs the submission data as JSON to any URL — Slack, Zapier, Make, your own server.
                  Body format: <IC>{'{ "data": { ...fields } }'}</IC>. Supports POST or PUT method.
                </p>
              </div>
            </div>

            {/* Spam protection */}
            <h3 className="font-semibold mb-3">Spam Protection</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Every form submission endpoint has three layers of spam protection built in. They stack — you can use all three at once.
            </p>
            <div className="space-y-4 mb-6">
              <div className="rounded-xl border border-border p-4">
                <p className="text-sm font-semibold mb-1">1 — Rate limiting <span className="text-xs font-normal text-muted-foreground ml-1">(always on)</span></p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  20 submissions per minute per IP. Returns HTTP 429 when exceeded. No configuration needed.
                </p>
              </div>
              <div className="rounded-xl border border-border p-4">
                <p className="text-sm font-semibold mb-1">2 — Honeypot <span className="text-xs font-normal text-muted-foreground ml-1">(always on, zero friction)</span></p>
                <p className="text-xs text-muted-foreground leading-relaxed mb-2">
                  Add a hidden <IC>_honey</IC> field to your HTML form (hidden via CSS — never visible to real users).
                  If the field is filled in, the submission is silently accepted but never saved and no actions fire.
                  Bots that auto-fill every field are caught without any user friction.
                </p>
                <CodeBlock code={`<!-- Add to your HTML form — hidden with CSS -->
<input type="text" name="_honey" style="display:none" tabindex="-1" autocomplete="off" />`} />
              </div>
              <div className="rounded-xl border border-border p-4">
                <p className="text-sm font-semibold mb-1">3 — Captcha <span className="text-xs font-normal text-muted-foreground ml-1">(opt-in per form)</span></p>
                <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                  Supports <strong className="text-foreground">Cloudflare Turnstile</strong> (recommended — no user puzzle),{' '}
                  <strong className="text-foreground">hCaptcha</strong>, and <strong className="text-foreground">Google reCAPTCHA v2/v3</strong>.
                  Set up in two steps:
                </p>
                <div className="space-y-2 text-xs text-muted-foreground mb-3">
                  {[
                    ['Step 1 — backend/.env', 'Set CAPTCHA_PROVIDER=turnstile and CAPTCHA_SECRET_KEY=your_server_secret'],
                    ['Step 2 — create/update form', 'Set captchaEnabled=true on the form via the API or admin panel'],
                    ['Step 3 — frontend', 'Render the captcha widget and pass the token as captchaToken in the submit body'],
                  ].map(([step, desc]) => (
                    <div key={step} className="flex gap-3">
                      <span className="font-medium text-foreground w-44 shrink-0">{step}</span>
                      <span>{desc}</span>
                    </div>
                  ))}
                </div>
                <CodeBlock code={`# backend/.env
CAPTCHA_PROVIDER=turnstile
CAPTCHA_SECRET_KEY=0x4AAAAAAA...your_secret_here

# Submit body — include captchaToken alongside your form data
POST /api/submit/contact-us
{
  "data":         { "full_name": "Jane", "email": "jane@example.com" },
  "captchaToken": "XXXX.DUMMY.TOKEN.from.widget"
}`} />
              </div>
            </div>

            {/* Submit API */}
            <h3 className="font-semibold mb-3">Submit a form (public API)</h3>
            <p className="text-muted-foreground text-sm mb-3">
              No authentication required. The slug is the one you set when creating the form.
            </p>
            <CodeBlock code={`POST /api/submit/{slug}
Content-Type: application/json

{
  "data": {
    "full_name": "Jane Doe",
    "email": "jane@example.com",
    "message": "Hello!"
  }
}

// Success response
{
  "success": true,
  "submissionId": 42,
  "message": "Your submission has been received."
}

// Validation error response (400)
{
  "message": "Validation failed",
  "errors": ["Email Address is required", "Message is required"]
}`} />

            {/* Multi-platform */}
            <h3 className="font-semibold mb-3 mt-6">Submit from any platform</h3>
            <CodeTabs codes={{
              cURL: `curl -X POST ${baseUrl}/api/submit/contact-us \\
  -H "Content-Type: application/json" \\
  -d '{
    "data": {
      "full_name": "Jane Doe",
      "email": "jane@example.com",
      "subject": "Support",
      "message": "Hello, I need help."
    }
  }'`,
              JavaScript: `const res = await fetch('${baseUrl}/api/submit/contact-us', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    data: {
      full_name: 'Jane Doe',
      email: 'jane@example.com',
      subject: 'Support',
      message: 'Hello, I need help.',
    },
  }),
});

const result = await res.json();

if (!res.ok) {
  // result.errors = ['Field is required', ...]
  console.error(result.errors);
} else {
  console.log('Submitted! ID:', result.submissionId);
}`,
              React: `import { useState } from 'react';

export default function ContactForm() {
  const [status, setStatus] = useState('idle');

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('loading');
    const form = new FormData(e.target);

    const res = await fetch('${baseUrl}/api/submit/contact-us', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: Object.fromEntries(form) }),
    });

    setStatus(res.ok ? 'done' : 'error');
  }

  if (status === 'done') return <p>Thank you!</p>;

  return (
    <form onSubmit={handleSubmit}>
      <input name="full_name" placeholder="Name"    required />
      <input name="email"     type="email"           required />
      <textarea name="message"                       required />
      <button type="submit" disabled={status === 'loading'}>
        {status === 'loading' ? 'Sending…' : 'Send'}
      </button>
    </form>
  );
}`,
              Python: `import requests

response = requests.post(
    '${baseUrl}/api/submit/contact-us',
    json={
        'data': {
            'full_name': 'Jane Doe',
            'email': 'jane@example.com',
            'message': 'Hello from Python!',
        }
    }
)

result = response.json()
if response.ok:
    print('Submitted! ID:', result['submissionId'])
else:
    print('Errors:', result.get('errors'))`,
              PHP: `<?php
$payload = json_encode([
    'data' => [
        'full_name' => 'Jane Doe',
        'email'     => 'jane@example.com',
        'message'   => 'Hello from PHP!',
    ]
]);

$ctx = stream_context_create([
    'http' => [
        'method'  => 'POST',
        'header'  => 'Content-Type: application/json',
        'content' => $payload,
    ]
]);

$result = json_decode(
    file_get_contents('${baseUrl}/api/submit/contact-us', false, $ctx),
    true
);
echo $result['submissionId'];`,
            }} />

            {/* Slug tip */}
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 mt-6 text-sm">
              <strong className="text-amber-400">Slug normalization</strong>
              <p className="text-muted-foreground mt-1">
                Form slugs are lowercased and hyphen-separated — "Contact Us" becomes <IC>contact-us</IC>.
                The submit endpoint is always <IC>POST /api/submit/{'{slug}'}</IC>.
              </p>
            </div>
          </Section>

          {/* ── Webhooks ──────────────────────────────────────────────────── */}
          <Section id="webhooks" title="Webhooks" icon={Webhook}>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Webhooks let external systems react in real time when content changes in NodePress.
              Register a URL and NodePress will POST a JSON payload to it on every matching event.
            </p>

            <h3 className="font-semibold mb-3">Events</h3>
            <div className="rounded-xl border border-border overflow-hidden mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Event</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[
                    ['entry.created',  'A new entry is created'],
                    ['entry.updated',  'An entry is updated or a version is restored'],
                    ['entry.deleted',  'An entry is soft-deleted (moved to trash)'],
                    ['entry.restored', 'A trashed entry is restored'],
                    ['entry.purged',   'An entry is permanently deleted'],
                    ['media.uploaded', 'A file is uploaded to the media library'],
                    ['media.deleted',  'A file is deleted from the media library'],
                    ['*',              'Wildcard — fires for every event'],
                  ].map(([event, when]) => (
                    <tr key={event}>
                      <td className="px-4 py-2.5"><IC>{event}</IC></td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">{when}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="font-semibold mb-3">Payload shape</h3>
            <CodeBlock code={`// Example: entry.created
{
  "event": "entry.created",
  "timestamp": "2026-03-24T10:00:00.000Z",
  "data": {
    "id": 42,
    "slug": "my-first-post",
    "status": "published",
    "contentType": "blog"
  }
}`} />

            <h3 className="font-semibold mb-3 mt-2">HMAC-SHA256 signing</h3>
            <p className="text-muted-foreground text-sm mb-3">
              Set a <strong className="text-foreground">secret</strong> on your webhook and NodePress will
              sign every delivery. Verify it on your server to ensure the request is genuine:
            </p>
            <CodeBlock code={`// Verify in Node.js
const crypto = require('crypto');

function verifySignature(body, secret, signatureHeader) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signatureHeader),
  );
}`} />

            <h3 className="font-semibold mb-3 mt-4">Retry queue</h3>
            <p className="text-muted-foreground text-sm mb-3">
              Failed deliveries are retried automatically with exponential backoff — up to 3 attempts total.
            </p>
            <div className="space-y-2 mb-4">
              {[
                ['Attempt 1', 'Immediately when the event fires.'],
                ['Attempt 2', '5 minutes after the first failure.'],
                ['Attempt 3', '30 minutes after the second failure.'],
              ].map(([attempt, desc]) => (
                <div key={attempt} className="flex gap-3 text-sm">
                  <span className="font-medium text-foreground w-24 shrink-0">{attempt}</span>
                  <span className="text-muted-foreground">{desc}</span>
                </div>
              ))}
            </div>
            <p className="text-muted-foreground text-sm mb-4">
              View the full delivery log — event name, HTTP status, error message, attempt count, and next retry time — at{' '}
              <strong className="text-foreground">Webhooks → Delivery Log</strong> in the admin panel.
            </p>

            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 mt-4 text-sm">
              <strong className="text-amber-400">Delivery notes</strong>
              <ul className="text-muted-foreground mt-1 space-y-1 list-disc pl-4">
                <li>Timeout per delivery: 10 seconds.</li>
                <li>After 3 failed attempts the delivery is marked <IC>failed</IC> and will not be retried again.</li>
                <li>Use the <strong className="text-foreground">Test Ping</strong> button in the admin panel to verify your endpoint is reachable.</li>
              </ul>
            </div>
          </Section>

          {/* ── SEO & Sitemap ─────────────────────────────────────────────── */}
          <Section id="seo" title="SEO & Sitemap" icon={Globe}>
            <p className="text-muted-foreground leading-relaxed mb-4">
              NodePress generates a <IC>sitemap.xml</IC> and <IC>robots.txt</IC> automatically.
              Both are served at <IC>/api/sitemap.xml</IC> and <IC>/api/robots.txt</IC>.
            </p>

            <h3 className="font-semibold mb-3">Sitemap</h3>
            <p className="text-muted-foreground text-sm mb-3">
              The sitemap includes all <IC>published</IC> entries across all content types, plus
              one list-page URL per content type. Set <IC>SITE_URL</IC> in <IC>backend/.env</IC> to
              control the domain used in the URLs.
            </p>
            <CodeBlock code={`# Fetch the sitemap
GET /api/sitemap.xml

# Response (XML)
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://your-site.com/blog</loc>
    <lastmod>2026-03-24</lastmod>
  </url>
  <url>
    <loc>https://your-site.com/blog/my-first-post</loc>
    <lastmod>2026-03-24</lastmod>
  </url>
</urlset>`} />

            <h3 className="font-semibold mb-3 mt-4">robots.txt</h3>
            <p className="text-muted-foreground text-sm mb-2">
              Default output allows all crawlers and links to the sitemap. Set{' '}
              <IC>ROBOTS_DISALLOW</IC> in <IC>backend/.env</IC> to block specific paths:
            </p>
            <CodeBlock code={`# backend/.env
ROBOTS_DISALLOW=/admin,/api/private

# Output at /api/robots.txt
User-agent: *
Disallow: /admin
Disallow: /api/private
Sitemap: https://your-site.com/api/sitemap.xml`} />

            <h3 className="font-semibold mb-3 mt-4">Per-entry SEO meta tags</h3>
            <p className="text-muted-foreground text-sm mb-2">
              The built-in public pages (at <IC>/[type]/[slug]</IC>) use Next.js{' '}
              <IC>generateMetadata()</IC> to output full OG + Twitter card tags from the entry's
              SEO fields. No extra configuration needed.
            </p>

            <h3 className="font-semibold mb-3 mt-4">Health check</h3>
            <p className="text-muted-foreground text-sm">
              <IC>GET /api/health</IC> returns database connectivity status. Useful for uptime
              monitors and Docker health checks. No auth required.
            </p>
          </Section>

          {/* ── Self-hosting ───────────────────────────────────────────────── */}
          <Section id="self-hosting" title="Self-Hosting" icon={Server}>
            <p className="text-muted-foreground leading-relaxed mb-4">
              NodePress ships with a production-ready <IC>docker-compose.prod.yml</IC> that runs
              the full stack behind nginx.
            </p>

            <h3 className="font-semibold mb-3">Environment variables (backend/.env)</h3>
            <div className="rounded-xl border border-border overflow-hidden mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Variable</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-xs">
                  {[
                    ['DATABASE_URL',         'PostgreSQL connection string — pooled URL for the app (e.g. Neon pooled, PgBouncer)'],
                    ['DIRECT_URL',           'Direct (non-pooled) PostgreSQL URL — required by Prisma migrations. If not using a pooler, set to the same value as DATABASE_URL.'],
                    ['JWT_SECRET',           '64+ char random secret for signing tokens (auto-generated by CLI)'],
                    ['JWT_EXPIRES_IN',       'Access token lifetime — default 7d. Refresh tokens last 30 days (HttpOnly cookie, rotated on use).'],
                    ['PORT',                 'API port (default 3000)'],
                    ['CORS_ORIGIN',          'Frontend origin allowed in CORS headers'],
                    ['APP_URL',              'Backend URL — used in API responses'],
                    ['SITE_URL',             'Public-facing website URL — used in sitemap.xml'],
                    ['ROBOTS_DISALLOW',      'Comma-separated paths to block in robots.txt (optional)'],
                    ['STORAGE_DRIVER',       'local (default) or s3'],
                    ['STORAGE_S3_BUCKET',    'S3/R2/MinIO bucket name (if STORAGE_DRIVER=s3)'],
                    ['STORAGE_S3_REGION',    'AWS region or "auto" for Cloudflare R2'],
                    ['STORAGE_S3_ENDPOINT',  'Custom endpoint URL for R2/MinIO/Backblaze'],
                    ['SMTP_HOST',            'SMTP server hostname — enables password reset and team invitation emails'],
                    ['SMTP_PORT',            'SMTP port (default 587)'],
                    ['SMTP_USER',            'SMTP username'],
                    ['SMTP_PASS',            'SMTP password'],
                    ['SMTP_FROM',            'From address for outgoing emails'],
                    ['REDIS_URL',            'Redis connection URL (optional). Enables shared cache across instances.'],
                    ['METRICS_TOKEN',        'Bearer token to protect GET /api/metrics (optional but recommended in production)'],
                    ['CAPTCHA_PROVIDER',     'Captcha provider for form spam protection: turnstile | hcaptcha | recaptcha (optional)'],
                    ['CAPTCHA_SECRET_KEY',   'Server-side secret from your captcha provider dashboard (required when CAPTCHA_PROVIDER is set)'],
                    ['AUDIT_LOG_RETENTION_DAYS', 'How many days to keep audit log entries before pruning — default 90 (optional)'],
                    ['SENTRY_DSN',           'Sentry DSN for backend error tracking (optional)'],
                  ].map(([key, desc]) => (
                    <tr key={key}>
                      <td className="px-4 py-2.5"><IC>{key}</IC></td>
                      <td className="px-4 py-2.5 text-muted-foreground">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="font-semibold mb-3 mt-6">Environment variables (frontend/.env.local)</h3>
            <div className="rounded-xl border border-border overflow-hidden mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Variable</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-xs">
                  {[
                    ['BACKEND_URL',              'Backend URL used by Next.js server components (e.g. http://backend:3000 in Docker, http://localhost:3000 locally)'],
                    ['NEXT_PUBLIC_SENTRY_DSN',   'Sentry DSN for frontend error tracking — enables Session Replay and client-side error capture (optional)'],
                  ].map(([key, desc]) => (
                    <tr key={key}>
                      <td className="px-4 py-2.5"><IC>{key}</IC></td>
                      <td className="px-4 py-2.5 text-muted-foreground">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="font-semibold mb-3">Cloud media storage (S3-compatible)</h3>
            <p className="text-muted-foreground text-sm mb-3">
              Set <IC>STORAGE_DRIVER=s3</IC> to store uploads in AWS S3, Cloudflare R2, MinIO, or
              Backblaze B2. Files are served from the bucket's public URL or a CDN domain.
            </p>
            <CodeBlock code={`# Cloudflare R2 example
STORAGE_DRIVER=s3
STORAGE_S3_BUCKET=my-bucket
STORAGE_S3_REGION=auto
STORAGE_S3_ACCESS_KEY=xxx
STORAGE_S3_SECRET_KEY=xxx
STORAGE_S3_ENDPOINT=https://xxx.r2.cloudflarestorage.com
STORAGE_S3_PUBLIC_URL=https://assets.yourdomain.com`} />

            <h3 className="font-semibold mb-3 mt-4">Image optimization</h3>
            <p className="text-muted-foreground text-sm">
              Uploaded images are automatically resized to a max dimension of 2400 px, EXIF-rotated,
              and saved at JPEG quality 85. A <IC>.webp</IC> sibling is generated at quality 82 and
              stored alongside the original. Both URLs are returned in the media API response.
            </p>
          </Section>

          {/* ── Observability ─────────────────────────────────────────────── */}
          <Section id="observability" title="Observability" icon={Activity}>
            <p className="text-muted-foreground leading-relaxed mb-4">
              NodePress exposes a Prometheus-compatible metrics endpoint and ships with a
              pre-configured Grafana dashboard in the production Docker Compose stack.
            </p>

            <h3 className="font-semibold mb-3">Metrics endpoint</h3>
            <p className="text-muted-foreground text-sm mb-2">
              <IC>GET /api/metrics</IC> returns all metrics in Prometheus text format.
              No auth required by default; set <IC>METRICS_TOKEN</IC> in your env to protect it.
              In production the endpoint is only reachable from the internal Docker network
              (Prometheus scrapes it directly — nginx blocks external access).
            </p>
            <div className="rounded-xl border border-border overflow-hidden mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Metric</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Type</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-xs">
                  {[
                    ['http_requests_total',               'Counter',   'Total HTTP requests, labelled by method, path, status'],
                    ['http_request_duration_seconds',      'Histogram', 'Request duration (p50/p95/p99 derivable), labelled by method, path, status'],
                    ['nodepress_nodejs_heap_size_used_bytes', 'Gauge',  'Node.js heap memory in use'],
                    ['nodepress_nodejs_eventloop_lag_seconds', 'Gauge', 'Event loop lag — high values indicate CPU saturation'],
                    ['nodepress_nodejs_gc_duration_seconds', 'Histogram', 'Garbage collector pause durations by kind'],
                    ['nodepress_process_cpu_seconds_total', 'Counter',  'CPU time consumed by the Node.js process'],
                  ].map(([name, type, desc]) => (
                    <tr key={name}>
                      <td className="px-4 py-2.5"><IC>{name}</IC></td>
                      <td className="px-4 py-2.5 text-muted-foreground">{type}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="font-semibold mb-3">Starting the monitoring stack</h3>
            <p className="text-muted-foreground text-sm mb-2">
              Prometheus and Grafana are included in <IC>docker-compose.prod.yml</IC>.
              They start automatically with the rest of the stack.
            </p>
            <CodeBlock code={`# Start everything (including Prometheus + Grafana)
docker-compose -f docker-compose.prod.yml up -d

# Grafana UI  → http://localhost/grafana  (default: admin / changeme)
# Prometheus  → internal only (port 9090 not exposed externally)

# Set credentials via env:
# GRAFANA_USER=admin
# GRAFANA_PASSWORD=your_secure_password`} />

            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 mt-4 text-sm">
              <strong className="text-blue-400">Pre-built dashboard</strong>
              <p className="text-muted-foreground mt-1">
                The <strong className="text-foreground">NodePress Overview</strong> dashboard is auto-provisioned in Grafana.
                It shows request rate, error rate, P99 latency, heap usage, and event-loop lag — all updating every 30 s.
              </p>
            </div>

            <h3 className="font-semibold mb-3 mt-6">Structured logging</h3>
            <p className="text-muted-foreground text-sm mb-2">
              Every HTTP request is logged as structured JSON (via <IC>nestjs-pino</IC>).
              Logs include <IC>method</IC>, <IC>url</IC>, <IC>statusCode</IC>, <IC>responseTime</IC>,
              and a unique <IC>x-request-id</IC> header for request correlation.
              In development, logs are pretty-printed with colours. In production they are
              pure JSON — pipe to Loki, Datadog, CloudWatch, or any log aggregator.
            </p>
            <CodeBlock code={`# Production log line (JSON)
{
  "level": 30,
  "time": 1711280000000,
  "req": { "id": "mn4mq447-5y1q2l", "method": "GET", "url": "/api/blog" },
  "res": { "statusCode": 200 },
  "responseTime": 12,
  "msg": "request completed"
}

# Set log level via env:
LOG_LEVEL=info   # trace | debug | info | warn | error | fatal`} />
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

            <h3 className="font-semibold mb-3 mt-6">Token lifecycle</h3>
            <p className="text-muted-foreground text-sm mb-3">
              Login returns a <strong className="text-foreground">JWT access token (7 days)</strong> and
              sets an <IC>HttpOnly SameSite=Strict</IC> refresh cookie valid for <strong className="text-foreground">30 days</strong>.
              The admin frontend silently calls <IC>POST /api/auth/refresh</IC> when a 401 is received,
              obtains a new access token, and retries the original request — completely transparent to the user.
              After 30 days, or after calling <IC>POST /api/auth/logout</IC>, the user must log in again.
            </p>

            <h3 className="font-semibold mb-3 mt-6">Password reset &amp; team invitations</h3>
            <p className="text-muted-foreground text-sm mb-3">
              If SMTP is configured, <IC>POST /api/auth/forgot-password</IC> emails a 15-minute reset link.
              In development without SMTP, the reset URL is returned in the API response (<IC>devResetUrl</IC>) and
              displayed directly in the forgot-password UI — no terminal digging required.
              In production without SMTP, the link is silently skipped (configure SMTP before going live).
              The reset link points to <IC>/reset-password?token=…</IC> in the admin panel.
              Always returns <IC>200</IC> — never reveals whether an email exists.
            </p>
            <p className="text-muted-foreground text-sm mb-2">
              <strong>Configuring SMTP</strong> — choose any free provider:
            </p>
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-1.5 pr-4 font-medium text-muted-foreground">Provider</th>
                    <th className="text-left py-1.5 pr-4 font-medium text-muted-foreground">Free tier</th>
                    <th className="text-left py-1.5 pr-4 font-medium text-muted-foreground">SMTP_HOST</th>
                    <th className="text-left py-1.5 pr-4 font-medium text-muted-foreground">SMTP_USER</th>
                    <th className="text-left py-1.5 font-medium text-muted-foreground">Get credentials</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b border-border/50">
                    <td className="py-1.5 pr-4 font-medium text-foreground">Gmail</td>
                    <td className="py-1.5 pr-4">Unlimited</td>
                    <td className="py-1.5 pr-4"><IC>smtp.gmail.com</IC></td>
                    <td className="py-1.5 pr-4">your Gmail address</td>
                    <td className="py-1.5"><a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">App Passwords ↗</a></td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-1.5 pr-4 font-medium text-foreground">Resend</td>
                    <td className="py-1.5 pr-4">100/day</td>
                    <td className="py-1.5 pr-4"><IC>smtp.resend.com</IC></td>
                    <td className="py-1.5 pr-4"><IC>resend</IC></td>
                    <td className="py-1.5"><a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">API Keys ↗</a></td>
                  </tr>
                  <tr>
                    <td className="py-1.5 pr-4 font-medium text-foreground">SendGrid</td>
                    <td className="py-1.5 pr-4">100/day</td>
                    <td className="py-1.5 pr-4"><IC>smtp.sendgrid.net</IC></td>
                    <td className="py-1.5 pr-4"><IC>apikey</IC></td>
                    <td className="py-1.5"><a href="https://app.sendgrid.com/settings/api_keys" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">API Keys ↗</a></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-muted-foreground text-sm mb-3">
              Admins can also invite team members via <IC>POST /api/users/:id/invite</IC> — sends a
              "Set Your Password" email reusing the same reset-token flow. The invite button is also
              available on each user row in the Users admin page. Silently no-ops when SMTP is not configured.
            </p>

            <h3 className="font-semibold mb-3 mt-6">Dynamic content API</h3>
            <p className="text-muted-foreground text-sm mb-3">
              Every content type you create automatically gets these 5 endpoints.
              Replace <IC>{'{type}'}</IC> with your content type name (e.g. <IC>blog</IC>, <IC>product</IC>).
            </p>
            <div className="rounded-xl border border-border overflow-hidden mb-6">
              <Endpoint method="GET"    path="/api/{type}"               desc="List entries — ?page, ?limit (max 100), ?sort=createdAt:desc, ?search=term, ?filter[field]=value, ?fields=title,slug (projection), ?populate=author,author.company (dot-notation nested, up to 3 levels). ETag + Cache-Control: public, max-age=30." />
              <Endpoint method="GET"    path="/api/{type}/{slug}"        desc="Get a single entry — ?fields=title,slug, ?populate=author,author.company (dot-notation nested). ETag + Cache-Control: public, max-age=30." />
              <Endpoint method="GET"    path="/api/{type}/{slug}/preview" desc="Preview any entry (draft/archived) using a signed token — ?token=<token>. Token generated by POST /api/entries/:id/preview-url." />
              <Endpoint method="POST"   path="/api/{type}"               desc="Create a new entry" auth />
              <Endpoint method="PUT"    path="/api/{type}/{slug}"        desc="Update an existing entry" auth />
              <Endpoint method="DELETE" path="/api/{type}/{slug}"        desc="Delete an entry (soft delete)" auth />
            </div>

            <h3 className="font-semibold mb-3">Auth</h3>
            <div className="rounded-xl border border-border overflow-hidden mb-6">
              <Endpoint method="GET"    path="/api/auth/setup-status"          desc="Check if initial setup is required" />
              <Endpoint method="POST"   path="/api/auth/register"              desc="Create first admin account (setup only)" />
              <Endpoint method="POST"   path="/api/auth/login"                 desc="Login — returns JWT access token (7d) + sets HttpOnly refresh cookie (30d)" />
              <Endpoint method="POST"   path="/api/auth/refresh"               desc="Exchange refresh cookie for a new access token (silent — no user prompt)" />
              <Endpoint method="POST"   path="/api/auth/logout"                desc="Revoke refresh token and clear the cookie" auth />
              <Endpoint method="GET"    path="/api/auth/me"                    desc="Get current user" auth />
              <Endpoint method="POST"   path="/api/auth/forgot-password"       desc="Request a password reset email (always 200)" />
              <Endpoint method="POST"   path="/api/auth/reset-password"        desc="Set a new password using the reset token" />
            </div>

            <h3 className="font-semibold mb-3">Content Types</h3>
            <div className="rounded-xl border border-border overflow-hidden mb-6">
              <Endpoint method="GET"    path="/api/content-types"              desc="List all content types" auth />
              <Endpoint method="POST"   path="/api/content-types"              desc="Create a content type" auth />
              <Endpoint method="PUT"    path="/api/content-types/:id"          desc="Update a content type" auth />
              <Endpoint method="DELETE" path="/api/content-types/:id"          desc="Delete a content type and all its entries" auth />
            </div>

            <h3 className="font-semibold mb-3">Entries (Admin)</h3>
            <div className="rounded-xl border border-border overflow-hidden mb-6">
              <Endpoint method="GET"    path="/api/entries"                    desc="List entries — ?contentTypeId, ?status, ?deleted, ?search, ?page, ?limit" auth />
              <Endpoint method="POST"   path="/api/entries"                    desc="Create an entry" auth />
              <Endpoint method="GET"    path="/api/entries/:id"                desc="Get a single entry by id" auth />
              <Endpoint method="PUT"    path="/api/entries/:id"                desc="Update an entry (snapshots a version)" auth />
              <Endpoint method="DELETE" path="/api/entries/:id"                desc="Soft-delete — moves to trash" auth />
              <Endpoint method="POST"   path="/api/entries/:id/restore"        desc="Restore a trashed entry" auth />
              <Endpoint method="DELETE" path="/api/entries/:id/purge"          desc="Permanently delete a trashed entry" auth />
              <Endpoint method="GET"    path="/api/entries/:id/versions"              desc="List all version snapshots for an entry" auth />
              <Endpoint method="POST"   path="/api/entries/:id/versions/:vid/restore" desc="Restore entry to a specific version" auth />
              <Endpoint method="POST"   path="/api/entries/:id/preview-url"           desc="Generate a 1-hour signed preview token for any entry status (draft, archived, published)" auth />
              <Endpoint method="GET"    path="/api/entries/export?contentTypeId=X"    desc="Export all entries as a JSON array (for backup or migration)" auth />
              <Endpoint method="POST"   path="/api/entries/import"                    desc="Import entries from a JSON array — upserts by slug+locale. Body: { contentTypeId, entries[] }" auth />
              <Endpoint method="POST"   path="/api/entries/bulk-publish"              desc="Bulk publish entries — body: { ids: number[] }" auth />
              <Endpoint method="POST"   path="/api/entries/bulk-archive"              desc="Bulk archive entries — body: { ids: number[] }" auth />
              <Endpoint method="POST"   path="/api/entries/bulk-pending-review"       desc="Bulk submit entries for review — body: { ids: number[] }" auth />
              <Endpoint method="POST"   path="/api/entries/bulk-delete"               desc="Bulk soft-delete entries — body: { ids: number[] }" auth />
            </div>

            <h3 className="font-semibold mb-3">Media</h3>
            <div className="rounded-xl border border-border overflow-hidden mb-6">
              <Endpoint method="GET"    path="/api/media"                      desc="List media files — ?page, ?limit, ?folderId (null=unfiled)" />
              <Endpoint method="POST"   path="/api/media/upload"               desc="Upload a file (multipart/form-data)" auth />
              <Endpoint method="DELETE" path="/api/media/:filename"            desc="Delete a file" auth />
              <Endpoint method="GET"    path="/api/media/folders"              desc="List all media folders (flat list)" auth />
              <Endpoint method="POST"   path="/api/media/folders"              desc="Create a folder — body: { name, parentId? }" auth />
              <Endpoint method="DELETE" path="/api/media/folders/:id"          desc="Delete a folder (cascades sub-folders; files become unfiled)" auth />
              <Endpoint method="PUT"    path="/api/media/:filename/folder"     desc="Move file to folder — body: { folderId } (null = root)" auth />
            </div>

            <h3 className="font-semibold mb-3">Webhooks</h3>
            <div className="rounded-xl border border-border overflow-hidden mb-6">
              <Endpoint method="GET"    path="/api/webhooks"                   desc="List webhooks" auth />
              <Endpoint method="POST"   path="/api/webhooks"                   desc="Create a webhook" auth />
              <Endpoint method="DELETE" path="/api/webhooks/:id"               desc="Delete a webhook" auth />
              <Endpoint method="PATCH"  path="/api/webhooks/:id/toggle"        desc="Enable or disable a webhook" auth />
              <Endpoint method="POST"   path="/api/webhooks/:id/ping"          desc="Send a test ping to the webhook URL" auth />
              <Endpoint method="GET"    path="/api/webhooks/deliveries"        desc="List delivery log — ?page, ?limit (25 per page)" auth />
            </div>

            <h3 className="font-semibold mb-3">API Keys</h3>
            <div className="rounded-xl border border-border overflow-hidden mb-6">
              <Endpoint method="GET"    path="/api/api-keys"                   desc="List API keys" auth />
              <Endpoint method="POST"   path="/api/api-keys"                   desc="Create an API key" auth />
              <Endpoint method="DELETE" path="/api/api-keys/:id"               desc="Delete an API key" auth />
            </div>

            <h3 className="font-semibold mb-3">Users</h3>
            <div className="rounded-xl border border-border overflow-hidden mb-6">
              <Endpoint method="GET"    path="/api/users"                      desc="List all users — admin only" auth />
              <Endpoint method="POST"   path="/api/users"                      desc="Create a new user — admin only" auth />
              <Endpoint method="PUT"    path="/api/users/:id/role"             desc="Change a user's role — admin only" auth />
              <Endpoint method="DELETE" path="/api/users/:id"                  desc="Delete a user — cannot delete self or last admin" auth />
              <Endpoint method="POST"   path="/api/users/:id/invite"           desc="Send a 'Set Your Password' invitation email — admin only (no-op if SMTP not configured)" auth />
              <Endpoint method="PUT"    path="/api/users/me/password"          desc="Change your own password (requires current password)" auth />
            </div>

            <h3 className="font-semibold mb-3">Audit Log</h3>
            <div className="rounded-xl border border-border overflow-hidden mb-6">
              <Endpoint method="GET"    path="/api/audit-log"                  desc="List audit events — ?resource, ?page, ?limit (admin only)" auth />
            </div>

            <h3 className="font-semibold mb-3">SEO, Health & Observability</h3>
            <div className="rounded-xl border border-border overflow-hidden mb-6">
              <Endpoint method="GET"    path="/api/health"                     desc="Database health check — no auth required" />
              <Endpoint method="GET"    path="/api/sitemap.xml"                desc="Auto-generated sitemap of all published entries" />
              <Endpoint method="GET"    path="/api/robots.txt"                 desc="robots.txt with configurable disallow rules" />
              <Endpoint method="GET"    path="/api/metrics"                    desc="Prometheus metrics (text/plain). Protected by METRICS_TOKEN if set." />
            </div>

            <h3 className="font-semibold mb-3">Forms API</h3>
            <div className="rounded-xl border border-border overflow-hidden mb-6">
              <Endpoint method="POST"   path="/api/submit/:slug"               desc="Submit a form (public — no auth)" />
              <Endpoint method="GET"    path="/api/forms"                      desc="List all forms with submission counts — ?page, ?limit" auth />
              <Endpoint method="POST"   path="/api/forms"                      desc="Create a form" auth />
              <Endpoint method="GET"    path="/api/forms/:id"                  desc="Get a single form" auth />
              <Endpoint method="PUT"    path="/api/forms/:id"                  desc="Update a form" auth />
              <Endpoint method="DELETE" path="/api/forms/:id"                  desc="Delete a form and all its submissions" auth />
              <Endpoint method="GET"    path="/api/forms/:id/submissions"      desc="List all submissions for a form — ?page, ?limit" auth />
              <Endpoint method="GET"    path="/api/forms/submissions/recent"   desc="Last 6 submissions across all forms (dashboard)" auth />
            </div>

            <h3 className="font-semibold mb-3">Response format</h3>
            <CodeBlock code={`// GET /api/blog — paginated list
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "slug": "my-first-post",
      "data": {
        "title": "My First Post",
        "content": "<p>Hello world</p>",
        "thumbnail": "/uploads/photo.jpg"
      },
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "meta": {
    "total": 42,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}

// GET /api/blog/my-first-post — single entry
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "slug": "my-first-post",
  "data": { ... },
  "createdAt": "...",
  "updatedAt": "..."
}

// Query params for list endpoint:
// ?page=2&limit=10&sort=createdAt:desc
// ?search=hello           (full-text search on slug + all fields)
// ?filter[category]=tech  (exact field match)`} />

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
            <span>Copyright &copy; 2026-present Karthik Paulraj / BuildWithKode. &mdash; <a href="https://github.com/buildwithkode/nodepress/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">MIT License</a></span>
            <div className="flex items-center gap-4">
              <a href="https://ko-fi.com/buildwithkode" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">☕ Support on Ko-fi</a>
              <Link href="/" className="flex items-center gap-1 hover:text-foreground transition-colors">
                Back to Admin <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
