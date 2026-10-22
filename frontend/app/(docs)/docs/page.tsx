'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import Link from 'next/link';
import { Copy, Check, BookOpen, Zap, Database, Key, Image as ImageIcon, Code2, ChevronRight, ExternalLink, Box, Layers, ClipboardList, Terminal, Globe, Webhook, History, Trash2, Server, Activity, Link2, Languages, Radio, Puzzle, ShieldCheck, Palette, Boxes, ListOrdered, Eye, Upload, ArrowRightLeft, FileCode, GitBranch, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import hljs from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';
import javascript from 'highlight.js/lib/languages/javascript';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import python from 'highlight.js/lib/languages/python';
import php from 'highlight.js/lib/languages/php';
import 'highlight.js/styles/atom-one-dark.css';

// Register only the languages our snippets use (keeps the bundle small).
// Auto-detection runs across this subset.
const HLJS_LANGS = ['typescript', 'javascript', 'bash', 'json', 'xml', 'python', 'php'];
[['typescript', typescript], ['javascript', javascript], ['bash', bash], ['json', json], ['xml', xml], ['python', python], ['php', php]]
  .forEach(([name, lang]) => hljs.registerLanguage(name as string, lang as any));

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
  // Syntax-highlight via highlight.js (auto-detect across the registered subset).
  // Atom One Dark token colours apply to the .hljs-* spans; the container keeps
  // its dark background so it matches the rest of the docs.
  const trimmed = code.trim();
  const highlighted = useMemo(
    () => hljs.highlightAuto(trimmed, HLJS_LANGS).value,
    [trimmed],
  );
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
        <code dangerouslySetInnerHTML={{ __html: highlighted }} />
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
  { type: 'select',   label: 'Select',         color: 'bg-yellow-500/10 text-yellow-400',desc: 'One value from a list of choices — typed in (options.choices) or taken from a shared choice list (options.choiceList). Entries store the value; the admin shows the label.', example: '"tech"' },
  { type: 'image',    label: 'Image URL',      color: 'bg-pink-500/10 text-pink-400',    desc: 'A URL string pointing to an image (from Media Library or external).', example: '"/uploads/photo.jpg"' },
  { type: 'color',    label: 'Color',          color: 'bg-rose-500/10 text-rose-400',    desc: 'Hex color value picked from a color-swatch widget.',              example: '"#ff6b35"' },
  { type: 'date',     label: 'Date',           color: 'bg-teal-500/10 text-teal-400',    desc: 'Calendar date (no time). Stored as ISO 8601 date string.',        example: '"2024-12-25"' },
  { type: 'datetime', label: 'Date & Time',    color: 'bg-sky-500/10 text-sky-400',      desc: 'Full timestamp with time. Stored as ISO 8601 datetime string.',   example: '"2024-12-25T10:30:00.000Z"' },
  { type: 'json',     label: 'JSON',           color: 'bg-amber-500/10 text-amber-400',  desc: 'Arbitrary JSON object or array. Edited via a monospace textarea with live parse.', example: '{"key":"value","tags":["a","b"]}' },
  { type: 'repeater', label: 'Repeater',       color: 'bg-red-500/10 text-red-400',      desc: 'A list of items, each sharing the same sub-fields. Set options.component to reuse a component\'s fields.', example: '[{"name":"Alice","role":"Dev"}]' },
  { type: 'flexible', label: 'Flexible',       color: 'bg-indigo-500/10 text-indigo-400',desc: 'A list of blocks where each block can be a different layout.',    example: '[{"_layout":"hero","heading":"Welcome"}]' },
  { type: 'group',    label: 'Group',          color: 'bg-violet-500/10 text-violet-400',desc: 'A single nested object with fixed sub-fields. Good for SEO metadata, address, social links. Set options.component to reuse a component\'s fields.', example: '{"title":"My Post","description":"..."}' },
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
  { id: 'components',     label: 'Components' },
  { id: 'choice-lists',   label: 'Choice Lists' },
  { id: 'schema-changes', label: 'Schema Changes & Migrations' },
  { id: 'entries',        label: 'Entries & Slugs' },
  { id: 'i18n',           label: 'i18n / Multi-locale' },
  { id: 'relations',      label: 'Content Relations' },
  { id: 'graphql',        label: 'GraphQL API' },
  { id: 'openapi',        label: 'OpenAPI & Swagger' },
  { id: 'realtime',       label: 'Real-time (WebSocket)' },
  { id: 'roles',          label: 'Roles & Permissions' },
  { id: 'brand',          label: 'Brand & Theme' },
  { id: 'plugins',        label: 'Plugin System' },
  { id: 'media',          label: 'Media Library' },
  { id: 'api-keys',       label: 'API Keys' },
  { id: 'forms',          label: 'Forms' },
  { id: 'webhooks',       label: 'Webhooks' },
  { id: 'seo',            label: 'SEO & Sitemap' },
  { id: 'redirects',      label: 'Redirects' },
  { id: 'client',         label: 'JS / TS Client' },
  { id: 'live-preview',   label: 'Live Preview' },
  { id: 'starters',       label: 'Framework Starters' },
  { id: 'schema-cli',     label: 'Schema as Code (CLI)' },
  { id: 'releases',       label: 'Content Releases' },
  { id: 'templates',      label: 'Starter Templates' },
  { id: 'wordpress-import', label: 'WordPress Import' },
  { id: 'ai',             label: 'AI Assistant & MCP' },
  { id: 'search',         label: 'Search Engine' },
  { id: 'email-storage',  label: 'Email & Storage' },
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
            <a
              href="https://nodepress.buildwithkode.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 group"
            >
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-primary-foreground text-xs font-extrabold">N</span>
              </div>
              <span className="font-semibold text-sm group-hover:text-primary transition-colors">NodePress</span>
            </a>
            <span className="text-muted-foreground/40">/</span>
            <span className="text-muted-foreground text-sm">Documentation</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm text-primary hover:underline flex items-center gap-1">
              Admin Panel <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
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
              {['v1.7 (next)', 'Self-hosted', 'REST API', 'GraphQL', 'Real-time', 'i18n', 'MIT License'].map((t) => (
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
                <p className="text-xs text-muted-foreground mt-1">Using Docker? Add the <IC>--docker</IC> flag (<IC>npx create-nodepress-app my-project --docker</IC>) to include <IC>docker-compose.yml</IC>, the nginx/monitoring configs, and the <IC>docker:*</IC> scripts. Without it, the project is set up for local PostgreSQL.</p>
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
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm">
                  <strong className="text-emerald-400">Using Supabase or another hosted PostgreSQL?</strong>
                  <p className="text-muted-foreground mt-1 text-xs">
                    No code changes needed. In Supabase open <strong className="text-foreground">Connect</strong> and take <em>two different</em> strings — which one goes where matters. The <strong className="text-foreground">Transaction pooler</strong> (port 6543) handles runtime queries; the <strong className="text-foreground">Session pooler</strong> (port 5432) is for migrations, because DDL cannot run through a transaction pooler.
                  </p>
                  <CodeBlock code={`DATABASE_URL="postgresql://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres"`} />
                  <ul className="list-disc list-inside text-muted-foreground text-xs mt-2 space-y-1">
                    <li>
                      Do <strong className="text-foreground">not</strong> use the &quot;Direct connection&quot; string (<IC>{'db.<ref>.supabase.co'}</IC>). It is IPv6-only unless you have the IPv4 add-on, so on most networks it fails with <IC>P1001: Can&apos;t reach database server</IC> — which looks like an outage but is really an unroutable address. Check with <IC>{'dig +short A db.<ref>.supabase.co'}</IC>; no output means IPv6-only.
                    </li>
                    <li>
                      Keep <IC>?pgbouncer=true&amp;connection_limit=1</IC> on <IC>DATABASE_URL</IC>, or Prisma intermittently throws <IC>prepared statement &quot;s0&quot; already exists</IC> under load.
                    </li>
                    <li>
                      Percent-encode special characters in the password (<IC>@</IC> becomes <IC>%40</IC>) or the URL will not parse.
                    </li>
                  </ul>
                  <p className="text-muted-foreground mt-2 text-xs">
                    Steps 3 and 4 (installing PostgreSQL locally) can be skipped entirely — there is no local database to start after a reboot.
                  </p>
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
                  Run this from your project root. It creates all the tables NodePress needs. You only run this once.
                </p>
                <CodeBlock code={`cd my-project
npm run migrate`} />
                <p className="text-xs text-muted-foreground">
                  Using a cloud database (Neon, Supabase, Railway)? Use <IC>migrate deploy</IC> instead: <IC>cd backend && npx prisma migrate deploy</IC>
                </p>
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">
                  <strong>Getting an authentication error?</strong> The password in <IC>DATABASE_URL</IC> doesn't match your PostgreSQL password. Go back to Step 5 and double-check it.
                </div>
              </div>
            </div>

            {/* Step 7 — Start everything */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">7</div>
                <h3 className="font-semibold text-foreground">Start the dev server</h3>
              </div>
              <div className="ml-10 space-y-3">
                <p className="text-sm text-muted-foreground">Run this from your project root — it starts both backend and frontend together in one terminal:</p>
                <CodeBlock code={`cd my-project
npm run dev`} />
                <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                  <p><span className="text-green-400 font-medium">Backend API</span> → <IC>http://localhost:3000</IC></p>
                  <p><span className="text-blue-400 font-medium">Admin panel</span> → <IC>http://localhost:5173</IC></p>
                </div>
                <p className="text-xs text-muted-foreground">Need to run them separately? Use <IC>npm run dev:backend</IC> and <IC>npm run dev:frontend</IC> in two terminal windows.</p>
              </div>
            </div>

            {/* Root scripts */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-7 h-7 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-sm font-bold shrink-0">⚡</div>
                <h3 className="font-semibold text-foreground">Root scripts (shortcut)</h3>
              </div>
              <div className="ml-10">
                <p className="text-sm text-muted-foreground mb-3">
                  The root <IC>package.json</IC> has convenience scripts so you can run everything from the project root without <IC>cd</IC>-ing into subdirectories. The <IC>docker:*</IC> scripts are only generated when you scaffold with <IC>--docker</IC>:
                </p>
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">Script</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">What it does</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {[
                        ['npm run dev',          'Start both backend and frontend together in one terminal'],
                        ['npm run dev:backend',  'Start backend dev server only (port 3000)'],
                        ['npm run dev:frontend', 'Start frontend dev server only (port 5173)'],
                        ['npm run build',        'Build both backend and frontend for production'],
                        ['npm run migrate',      'Run Prisma migrations (prisma migrate dev)'],
                        ['npm run studio',       'Open Prisma Studio — visual database browser'],
                        ['npm run install:all',  'Install all dependencies (backend + frontend) — alias for npm install via workspaces'],
                        ['npm run docker:dev',   'Start Docker dev stack (docker-compose up)'],
                        ['npm run docker:prod',  'Start Docker production stack with build'],
                        ['npm run docker:down',  'Stop all Docker containers'],
                      ].map(([script, desc]) => (
                        <tr key={script}>
                          <td className="px-4 py-2"><IC>{script}</IC></td>
                          <td className="px-4 py-2 text-muted-foreground">{desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
                For each field, choose a name and a type. Whatever you type is kept as the field's
                human <strong className="text-foreground">label</strong> (shown on the entry form and
                list columns), while the <strong className="text-foreground">field key</strong> used in
                the API is automatically derived in <IC>snake_case</IC> — so "Article Footer" displays
                as <em>Article Footer</em> but becomes <IC>article_footer</IC> in the API output. The
                field key is shown live under each field as you type.
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
                ['Edit', 'Change the name or add/remove/reorder fields at any time. Renaming, retyping or removing fields that already hold data opens a confirm dialog that previews the impact and can migrate the data (see Schema Changes & Migrations).'],
                ['Duplicate', 'Copy the schema to a new content type. Useful for similar structures.'],
                ['Export JSON', 'Download the schema as a JSON file to back it up or share it. The file includes the components and choice lists the exported types use (or all of them for a full export), plus each type\'s Preview URL.'],
                ['Import JSON', 'Restore or import a schema from a previously exported file (on the New page). Components and choice lists are written first; the result reports components and choiceLists { created, updated, skipped } next to the content types.'],
                ['Delete', 'Permanently removes the content type AND all its entries.'],
              ].map(([action, desc]) => (
                <div key={action} className="flex gap-3 text-sm">
                  <span className="font-medium text-foreground w-24 shrink-0">{action}</span>
                  <span className="text-muted-foreground">{desc}</span>
                </div>
              ))}
            </div>

            <h3 className="font-semibold mb-2">Preview URL</h3>
            <p className="text-muted-foreground text-sm mb-2">
              Each content type can have a <strong className="text-foreground">Preview URL</strong> — the page on your website that
              shows one entry. It is an <IC>http(s)</IC> template with the placeholders <IC>{'{slug}'}</IC>, <IC>{'{locale}'}</IC> and{' '}
              <IC>{'{token}'}</IC> (a signed 1-hour preview token), up to 2,048 characters; placeholders aren&apos;t allowed in the host.
              It powers the entry editor&apos;s <strong className="text-foreground">Live</strong> pane (see Live Preview) and the automatic
              redirect path when a slug changes, and it is included in schema export/import.
            </p>
            <CodeBlock code={`https://www.example.com/blog/{slug}?preview={token}
https://www.example.com/{locale}/docs/{slug}`} />

            <h3 className="font-semibold mb-2 mt-5">Export / import without a login</h3>
            <p className="text-muted-foreground text-sm mb-6">
              <IC>GET /api/content-types/export</IC> and <IC>POST /api/content-types/import</IC> accept either a JWT
              (export: admin or editor; import: admin) or an <IC>X-API-Key</IC> with <IC>all</IC> access to every content type
              (<IC>contentTypes: ["*"]</IC>). Any other key gets <IC>403</IC>. Imports made with a key are written to the audit log
              as <IC>api-key:&lt;name&gt;</IC>. This is what the <IC>schema:*</IC> CLI commands use.
            </p>

            <h3 className="font-semibold mb-3">Reserved names (cannot be used)</h3>
            <div className="flex flex-wrap gap-2">
              {['auth', 'media', 'entries', 'content-types', 'uploads', 'components', 'roles', 'redirects', 'import', 'choice-lists'].map((n) => (
                <IC key={n}>{n}</IC>
              ))}
            </div>
          </Section>

          {/* ── Field Types ───────────────────────────────────────────────── */}
          <Section id="field-types" title="Field Types" icon={Box}>
            <p className="text-muted-foreground mb-6">
              NodePress supports 15 field types. Each field name is normalized to{' '}
              <IC>snake_case</IC> in the API response. Any field can also carry a <IC>condition</IC> (see
              Conditional fields below), <IC>group</IC> / <IC>repeater</IC> fields and flexible layouts can take their fields from a
              reusable component, and a <IC>select</IC> field can take its choices from a shared{' '}
              <a href="#choice-lists" className="text-primary hover:underline">choice list</a>.
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

            <h3 className="font-semibold mb-3 mt-6">Group — example schema & output</h3>
            <p className="text-muted-foreground text-sm mb-2">A fixed set of sub-fields stored as a single nested object. Unlike repeater, there is no list — just one object. Perfect for SEO metadata, address blocks, or social links.</p>
            <CodeBlock code={`// Schema definition
{
  "name": "seo",
  "type": "group",
  "subFields": [
    { "name": "title",       "type": "text" },
    { "name": "description", "type": "textarea" },
    { "name": "og_image",    "type": "image" }
  ]
}

// API output — a single nested object, not an array
"seo": {
  "title": "My Post",
  "description": "A short summary of my post.",
  "og_image": "/uploads/og-cover.jpg"
}`} />

            <h3 className="font-semibold mb-3 mt-6">Relation — example schema & output</h3>
            <p className="text-muted-foreground text-sm mb-2">Links entries across content types using their <IC>publicId</IC> UUID. Use <IC>?populate=fieldName</IC> to inline the full related entry instead of just the UUID.</p>
            <CodeBlock code={`// Schema definition
{
  "name": "author",
  "type": "relation",
  "options": {
    "relatedContentType": "team",
    "cardinality": "one"
  }
}

// Default API output — returns the publicId UUID
"author": "a1b2c3d4-e5f6-4abc-8def-000000000001"

// With ?populate=author — returns the full entry inline
"author": {
  "slug": "jane-doe",
  "data": { "name": "Jane Doe", "role": "Editor" }
}

// cardinality: "many" — array of UUIDs or populated entries
"tags": ["uuid-1", "uuid-2"]`} />

            <h3 className="font-semibold mb-3 mt-8">Indexed fields</h3>
            <p className="text-muted-foreground mb-4">
              Tick <strong className="text-foreground">Indexed</strong> on a field in the content type builder (or send{' '}
              <IC>"indexed": true</IC> in the schema) to give it a database index. Filters on that field —{' '}
              <IC>?where[category][eq]=news</IC>, <IC>gt</IC>/<IC>lt</IC> ranges and so on — then stay fast with
              hundreds of thousands of entries instead of scanning every one. Available on top-level text, textarea,
              number, boolean, select, date, datetime, color and relation fields. The index is built in the
              background when you save the schema (writes are never blocked) and dropped when you untick it. Each
              index adds a little work to every save, so index the fields you actually filter on.
            </p>
            <CodeBlock code={`{
  "name": "category",
  "type": "select",
  "indexed": true,
  "options": { "choices": ["news", "guides"] }
}

// Uses the index:
GET /api/blog?where[category][eq]=news`} />

            <h3 className="font-semibold mb-3 mt-8">Conditional fields</h3>
            <p className="text-muted-foreground mb-3">
              Use <strong className="text-foreground">Show only if…</strong> in the content type editor (or send a <IC>condition</IC> in
              the schema) to show a field only when a sibling field matches — for example a <IC>video_url</IC> that appears only
              when <IC>media_type</IC> is <IC>video</IC>. Siblings are the fields on the same level: top-level fields, or the fields
              of the same repeater row, group or flexible block.
            </p>
            <CodeBlock code={`{
  "name": "video_url",
  "type": "text",
  "required": true,
  "condition": { "field": "media_type", "op": "eq", "value": "video" }
}

// op: eq | ne        → value is a string, number or boolean
//     in | notIn     → value is an array of them
//     set | notSet   → no value (is the field filled in?)
// Multi-select fields match when any chosen value matches.`} />
            <ul className="text-muted-foreground text-sm space-y-1.5 list-disc pl-4 mt-3">
              <li>A hidden field is never required — <IC>required: true</IC> only applies while it is shown, in the admin and in the API.</li>
              <li>Conditions chain: a field whose condition field is hidden is hidden too.</li>
              <li>Hiding is a form behaviour, not access control — use field <IC>readRoles</IC> / <IC>writeRoles</IC> to protect data.</li>
            </ul>
          </Section>

          {/* ── Components ────────────────────────────────────────────────── */}
          <Section id="components" title="Reusable Components" icon={Boxes}>
            <p className="text-muted-foreground leading-relaxed mb-4">
              A component is a named set of simple fields — an SEO block, a call-to-action, a person&apos;s details — defined once under{' '}
              <strong className="text-foreground">Content → Components</strong> (<IC>/components</IC>) and reused in any content type.
              In the content type editor, click <strong className="text-foreground">Add component</strong> and pick how to use it.
              There are four ways:
            </p>
            <div className="rounded-xl border border-border overflow-hidden mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Use</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">What you get</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Entry data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-muted-foreground text-xs">
                  <tr><td className="px-4 py-2.5 font-medium text-foreground whitespace-nowrap">One</td><td className="px-4 py-2.5">A <IC>group</IC> field with <IC>options.component</IC> — one nested object.</td><td className="px-4 py-2.5 hidden md:table-cell font-mono">{'"seo": { "meta_title": "…" }'}</td></tr>
                  <tr><td className="px-4 py-2.5 font-medium text-foreground whitespace-nowrap">Many</td><td className="px-4 py-2.5">A <IC>repeater</IC> field with <IC>options.component</IC> — a list of items.</td><td className="px-4 py-2.5 hidden md:table-cell font-mono">{'"links": [{ "label": "…", "url": "…" }]'}</td></tr>
                  <tr><td className="px-4 py-2.5 font-medium text-foreground whitespace-nowrap">Inline</td><td className="px-4 py-2.5">The component&apos;s fields go straight into the content type, at the top level, with no wrapper object.</td><td className="px-4 py-2.5 hidden md:table-cell font-mono">{'"gender": "male"'}</td></tr>
                  <tr><td className="px-4 py-2.5 font-medium text-foreground whitespace-nowrap">Flexible layout</td><td className="px-4 py-2.5">A layout of a <IC>flexible</IC> field whose fields come from the component.</td><td className="px-4 py-2.5 hidden md:table-cell font-mono">{'"body": [{ "_layout": "cta", … }]'}</td></tr>
                </tbody>
              </table>
            </div>
            <CodeBlock code={`// Component "seo"
{ "name": "seo", "displayName": "SEO",
  "fields": [{ "name": "meta_title", "type": "text" }, { "name": "meta_description", "type": "textarea" }] }

// One — a group field
{ "name": "seo", "type": "group", "options": { "component": "seo" } }

// Many — a repeater field
{ "name": "links", "type": "repeater", "options": { "component": "link" } }

// Inline — the component's fields sit at the top level, each tagged with the component
{ "name": "full_name", "type": "text",   "component": "person_details" }
{ "name": "gender",    "type": "select", "component": "person_details", "options": { "choiceList": "gender" } }

// Flexible layout — name and label default to the component's
{ "name": "body", "type": "flexible",
  "options": { "layouts": [{ "component": "cta" }, { "name": "text", "label": "Text", "fields": [ … ] }] } }`} />
            <ul className="text-muted-foreground text-sm space-y-1.5 list-disc pl-4 mt-3 mb-4">
              <li>On every save the server copies the component&apos;s fields into the content type (the sub-fields of a group or repeater, the fields of a layout, or the inline fields), so the API output is exactly that of ordinary fields. Never edit those copies — edit the component.</li>
              <li><strong className="text-foreground">Inline</strong> keeps entry data flat: a content type that uses a <IC>person_details</IC> component inline stores <IC>{'{ "full_name": "Ada", "gender": "male" }'}</IC>, not a nested object. A content type can use a component inline only once, and its field names must not clash with the content type&apos;s other fields (a clash is a <IC>400</IC>). In the editor the inline fields show as one read-only <strong className="text-foreground">From component</strong> block that moves as a unit when you reorder.</li>
              <li><strong className="text-foreground">Flexible layouts</strong>: in a flexible field, click <strong className="text-foreground">Add layout from component</strong>. You can mix component layouts with layouts you define by hand.</li>
              <li>Editing a component updates every content type that uses it, in all four ways (each gets a schema version). The response lists <IC>updatedContentTypes</IC> and any <IC>propagationErrors</IC>.</li>
              <li>Renaming a component field moves the data too: <IC>PUT /api/components/:id</IC> accepts <IC>fieldMigrations</IC> with component field names (<IC>{'{ "renames": [{ "from": "title", "to": "heading" }] }'}</IC>). They are applied as <IC>&lt;field&gt;.&lt;name&gt;</IC> for a group or repeater, <IC>&lt;name&gt;</IC> for an inline use and <IC>&lt;field&gt;.&lt;layout&gt;.&lt;name&gt;</IC> for a flexible layout. The Components page sends renames automatically; retyped or removed component fields keep their data.</li>
              <li>Components hold simple fields only (no repeater, flexible, group or reverse relations). An unknown component name is a <IC>400</IC>; deleting one that is in use is a <IC>409</IC>.</li>
              <li><IC>GET /api/components/:id</IC> returns <IC>usage[]</IC> — each content type and field using it, with its type (<IC>group</IC>, <IC>repeater</IC>, <IC>inline</IC> or <IC>layout</IC>).</li>
              <li>Schema export includes the components the exported types use, and import creates them first.</li>
            </ul>
            <div className="rounded-xl border border-border overflow-hidden">
              <Endpoint method="GET"    path="/api/components"     desc="List components (any signed-in user)" auth />
              <Endpoint method="GET"    path="/api/components/:id" desc="One component with usage[] — the content types and fields using it, and how (group, repeater, inline, layout)" auth />
              <Endpoint method="POST"   path="/api/components"     desc="Create — body: { name, displayName?, description?, fields } — admin only" auth />
              <Endpoint method="PUT"    path="/api/components/:id" desc="Update and propagate to every content type using it — optional fieldMigrations; returns updatedContentTypes, propagationErrors — admin only" auth />
              <Endpoint method="DELETE" path="/api/components/:id" desc="Delete — 409 while any content type uses it — admin only" auth />
            </div>
          </Section>

          {/* ── Choice lists ──────────────────────────────────────────────── */}
          <Section id="choice-lists" title="Choice Lists" icon={ListOrdered}>
            <p className="text-muted-foreground leading-relaxed mb-4">
              A choice list is a shared set of options for <IC>select</IC> fields — gender, country, department — kept in one place so
              every content type offers the same choices. Manage them under{' '}
              <strong className="text-foreground">Settings → Choice lists</strong> (<IC>/choice-lists</IC>, admin only). Each choice has a{' '}
              <IC>value</IC> (what entries store) and an optional <IC>label</IC> (what editors see).
            </p>
            <p className="text-muted-foreground leading-relaxed mb-4">
              A select field gets its choices one of two ways: typed in on the field (<IC>options.choices</IC>), or from a list
              (<IC>{'options: { "choiceList": "gender" }'}</IC>). Example — a <strong className="text-foreground">Gender</strong> list used by
              several content types:
            </p>
            <CodeBlock code={`// Settings → Choice lists → "Gender"
{ "name": "gender", "label": "Gender",
  "choices": [{ "value": "male", "label": "Male" }, { "value": "female", "label": "Female" }, { "value": "other", "label": "Other" }] }

// A select field in any content type (or component)
{ "name": "gender", "type": "select", "options": { "choiceList": "gender" } }

// What the server saves on the field
{ "name": "gender", "type": "select",
  "options": { "choiceList": "gender",
               "choices": ["male", "female", "other"],
               "choiceLabels": { "male": "Male", "female": "Female", "other": "Other" } } }

// An entry stores the value
{ "gender": "male" }`} />
            <p className="text-muted-foreground leading-relaxed mt-3 mb-4">
              Put the field in a component used <a href="#components" className="text-primary hover:underline">inline</a> and every content
              type that includes it gets the same <IC>gender</IC> field at its top level — the entry still stores <IC>{'"gender": "male"'}</IC>.
            </p>
            <ul className="text-muted-foreground text-sm space-y-1.5 list-disc pl-4 mb-4">
              <li>On every save the server copies the list into the field: values into <IC>choices</IC>, and labels into <IC>choiceLabels</IC> (<IC>{'{ value: label }'}</IC>, only where the label differs from the value). This happens wherever a select can be — top-level fields, repeater and group sub-fields, flexible layout fields and components.</li>
              <li>In the list editor you can add choices one by one, paste several at once (one per line: <IC>Label</IC>, or <IC>value | Label</IC>) and drag to reorder.</li>
              <li>Editing a list updates every content type and component that uses it. If you remove values, the response reports how many entries still hold them (<IC>removedValuesInUse</IC>); those entries fail validation on their next save until someone picks a new value.</li>
              <li>A list that a field uses can&apos;t be deleted (<IC>409</IC>) — switch those fields to their own choices first.</li>
              <li>Up to 1,000 choices per list; values must be unique, non-empty and at most 200 characters.</li>
              <li>Schema export/import bundles and the <IC>schema:pull</IC> / <IC>schema:push</IC> CLI carry the choice lists too. <IC>choice-lists</IC> is a reserved content type name; changes are audited as <IC>choice_list</IC>.</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Building a form on your website? Read the same choices from the public endpoints — no token needed, cached for 60 seconds:
            </p>
            <CodeBlock code={`GET /api/choice-lists/gender
GET /api/choice-lists?names=gender,country     // up to 50 names

// → { "name": "gender", "label": "Gender",
//     "choices": [{ "value": "male", "label": "Male" }, …] }   (the ?names= form returns an array)`} />
            <div className="rounded-xl border border-border overflow-hidden mt-4">
              <Endpoint method="GET"    path="/api/choice-lists/:name"         desc="One list — { name, label, choices: [{ value, label? }] } — public, Cache-Control: public, max-age=60" />
              <Endpoint method="GET"    path="/api/choice-lists?names=a,b"     desc="Several lists by name (max 50) — public, max-age=60" />
              <Endpoint method="GET"    path="/api/choice-lists"               desc="Every list with its usage (content types, components, fields) — admin only" auth />
              <Endpoint method="POST"   path="/api/choice-lists"               desc="Create — body: { name, label, description?, choices: [{ value, label? }] } — admin only" auth />
              <Endpoint method="PUT"    path="/api/choice-lists/:id"           desc="Update and propagate — returns updatedContentTypes, updatedComponents, removedValues, removedValuesInUse, propagationErrors — admin only" auth />
              <Endpoint method="DELETE" path="/api/choice-lists/:id"           desc="Delete — 409 while a field uses it — admin only" auth />
            </div>
          </Section>

          {/* ── Schema changes ────────────────────────────────────────────── */}
          <Section id="schema-changes" title="Schema Changes & Data Migrations" icon={SlidersHorizontal}>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Entries keep all their values in one JSON column, so changing a schema doesn&apos;t move existing data by itself: a renamed
              field&apos;s values would stay under the old key and a retyped field would keep values of the old type. When you save a
              content type whose fields already hold data, the admin opens a <strong className="text-foreground">confirm dialog</strong>{' '}
              that lists what changes, how many entries each change touches and how many values a conversion would drop — and lets you
              choose to rename, convert or delete the data along with the schema.
            </p>
            <CodeBlock code={`# Preview — same body as PUT, changes nothing
POST /api/content-types/:id/schema-impact
→ { entryCount, diff, steps: [{ kind, field, from?, fromType?, toType?, container?, entries, lost }], retyped, removedNested, warnings }

# Apply the schema and migrate the data in one transaction
PUT /api/content-types/:id
{
  "schema": [ ... ],
  "fieldMigrations": {
    "renames": [
      { "from": "headline", "to": "title" },
      { "from": "seo.desc", "to": "seo.meta_description" }   // nested: same container
    ],
    "convert": ["price", "blocks.hero.heading"],   // new paths of retyped fields
    "drop":    ["legacy_notes", "seo.keywords"]    // removed fields whose values are deleted too
  }
}`} />
            <ul className="text-muted-foreground text-sm space-y-1.5 list-disc pl-4 mt-3">
              <li>A field is named by its path: <IC>title</IC> (top level), <IC>seo.meta_title</IC> (a group sub-field, or a repeater sub-field in every row) or <IC>blocks.hero.heading</IC> (a field of one flexible layout). Nested paths use the container&apos;s <em>new</em> name, and a rename must stay in the same group, repeater or layout.</li>
              <li>Steps run in order: top-level renames, nested renames, conversions (by the new path), then drops. The schema change and the data change commit together or not at all.</li>
              <li>The schema-impact preview also returns <IC>removedNested</IC> — fields removed from inside a group, repeater or layout that still exists — and the confirm dialog offers to drop their data. The editor tracks sub-field renames and sends them for you.</li>
              <li>Renaming a flexible <em>layout</em> is not migrated: rows saved with the old layout name keep it.</li>
              <li>Conversions: anything → <IC>json</IC>; text-like ↔ <IC>richtext</IC> (wrapped in <IC>&lt;p&gt;</IC> / HTML stripped); text, number, boolean → text or select; multi-select → first value; text → multi-select; text → <IC>number</IC> (numeric strings) and → <IC>boolean</IC> (true/yes/1/on, false/no/0/off). Values that can&apos;t be converted are removed — the preview counts them as <IC>lost</IC>.</li>
              <li>Reverse relation fields (<IC>mappedBy</IC>) on other types follow a renamed relation field.</li>
              <li>Old entry versions keep the shape they were saved with.</li>
            </ul>
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

            <h3 className="font-semibold mb-3">Publishing Pipeline &amp; Environments</h3>
            <div className="space-y-2 mb-6">
              {[
                ['draft',          'Draft state. Only visible within Admin Workspace.'],
                ['pending_review', 'Submitted for editorial review. Awaiting approval.'],
                ['staging',        'Deployed to Staging / QA Environment. Visible on preview websites and via ?stage=staging or X-NodePress-Environment: staging header.'],
                ['published',      'Live in Production. Default for public website and headless clients.'],
                ['archived',       'Hidden from public APIs and default admin views.'],
              ].map(([status, desc]) => (
                <div key={status} className="flex gap-3 text-sm">
                  <IC>{status}</IC>
                  <span className="text-muted-foreground">{desc}</span>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 mb-6">
              <h4 className="font-semibold text-sm text-purple-400 mb-2">Querying Staging Environments via API</h4>
              <p className="text-xs text-muted-foreground mb-3">
                Headless frontends (such as Staging / QA preview builds or Vercel preview branches) can query staging entries by passing <IC>?stage=staging</IC> or the <IC>X-NodePress-Environment: staging</IC> header.
                Any stage other than <IC>published</IC> returns unpublished content, so it needs credentials — an API key
                covering the content type (any access level) or a JWT — and the response is sent with{' '}
                <IC>Cache-Control: private, no-store</IC>. Without credentials the API answers <IC>401</IC>.
              </p>
              <CodeBlock code={`# 1. Using Query Parameter (returns staging + published entries)
curl -H "X-API-Key: np_..." http://localhost:4000/api/articles?stage=staging

# 2. Using Environment Header
curl -H "X-API-Key: np_..." -H "X-NodePress-Environment: staging" http://localhost:4000/api/articles/my-post

# 3. 1-Click Promotion Endpoints (Admin / Editor)
POST /api/entries/:id/promote   # Body: { "status": "staging" | "published" | "draft" }
POST /api/entries/bulk-stage    # Body: { "ids": [1, 2, 3] }
POST /api/entries/bulk-promote  # Body: { "ids": [1, 2, 3], "status": "published" }`} />
            </div>

            <h3 className="font-semibold mb-3">Scheduled publishing</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Set a <IC>publishAt</IC> date and time on any draft entry. A background job runs every
              minute and automatically promotes it to <IC>published</IC> when the time arrives.
              The field is shown on the entry edit page when status is <IC>draft</IC>.
            </p>

            <h3 className="font-semibold mb-3">SEO fields</h3>
            <p className="text-muted-foreground text-sm mb-2">
              Every entry has an optional SEO accordion on both the <strong>create and edit</strong> pages.
              The <IC>seo</IC> object is returned by the public API (<IC>GET /api/&#123;type&#125;/&#123;slug&#125;</IC>)
              and powers the public page's <IC>{`<head>`}</IC> meta tags via <IC>generateMetadata()</IC> in
              Next.js — title, description, Open Graph, Twitter card, a <IC>canonical</IC> link, and the
              robots directive.
            </p>
            <div className="space-y-2 mb-6">
              {[
                ['seo.title',       'Override the browser tab title and OG title.'],
                ['seo.description', 'Meta description and OG description (recommended 120–160 chars).'],
                ['seo.image',       'Open Graph image URL shown in link previews.'],
                ['seo.noIndex',     'Adds <meta name="robots" content="noindex, nofollow"> and excludes the entry from sitemap.xml.'],
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
                ['Copy URL',   'Copies the entry\'s public API URL (e.g. /api/article-page/my-post) to the clipboard — available to all roles.'],
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

            <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm mb-4">
              <strong className="text-foreground">Admin interface language.</strong>
              <p className="text-muted-foreground mt-1 text-xs">
                Separate from content languages: the admin panel itself is available in English, French, German, Spanish, Portuguese, Italian, Dutch,
                Japanese and Simplified Chinese. Each
                person picks theirs with the language switcher in the top bar (or on the sign-in page); the browser language is used
                until they do. Translations live in <IC>frontend/messages/&lt;locale&gt;/*.json</IC>; <IC>node scripts/check-i18n.js</IC>
                checks they stay complete.
              </p>
            </div>

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
GET /api/article/mon-article?locale=fr

# French if it exists, otherwise the default language (Content-Language says which)
GET /api/article/mon-article?locale=fr&fallback=true

# French articles, plus default-language articles not yet translated
GET /api/article?locale=fr&fallback=true

# No ?locale= → the default language
GET /api/article/mon-article`} />
            <p className="text-muted-foreground text-sm mt-2">
              Single-entry responses carry a <IC>Content-Language</IC> header with the locale that was served.
              Without <IC>fallback=true</IC>, a missing translation is a <IC>404</IC>. On a list, <IC>fallback=true</IC>{' '}
              returns one entry per slug — the translation when a published one exists, otherwise the default-language
              entry — and each entry&apos;s <IC>locale</IC> says which was served. Filters, search, sorting and paging
              apply to that merged list.
            </p>

            <h3 className="font-semibold mb-2 mt-5">Languages (Settings → Languages)</h3>
            <p className="text-muted-foreground text-sm mb-2">
              Admins choose which languages editors can write in and which one is the default. The editor&apos;s language
              switcher and &quot;Add translation&quot; menu, the entries list filter, and the translation chips on each entry
              row (filled = this entry, outlined = translated, dashed = missing) all follow this list. Upgrading enables
              every language your entries already use. <IC>GET /api/locales</IC> returns the list publicly (for building
              language switchers); <IC>PUT /api/locales</IC> changes it (admin).
            </p>
            <p className="text-muted-foreground text-sm mb-2">
              Locale codes are BCP 47 and stored in canonical form (<IC>pt-br</IC> → <IC>pt-BR</IC>). The API still
              accepts entries in a language that isn&apos;t enabled; a blank locale means <IC>en</IC>.
            </p>

            <div className="mt-5 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm">
              <strong className="text-blue-400">Unique constraint:</strong>
              <p className="text-muted-foreground mt-1 text-xs">
                The combination of <IC>contentTypeId + slug + locale</IC> must be unique.
                The same slug <IC>hello-world</IC> can exist in <IC>en</IC>, <IC>fr</IC>, and <IC>de</IC> simultaneously.
              </p>
            </div>

            <h3 className="font-semibold mb-2 mt-6">Side-by-Side Multilingual Translation Studio</h3>
            <p className="text-muted-foreground text-sm mb-3">
              NodePress includes a built-in comparative translation studio directly inside the Entry Editor.
            </p>
            <div className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground space-y-2 mb-4">
              <p><strong className="text-foreground">1. Dual-Pane View:</strong> Click <IC>🌐 Translate Workspace</IC> in the top header to split your screen into source reader and target translation form.</p>
              <p><strong className="text-foreground">2. Instant Reference Switching:</strong> Pick any enabled language as the reference (the default language when you&apos;re editing a translation) to read the original card-by-card while typing the localized version.</p>
              <p><strong className="text-foreground">3. 1-Click Field Scaffolding:</strong> Click <IC>📋 Copy Empty Fields from Reference</IC> to autofill blank fields from the base locale without losing existing translated values.</p>
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

            <h3 className="font-semibold mb-2 mt-5">Two-way relations (reverse fields)</h3>
            <p className="text-muted-foreground text-sm mb-2">
              A relation field with <IC>mappedBy</IC> is a <strong className="text-foreground">reverse field</strong>: it lists the entries of
              the related type whose relation points at this entry. Nothing is stored on this side — the forward field is the
              single source of truth, so the two can't drift. Pick <em>Reverse of</em> in the field's options (the forward field must
              already exist). Reverse fields are read-only (writing one is a 422), come back with <IC>?populate=</IC>, and return the
              newest 100 links per entry.
            </p>
            <CodeBlock code={`// author schema — "posts" lists the posts whose "author" is this author
{ "name": "posts", "type": "relation",
  "options": { "relatedContentType": "post", "cardinality": "many", "mappedBy": "author" } }

GET /api/author/jane?populate=posts            # Jane's published posts
GET /api/author?populate=posts,posts.tags       # nested through the reverse field`} />

            <h3 className="font-semibold mb-2 mt-5">Filtering by a related entry's fields</h3>
            <p className="text-muted-foreground text-sm mb-2">
              On a relation field, <IC>where</IC> can filter on the linked entry's own fields (one level deep). Up to 1,000 linked
              entries may match — narrow the filter beyond that.
            </p>
            <CodeBlock code={`GET /api/post?where[author][slug][eq]=jane
GET /api/post?where[author.name][eq]=Jane          # same, dot notation
GET /api/post?where[tags][label][in]=News,Guides   # many-relations: any linked entry matches
GET /api/post?where[author][eq]=<uuid>             # comparing the stored UUID still works`} />

            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm mt-4">
              <strong className="text-blue-400">Performance note.</strong>
              <p className="text-muted-foreground mt-1 text-xs">
                Each depth level makes one additional batched DB query — not N queries per relation. Caching is bypassed when <IC>?populate</IC> is used because the response shape varies per request.
                Public reads only populate <strong>published</strong> linked entries; the admin API includes drafts.
              </p>
            </div>

            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm mt-4">
              <strong className="text-amber-400">Field permissions apply to populated entries.</strong>
              <p className="text-muted-foreground mt-1 text-xs">
                A populated entry is filtered by the <em>related</em> content type&apos;s field <IC>readRoles</IC> for the caller, just
                like a direct read of that type, and its <IC>contentType</IC> is trimmed to <IC>{'{ id, name, displayName }'}</IC> —
                the related type&apos;s schema and settings are never included.
              </p>
            </div>
          </Section>

          {/* ── GraphQL ───────────────────────────────────────────────────── */}
          <Section id="graphql" title="GraphQL API" icon={Code2}>
            <p className="text-muted-foreground leading-relaxed mb-4">
              NodePress exposes a GraphQL endpoint at <IC>/graphql</IC> alongside the REST API.
              Use GraphQL when you need to fetch multiple resources in one round-trip or want strict typing.
            </p>

            <h3 className="font-semibold mb-2">Typed queries per content type</h3>
            <p className="text-muted-foreground text-sm mb-2">
              Every content type gets its own GraphQL types and two queries, named after it: <IC>blog_post</IC> →
              type <IC>BlogPost</IC> (fields under <IC>data</IC>), <IC>blogPost(slug, locale, fallback)</IC> and
              <IC>blogPosts(where, search, sort, page, limit, cursor, locale, fallback)</IC>. Relation fields resolve to the
              related type (reverse fields too), repeaters and groups are objects, flexible fields are unions per layout.
              Only published entries are served. The schema follows content type changes without a restart (other
              instances within <IC>GRAPHQL_SCHEMA_POLL_MS</IC>, default 10 s). A content type whose name would clash with a
              built-in type or query is left out, with a warning in the server log.
            </p>
            <CodeBlock code={`{
  blogPosts(locale: "fr", fallback: true, where: { featured: { eq: true } }, limit: 5) {
    data {
      slug
      locale                       # "en" where the French version was missing
      data {
        title
        cover { url alt }
        author { slug data { name } }
        blocks { __typename ... on BlogPostBlocksHero { heading } }
      }
    }
    meta { total nextCursor }
  }
}`} />

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
              Authenticated users (JWT Bearer token) see all statuses. Write mutations require <IC>editor</IC> or <IC>admin</IC> role,
              and entry mutations (<IC>createEntry</IC>, <IC>updateEntry</IC>, <IC>deleteEntry</IC>, <IC>restoreEntryVersion</IC>,{' '}
              <IC>bulk*</IC>) also check the role&apos;s per-content-type permissions exactly like REST — a denial is a{' '}
              <IC>Forbidden</IC> error listing <IC>forbiddenContentTypes</IC>. Admin entry queries and mutations apply the caller&apos;s
              field <IC>readRoles</IC> / <IC>writeRoles</IC>.
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

          {/* ── OpenAPI ───────────────────────────────────────────────────── */}
          <Section id="openapi" title="OpenAPI & Swagger UI" icon={FileCode}>
            <p className="text-muted-foreground leading-relaxed mb-4">
              <IC>GET /api/openapi.json</IC> returns a public <strong className="text-foreground">OpenAPI 3.1</strong> document generated
              from your content types — it changes as soon as a content type does. Browse and try it in{' '}
              <strong className="text-foreground">Swagger UI</strong> at <IC>/api/docs/content</IC> (the admin/management API stays at{' '}
              <IC>/api/docs</IC>).
            </p>
            <ul className="text-muted-foreground text-sm space-y-1.5 list-disc pl-4 mb-3">
              <li>Each content type gets list, get, create, update and delete operations — only the ones its <IC>allowedMethods</IC> expose.</li>
              <li>Per type there are <IC>&lt;Type&gt;</IC>, <IC>&lt;Type&gt;Data</IC>, <IC>&lt;Type&gt;List</IC>, <IC>&lt;Type&gt;Input</IC> and <IC>&lt;Type&gt;UpdateInput</IC> schemas.</li>
              <li>Fields with <IC>readRoles</IC> are left out of read schemas, fields with <IC>writeRoles</IC> out of the inputs — the document describes what an anonymous reader or an API key sees.</li>
              <li>Conditional fields are never in <IC>required</IC>; they carry <IC>x-nodepress-condition</IC> (the field&apos;s <IC>condition</IC>) and a description such as <em>&quot;Only used when `media_type` is &quot;video&quot; (then required).&quot;</em></li>
            </ul>
            <CodeBlock code={`# Typed fetch client
npx openapi-typescript https://cms.example.com/api/openapi.json -o nodepress-api.d.ts

# Or a full SDK in any language
npx @openapitools/openapi-generator-cli generate \\
  -i https://cms.example.com/api/openapi.json -g typescript-fetch -o ./sdk`} />
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
                  <tr><td className="px-4 py-2.5 font-mono text-xs">entry:presence</td><td className="px-4 py-2.5 font-mono text-xs">{'{ entryId, users: [{ id, email, role, joinedAt }] }'}</td></tr>
                  <tr><td className="px-4 py-2.5 font-mono text-xs">entry:lockAcquired</td><td className="px-4 py-2.5 font-mono text-xs">{'{ entryId, lock: { userId, email, role, expiresAt } }'}</td></tr>
                  <tr><td className="px-4 py-2.5 font-mono text-xs">entry:lockReleased</td><td className="px-4 py-2.5 font-mono text-xs">{'{ entryId, userId }'}</td></tr>
                  <tr><td className="px-4 py-2.5 font-mono text-xs">entry:lockTakeover</td><td className="px-4 py-2.5 font-mono text-xs">{'{ entryId, previousLock, newLock }'}</td></tr>
                  <tr><td className="px-4 py-2.5 font-mono text-xs">media:uploaded</td><td className="px-4 py-2.5 font-mono text-xs">{'{ id, filename, url, mimetype }'}</td></tr>
                  <tr><td className="px-4 py-2.5 font-mono text-xs">media:deleted</td><td className="px-4 py-2.5 font-mono text-xs">{'{ filename }'}</td></tr>
                </tbody>
              </table>
            </div>

            <h3 className="font-semibold mb-2">Collaborative Presence & Post Soft-Locking</h3>
            <p className="text-muted-foreground text-sm mb-3">
              NodePress includes real-time presence awareness and 60-second lease soft-locking to prevent simultaneous edit overwrites:
            </p>
            <div className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground space-y-2 mb-4">
              <p><strong className="text-foreground">🟢 Live Presence:</strong> Emitting <IC>entry:join</IC> puts the client in room <IC>entry:{'<'}id{'>'}</IC>. Active user count and avatars are broadcast via <IC>entry:presence</IC>.</p>
              <p><strong className="text-foreground">🔒 Soft-Locking:</strong> The first editor automatically acquires a renewable 60s lease (<IC>entry:requestLock</IC> + periodic <IC>entry:heartbeat</IC>). Other editors receive a conflict warning banner.</p>
              <p><strong className="text-foreground">⚡ Admin Override:</strong> Admins and editors can take over stale or urgent locks via <IC>entry:takeoverLock</IC>.</p>
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
              NodePress has four built-in roles, plus any custom roles you add. Access to admin routes is enforced server-side — the frontend role display is for UX only.
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

            <h3 className="font-semibold mb-2">Custom roles</h3>
            <p className="text-muted-foreground text-sm mb-2">
              Go to <strong className="text-foreground">Team → Roles</strong> (<IC>/users/roles</IC>, admin only) to add roles such as{' '}
              <IC>translator</IC> or <IC>marketing_editor</IC>. A custom role is based on <IC>editor</IC>, <IC>contributor</IC> or{' '}
              <IC>viewer</IC>: it gets that role&apos;s access to the admin, and its content permissions start as a copy of the base
              role&apos;s, which you then narrow per content type in the permissions matrix. The name is snake_case and can&apos;t be
              changed later; a role still assigned to users can&apos;t be deleted (<IC>409</IC> with <IC>userCount</IC>).
            </p>
            <ul className="text-muted-foreground text-sm space-y-1.5 list-disc pl-4 mb-4">
              <li>Assign custom roles like built-in ones when inviting or editing a user (<IC>POST/PUT /api/users</IC> accept their names).</li>
              <li><IC>/api/auth/me</IC> and login return <IC>role</IC> (the base role) and <IC>customRole</IC>.</li>
              <li>SSO: <IC>OIDC_ROLE_MAP</IC> may map provider groups to custom roles; <IC>OIDC_DEFAULT_ROLE</IC> must be a built-in role.</li>
              <li>Field-level <IC>readRoles</IC> / <IC>writeRoles</IC> may list custom role names as well as built-in ones; a rule matches the user&apos;s custom role <em>or</em> its base role, and admins always pass. The field matrix shows a column per custom role (a tick inherited from the base role is shown disabled).</li>
              <li>Changing a role&apos;s <IC>baseRole</IC> swaps its <IC>*</IC> permission row to the new base role&apos;s defaults — unless you customised that row, which is then kept and the response&apos;s <IC>warnings</IC> says so.</li>
            </ul>
            <CodeBlock code={`GET    /api/roles
POST   /api/roles          { "name": "translator", "label": "Translator", "baseRole": "contributor", "description": "…" }
PUT    /api/roles/:name    { "label": "…", "description": "…", "baseRole": "editor" }   # → role + warnings[]
DELETE /api/roles/:name`} />

            <h3 className="font-semibold mb-2 mt-5">Adding team members (invite-only)</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Go to <strong className="text-foreground">Users → Add User</strong> and enter just an{' '}
              <strong className="text-foreground">email + role</strong> — no password. NodePress creates the
              account and emails the person a secure link to <strong className="text-foreground">set their own password</strong>{' '}
              (valid 7 days); admins never see or set it. Use <strong className="text-foreground">Resend invite</strong> if
              the link expires. If no SMTP server is configured, the invite link is shown so you can copy and
              send it manually. (Requires <IC>SMTP_*</IC> in <IC>backend/.env</IC> to email automatically.)
            </p>

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

# Reset all permissions to defaults (custom roles keep existing — their * row
# goes back to their base role's defaults)
PUT /api/permissions/reset/all`} />

            <h3 className="font-semibold mb-2 mt-6">Granular Field-Level Permissions Matrix</h3>
            <p className="text-muted-foreground text-sm mb-2 leading-relaxed">
              In addition to content-type actions, NodePress supports granular field-level access control. 
              Under <strong className="text-foreground">Users → Permissions → Field-Level Permissions Matrix</strong>, administrators can select any content type and configure exact per-field permissions:
            </p>
            <ul className="text-muted-foreground text-sm space-y-1.5 list-disc pl-4 mb-4">
              <li><strong className="text-foreground">Read Visibility (<IC>readRoles</IC>):</strong> Choose which roles can see a specific attribute. Unauthorized roles will receive sanitized payloads with the restricted fields automatically stripped.</li>
              <li><strong className="text-foreground">Write / Mutation Access (<IC>writeRoles</IC>):</strong> Restrict who can edit or create values for specific fields (e.g., locking internal pricing, editorial notes, or approval flags to Admins only). Attempted edits by unauthorized roles are rejected with HTTP 403 Forbidden.</li>
            </ul>

            <div className="mt-4 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm">
              <strong className="text-blue-400">How permissions are checked:</strong>
              <ol className="text-muted-foreground mt-1 text-xs space-y-1 list-decimal list-inside">
                <li>Check for an exact <IC>role + contentType</IC> row in the permission table</li>
                <li>Fall back to the wildcard <IC>role + *</IC> row</li>
                <li>Enforce schema-level <IC>readRoles</IC> and <IC>writeRoles</IC> on every field</li>
                <li>If neither exists, deny by default</li>
              </ol>
            </div>

            <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm">
              <strong className="text-amber-400">Content permissions apply to every write path</strong>
              <ul className="text-muted-foreground mt-1 text-xs space-y-1 list-disc pl-4">
                <li>The public write API (<IC>POST/PUT/DELETE /api/:type</IC>) checks the role&apos;s content permissions for JWT callers, not only API keys. Creating a published entry (the default) or promoting one to published needs <IC>publish</IC> — so a contributor&apos;s JWT must send <IC>status: &quot;draft&quot;</IC>.</li>
                <li><IC>POST /api/entries</IC> checks the permissions of the entry&apos;s own content type, not the <IC>*</IC> row.</li>
                <li>Bulk routes check every affected entry&apos;s content type: <IC>bulk-publish</IC> and <IC>bulk-promote</IC> to published need <IC>publish</IC>, <IC>bulk-delete</IC> needs <IC>delete</IC>, the others <IC>update</IC>. If any type is denied the request is a <IC>403</IC> with <IC>forbiddenContentTypes</IC> and nothing changes.</li>
                <li>GraphQL entry mutations (<IC>createEntry</IC>, <IC>updateEntry</IC>, <IC>deleteEntry</IC>, <IC>restoreEntryVersion</IC> and the <IC>bulk*</IC> mutations) run the same per-content-type checks, and the admin entry queries and mutations apply the caller&apos;s field rules.</li>
                <li>A user whose role no longer exists is treated as a viewer (read-only).</li>
              </ul>
            </div>
          </Section>

          {/* ── Brand & Theme ─────────────────────────────────────────────── */}
          <Section id="brand" title="Brand & Theme" icon={Palette}>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Set your install's identity at <IC>Settings → Brand</IC> (admin only). It is stored on the
              server (shared across every browser and device) and applied everywhere automatically.
            </p>
            <div className="rounded-xl border border-border overflow-hidden mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Setting</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Applies to</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-muted-foreground text-xs">
                  <tr><td className="px-4 py-3 font-medium text-foreground">Name</td><td className="px-4 py-3">Sidebar, browser tab title, login &amp; setup pages, form-submission emails.</td></tr>
                  <tr><td className="px-4 py-3 font-medium text-foreground">Logo</td><td className="px-4 py-3">Sidebar, login page, browser favicon, email header. Uploaded via the media library.</td></tr>
                  <tr><td className="px-4 py-3 font-medium text-foreground">Accent colour</td><td className="px-4 py-3">Sidebar highlight and email header bar.</td></tr>
                </tbody>
              </table>
            </div>

            <h3 className="font-semibold mb-2">Theme (optional)</h3>
            <p className="text-muted-foreground text-sm mb-3">
              The <strong className="text-foreground">Theme</strong> card lets you recolour the admin UI:
            </p>
            <ul className="text-sm text-muted-foreground space-y-1.5 mb-3 list-disc pl-5">
              <li><strong className="text-foreground">Button colour</strong> — primary buttons. Button text colour auto-adjusts (black/white) for readability.</li>
              <li><strong className="text-foreground">Input colour</strong> — input field border and focus ring.</li>
            </ul>
            <p className="text-muted-foreground text-sm">
              Both are optional — leave a field blank (or hit <IC>Reset</IC>) to use the built-in theme default.
              One colour applies in both light and dark mode. Changes take effect immediately after saving.
            </p>
          </Section>

          {/* ── Plugin System ─────────────────────────────────────────────── */}
          <Section id="plugins" title="Plugin System" icon={Puzzle}>
            <p className="text-muted-foreground leading-relaxed mb-4">
              A plugin is a NestJS module with a manifest. It can react to (and reject) content writes, run background
              jobs, add REST endpoints and expose settings in the admin. Plugins run inside the server process — install
              only plugins you trust.
            </p>

            <h3 className="font-semibold mb-2">Manifest and module</h3>
            <CodeBlock code={`// src/plugins/my-plugin/manifest.ts
import { PluginManifest } from '../../plugin/plugin-sdk';

export const MyPluginManifest: PluginManifest = {
  id: 'my-plugin',              // kebab-case, unique
  name: 'My Plugin',
  version: '1.0.0',
  description: 'What this plugin does',
  nodepress: '^1.6.0',          // NodePress versions it supports (semver range)
  permissions: ['entries:read', 'entries:write', 'jobs:run'],
  configSchema: [
    { name: 'apiKey', label: 'API key', type: 'password' }, // shown masked, never logged
    { name: 'limit', label: 'Limit', type: 'number', defaultValue: 10 },
  ],
};

// src/plugins/my-plugin/my-plugin.module.ts
import { Module } from '@nestjs/common';
import { PluginContextModule } from '../../plugin/plugin-sdk';
import { MyPluginManifest } from './manifest';
import { MyPluginService } from './my-plugin.service';

@Module({
  imports: [PluginContextModule.forPlugin(MyPluginManifest)],
  providers: [MyPluginService],
})
export class MyPluginModule {}`} />

            <h3 className="font-semibold mb-2 mt-5">Installing a plugin</h3>
            <p className="text-muted-foreground text-sm mb-2">
              <strong className="text-foreground">Upload it</strong> (site owners): on the Plugins page click{' '}
              <strong className="text-foreground">Upload plugin</strong> and choose the plugin&apos;s <IC>.zip</IC>. NodePress checks it
              before installing anything — manifest, NodePress version, permissions and signature — and shows you what it
              will do. After <strong className="text-foreground">Install</strong>, click <strong className="text-foreground">Restart now</strong>:
              the server exits and Docker, PM2 or systemd starts it again (with <IC>npm run start:dev</IC>, start it yourself).
              The plugin then appears disabled; turn it on when you&apos;re ready. Updating is the same with a newer zip (it keeps
              its on/off state and settings); deleting needs the plugin disabled first.
            </p>
            <p className="text-muted-foreground text-sm mb-2">
              Uploaded packages are stored in Postgres, so every server — including a fresh container or a PaaS redeploy —
              unpacks and loads them at startup (into <IC>PLUGINS_DIR</IC>, default <IC>backend/.plugins</IC>). A package
              that fails to load is listed with its error; one that stops the server from starting is switched off
              automatically, so the next start succeeds. With several servers, restart each one.
            </p>
            <p className="text-muted-foreground text-sm mb-2">
              <strong className="text-foreground">Or browse the directory</strong>: the Plugins page&apos;s{' '}
              <strong className="text-foreground">Browse</strong> tab lists plugins from the NodePress plugin registry (a{' '}
              <IC>plugins-registry.json</IC> file, by default the one in the NodePress GitHub repo; set{' '}
              <IC>PLUGIN_REGISTRY_URL</IC> to use your own, or leave it empty to turn the tab off). Each card shows the
              plugin&apos;s author, licence, pricing, compatibility and whether it is installed. <strong className="text-foreground">Install</strong>{' '}
              downloads the package over HTTPS, checks its <IC>sha256</IC> from the registry and then runs the same review and
              signature checks as an upload. The list is cached for an hour, and the last good copy is used if the registry is
              unreachable.
            </p>
            <CodeBlock code={`// plugins-registry.json
{
  "version": 1,
  "plugins": [{
    "id": "my-plugin", "name": "My Plugin", "description": "…",
    "author": "Acme", "license": "MIT", "nodepress": "^1.7.0",
    "tags": ["seo"], "pricing": "free",
    "latest": {                                   // optional — leave out for listing-only entries
      "version": "1.0.0",
      "downloadUrl": "https://example.com/my-plugin-1.0.0.zip",
      "sha256": "…"                               // required together with downloadUrl
    }
  }]
}`} />
            <p className="text-muted-foreground text-sm mb-2">
              <strong className="text-foreground">Or bundle it in code</strong> (developers): put it in <IC>src/plugins/</IC> and add
              it to <IC>src/plugin/plugins.config.ts</IC>. Bundled plugins can&apos;t be deleted or replaced by an upload.
            </p>
            <CodeBlock code={`import { MyPluginManifest, MyPluginModule } from '../plugins/my-plugin';

export const ENABLED_PLUGINS = [
  { manifest: MyPluginManifest, module: MyPluginModule },
];`} />

            <h3 className="font-semibold mb-2 mt-5">Upload settings</h3>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border bg-muted/30"><th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Variable</th><th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Meaning</th></tr></thead>
                <tbody className="text-muted-foreground divide-y divide-border text-xs">
                  {[
                    ['PLUGIN_UPLOADS', 'signed (default): only packages signed by a trusted key. unsigned: any valid package, with a warning. off: no uploads or deletes — installed plugins still load.'],
                    ['PLUGIN_TRUSTED_KEYS', 'Comma-separated publisher public keys (printed by plugin keygen).'],
                    ['PLUGIN_MAX_UPLOAD_MB', 'Largest package accepted (default 25).'],
                    ['PLUGINS_DIR', 'Where packages are unpacked (default backend/.plugins). Re-created from the database at startup.'],
                    ['PLUGIN_REGISTRY_URL', 'Plugin directory shown in the Browse tab (default: plugins-registry.json in the NodePress GitHub repo). Empty disables the directory.'],
                  ].map(([name, desc]) => (
                    <tr key={name}><td className="px-4 py-2.5 font-mono">{name}</td><td className="px-4 py-2.5">{desc}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="font-semibold mb-2 mt-5">Building an uploadable package</h3>
            <p className="text-muted-foreground text-sm mb-2">
              A package is a zip with <IC>nodepress-plugin.json</IC> at the root (the manifest above as JSON, plus{' '}
              <IC>main</IC> and <IC>files</IC>) and your compiled JavaScript. The entry file exports <IC>manifest</IC> and{' '}
              <IC>module</IC>. Import the SDK as <IC>@nodepress/plugin-sdk</IC> — the server supplies it, along with{' '}
              <IC>@nestjs/*</IC>, Prisma and <IC>rxjs</IC>; bundle any other runtime dependencies by adding{' '}
              <IC>node_modules</IC> to <IC>files</IC>. The JSON manifest is what admins review, so its id, version and
              permissions must match the exported one or the plugin won&apos;t load. (The SDK&apos;s type definitions aren&apos;t
              published to npm yet — for now, point <IC>@nodepress/plugin-sdk</IC> at a NodePress checkout&apos;s{' '}
              <IC>backend/src/plugin/plugin-sdk.ts</IC> with <IC>paths</IC> in your <IC>tsconfig.json</IC>.)
            </p>
            <CodeBlock code={`// nodepress-plugin.json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "What this plugin does",
  "nodepress": "^1.6.0",
  "permissions": ["entries:read", "entries:write"],
  "main": "dist/index.js",
  "files": ["dist"]
}

// src/index.ts → compiled to dist/index.js (tsc with emitDecoratorMetadata)
export { MyPluginManifest as manifest } from './manifest';
export { MyPluginModule as module } from './my-plugin.module';`} />
            <CodeBlock code={`npx create-nodepress-app plugin keygen --out my-key.pem   # once; prints your public key
npx create-nodepress-app plugin pack . --key my-key.pem   # → my-plugin-1.0.0.zip, signed`} />
            <p className="text-muted-foreground text-xs mt-2">
              Keep the private key secret. Servers trust your plugins once your public key is in their{' '}
              <IC>PLUGIN_TRUSTED_KEYS</IC>. The signature covers every file, so a package changed after signing is refused.
              Signing proves who built a package; it doesn&apos;t make the code safe — uploaded plugins run with full access
              to the server, like bundled ones.
            </p>

            <h3 className="font-semibold mb-2 mt-5">The plugin context</h3>
            <p className="text-muted-foreground text-sm mb-2">
              Inject <IC>PluginContext</IC> with <IC>@InjectPluginContext()</IC>. It is scoped to your plugin: hooks are
              registered under its id, <IC>config()</IC> returns only its own settings, and jobs are namespaced
              as <IC>my-plugin.&lt;type&gt;</IC>.
            </p>
            <CodeBlock code={`import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  InjectPluginContext, PluginContext, PluginEvents, EntryLifecyclePayload, PluginVetoError,
} from '../../plugin/plugin-sdk';

@Injectable()
export class MyPluginService implements OnModuleInit {
  constructor(@InjectPluginContext() private readonly ctx: PluginContext) {}

  onModuleInit() {
    // Before-hooks may change payload.data, or throw PluginVetoError to reject the write (HTTP 422).
    this.ctx.on(PluginEvents.ENTRY_BEFORE_CREATE, (p: EntryLifecyclePayload) => {
      if (p.contentType === 'product' && Number(p.data.price) < 0) {
        throw new PluginVetoError('Price cannot be negative');
      }
    });

    // After-hooks are notifications; p.source says where the change came from.
    this.ctx.on(PluginEvents.ENTRY_AFTER_PUBLISH, async (p: EntryLifecyclePayload) => {
      await this.ctx.jobs.enqueue('sync', { id: p.id });
    });

    this.ctx.jobs.register('sync', async (payload) => {
      const { apiKey } = this.ctx.config();
      // … call an external service; throw to retry
    });

    this.ctx.onConfigChange((config) => this.ctx.logger.log('Settings changed'));
  }
}`} />

            <h3 className="font-semibold mb-2 mt-5">Lifecycle events</h3>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border bg-muted/30"><th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Event</th><th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Fires when</th><th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Permission</th></tr></thead>
                <tbody className="text-muted-foreground divide-y divide-border font-mono text-xs">
                  {[
                    ['ENTRY_BEFORE_CREATE', 'An entry is about to be created (admin or public API) — can veto', 'entries:write'],
                    ['ENTRY_BEFORE_UPDATE', 'An entry is about to be updated (admin or public API) — can veto', 'entries:write'],
                    ['ENTRY_BEFORE_PUBLISH', 'An entry is about to be published (incl. bulk, promote) — can veto', 'entries:write'],
                    ['ENTRY_BEFORE_DELETE', 'An entry is about to be deleted (incl. bulk) — can veto', 'entries:delete'],
                    ['ENTRY_AFTER_CREATE', 'Created — also by import and new translations', 'entries:read'],
                    ['ENTRY_AFTER_UPDATE', 'Updated — also by bulk status changes, restore, import, scheduled publish', 'entries:read'],
                    ['ENTRY_AFTER_PUBLISH', 'Published — also bulk, promote and scheduled publish', 'entries:read'],
                    ['ENTRY_AFTER_DELETE', 'Soft-deleted (incl. bulk)', 'entries:read'],
                  ].map(([event, desc, perm]) => (
                    <tr key={event}><td className="px-4 py-2.5">{event}</td><td className="px-4 py-2.5 font-sans">{desc}</td><td className="px-4 py-2.5">{perm}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-muted-foreground text-xs mt-2">
              Payloads carry <IC>id</IC>, <IC>slug</IC>, <IC>status</IC>, <IC>contentType</IC>, <IC>locale</IC>, <IC>data</IC> and{' '}
              <IC>source</IC> (<IC>admin</IC>, <IC>api</IC>, <IC>bulk</IC>, <IC>import</IC>, <IC>restore</IC>, <IC>translation</IC>,{' '}
              <IC>scheduler</IC> or <IC>promote</IC>). Subscribing to an event without its permission in the manifest fails at startup.
              Keys you add to <IC>data</IC> are stored lowercased, like all entry keys — use snake_case.
            </p>

            <h3 className="font-semibold mb-2 mt-5">What the core enforces</h3>
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-muted-foreground">
              <li><strong className="text-foreground">Disabled means off:</strong> a disabled plugin&apos;s hooks don&apos;t run, its queued jobs fail with &quot;plugin disabled&quot;, and its controllers — including those in modules only the plugin imports — answer <IC>404</IC>.</li>
              <li><strong className="text-foreground">Errors are contained:</strong> a hook that throws is logged and the request continues (only <IC>PluginVetoError</IC> stops it). Each hook has a 5-second timeout.</li>
              <li><strong className="text-foreground">Compatibility:</strong> if the running NodePress doesn&apos;t satisfy the manifest&apos;s <IC>nodepress</IC> range, the plugin stays disabled and the Plugins page shows why.</li>
              <li><strong className="text-foreground">Secrets:</strong> <IC>password</IC> settings are returned masked to admins, hidden from everyone else, and never written to the audit log. Saving the form without retyping one keeps the stored value.</li>
              <li><strong className="text-foreground">Permissions:</strong> <IC>entries:read</IC>, <IC>entries:write</IC>, <IC>entries:delete</IC>, <IC>content-types:write</IC>, <IC>media:read</IC>, <IC>settings:read</IC>, <IC>settings:write</IC>, <IC>jobs:run</IC>, <IC>routes:public</IC>. They gate what the context lets you subscribe to; they are not a sandbox.</li>
            </ul>

            <div className="mt-4 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm">
              <strong className="text-blue-400">Discover installed plugins:</strong>
              <p className="text-muted-foreground mt-1 text-xs"><IC>GET /api/plugins</IC> — registered plugins with version, compatibility, enabled state and pending restart changes (settings are included for admins only). Admin-only: <IC>PATCH /api/plugins/:id/toggle</IC>, <IC>PUT /api/plugins/:id/config</IC>, <IC>POST /api/plugins/packages</IC> (multipart <IC>file</IC>; <IC>?dryRun=true</IC> only reviews it), <IC>DELETE /api/plugins/packages/:id</IC>, <IC>POST /api/plugins/restart</IC>, <IC>GET /api/plugins/registry</IC> (the directory; <IC>?refresh=true</IC> skips the cache) and <IC>POST /api/plugins/registry/:id/install</IC> (<IC>?dryRun=true</IC> only reviews it).</p>
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

            <h3 className="font-semibold mb-3 mt-6">On-the-fly image transforms</h3>
            <p className="text-muted-foreground text-sm mb-3">
              Request any size or format of an uploaded image; it is generated once with Sharp, cached on disk and served
              with a one-year <IC>immutable</IC> cache header, so a CDN serves it from then on. Works with local and S3
              storage (an S3 original is downloaded once, up to 25 MB).
            </p>
            <CodeBlock code={`# 800 px wide, AVIF or WebP depending on the browser's Accept header
GET ${baseUrl}/api/media/1712345678-abc123.jpg/transform?w=800&format=auto

# Square thumbnail cropped around the image's focal point
GET ${baseUrl}/api/media/1712345678-abc123.jpg/transform?w=400&h=400&fit=cover&fp=0.62,0.35

# Responsive srcset
<img src="/api/media/pic.jpg/transform?w=640&format=auto"
     srcset="/api/media/pic.jpg/transform?w=640&format=auto 640w,
             /api/media/pic.jpg/transform?w=1080&format=auto 1080w,
             /api/media/pic.jpg/transform?w=1920&format=auto 1920w"
     sizes="100vw" alt="">`} />
            <div className="rounded-xl border border-border overflow-x-auto mb-3 mt-3">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {[
                    ['w / h', 'Width / height in px, rounded up to 16, 32, 48, 64, 96, 128, 192, 256, 320, 384, 480, 640, 750, 828, 960, 1080, 1200, 1440, 1600, 1920, 2048, 2560, 3200 or 3840. Never enlarges.'],
                    ['format', 'auto (AVIF → WebP → JPEG by Accept header; sends Vary: Accept), webp (default), avif, jpeg, png'],
                    ['fit', 'inside (default), cover, contain, fill, outside'],
                    ['q', 'Quality 30–100, rounded to steps of 10 (default 80)'],
                    ['fp', 'The image\'s focal point "x,y". With fit=cover and both w and h, the crop keeps the focal point in frame. Including fp pins the URL so it can be cached forever; without it, focal crops are cached for an hour so a changed focal point shows up.'],
                  ].map(([k, v]) => (
                    <tr key={k}>
                      <td className="px-4 py-2.5 align-top"><IC>{k}</IC></td>
                      <td className="px-4 py-2.5 text-muted-foreground">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground space-y-2 mb-4">
              <p><strong className="text-foreground">Focal point:</strong> in Admin → Media, click the crosshair on an image card, click the most important part of the image and Save (<IC>PUT /api/media/:filename/focal-point</IC> with <IC>{'{ "x": 0.62, "y": 0.35 }'}</IC>; nulls clear it). The media list returns <IC>focalX</IC>/<IC>focalY</IC>.</p>
              <p><strong className="text-foreground">Abuse limits:</strong> because sizes and quality are snapped, one image has a bounded number of variants. At most <IC>IMAGE_TRANSFORM_CONCURRENCY</IC> encodes (default 2) run at once; when 50 more are waiting the endpoint answers <IC>503</IC>. Variants unused for 30 days, and the least recently used ones above <IC>IMAGE_VARIANT_CACHE_MB</IC> (default 2048), are pruned nightly.</p>
            </div>

            <h3 className="font-semibold mb-3 mt-6">Cloud Storage Configuration (S3 / Cloudflare R2 / MinIO)</h3>
            <p className="text-muted-foreground text-sm mb-3">
              Switch from local disk storage to any S3-compatible cloud object store with <IC>STORAGE_DRIVER=s3</IC>:
            </p>

            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-foreground mb-1">⚡ Cloudflare R2 (Zero Egress Fees — Recommended)</p>
                <CodeBlock code={`STORAGE_DRIVER=s3
STORAGE_S3_BUCKET=my-r2-bucket
STORAGE_S3_REGION=auto
STORAGE_S3_ACCESS_KEY=your_r2_access_key_id
STORAGE_S3_SECRET_KEY=your_r2_secret_access_key
STORAGE_S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
STORAGE_S3_PUBLIC_URL=https://assets.yourdomain.com`} />
              </div>

              <div>
                <p className="text-xs font-semibold text-foreground mb-1">📦 AWS S3</p>
                <CodeBlock code={`STORAGE_DRIVER=s3
STORAGE_S3_BUCKET=my-s3-bucket
STORAGE_S3_REGION=us-east-1
STORAGE_S3_ACCESS_KEY=AKIAXXXXXXXXXXXXXXXX
STORAGE_S3_SECRET_KEY=your_aws_secret_access_key
STORAGE_S3_PUBLIC_URL=https://d111111abcdef8.cloudfront.net`} />
              </div>

              <div>
                <p className="text-xs font-semibold text-foreground mb-1">🏢 MinIO (Self-Hosted S3 / Docker)</p>
                <CodeBlock code={`STORAGE_DRIVER=s3
STORAGE_S3_BUCKET=nodepress-uploads
STORAGE_S3_REGION=us-east-1
STORAGE_S3_ACCESS_KEY=minioadmin
STORAGE_S3_SECRET_KEY=minioadmin
STORAGE_S3_ENDPOINT=http://localhost:9000
STORAGE_S3_PUBLIC_URL=http://localhost:9000/nodepress-uploads`} />
              </div>
            </div>
          </Section>

          {/* ── API Keys ──────────────────────────────────────────────────── */}
          <Section id="api-keys" title="API Keys" icon={Key}>
            <p className="text-muted-foreground leading-relaxed mb-4">
              NodePress is headless — your content is consumed by other apps. API Keys let those
              apps read or write content <strong className="text-foreground">without a user login</strong>.
              They are prefixed with <IC>np_</IC>, and the full key is shown only once — save it somewhere safe.
            </p>

            {/* When to use one */}
            <h3 className="font-semibold mb-3">When you'd use one</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              {[
                ['Public website / frontend', 'Your site fetches published content at runtime or build time. Use a read key scoped to the content types it displays.'],
                ['Mobile app', 'A native/React Native app reads (and maybe writes) content. Use a read or write key.'],
                ['Static-site build (Next.js, Gatsby, Astro)', 'CI pulls content during the build. A read key is enough.'],
                ['Partner / server integration', 'Another backend syncs or pushes content. Use a write/all key, scoped to specific content types.'],
                ['CI / schema as code', 'A pipeline checks or applies nodepress.schema.json with the schema:* CLI commands. Needs an all-access key for every content type (*).'],
              ].map(([title, desc]) => (
                <div key={title} className="rounded-xl border border-border p-4">
                  <p className="text-sm font-semibold mb-1">{title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              <strong className="text-foreground">You don't need a key for:</strong> the admin panel (it uses your login),
              public form submissions (<IC>POST /api/submit/:slug</IC>), or already-public <IC>GET</IC> reads.
              Keys matter for writes, and for read access you want to scope, rate-limit, or attribute.
            </p>

            {/* How to create one */}
            <div className="rounded-xl border border-border p-5 mb-6 bg-muted/20 space-y-3">
              <h4 className="font-semibold text-sm">How to create a key</h4>
              <div className="space-y-2 text-sm text-muted-foreground">
                {[
                  ['1. Open API Keys', 'Go to Developer → API Keys (admin only) and click New API Key.'],
                  ['2. Name + access', 'Give it a recognisable name (e.g. "Website — read") and pick read / write / all.'],
                  ['3. Scope content types', 'Restrict to specific content types (e.g. blog, pages) or allow all (*).'],
                  ['4. Copy the key', 'The np_… key is shown ONCE. Copy it into your app\'s env/secret store now — you cannot view it again.'],
                  ['5. Use it', 'Send it as the X-API-Key header on requests (see below). Watch the Last Used column to spot stale keys; delete a key to revoke it instantly.'],
                ].map(([step, desc]) => (
                  <div key={step} className="flex gap-3">
                    <span className="font-medium text-foreground w-36 shrink-0">{step}</span>
                    <span>{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            <h3 className="font-semibold mb-3">Access levels</h3>
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
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 mb-4 text-sm">
              <strong className="text-blue-400">Full-access keys and the content model</strong>
              <p className="text-muted-foreground mt-1 text-xs">
                A key with access <IC>all</IC> and content types <IC>*</IC> can also export and import content type schemas
                (<IC>GET /api/content-types/export</IC>, <IC>POST /api/content-types/import</IC>) — what CI needs for{' '}
                <IC>schema:diff</IC> / <IC>schema:push</IC>. Narrower keys get <IC>403</IC> there. Treat such a key like an admin
                password.
              </p>
            </div>

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
            <p className="text-muted-foreground text-sm mb-8">
              Actions run in the background job queue, so the submitter never waits for your mail server or
              endpoint. A failed email or a webhook that errors, times out (10 s) or returns a non-2xx status is
              retried twice more — after 1 minute and after 10 minutes — and nothing is lost if the server restarts.
              Up to <IC>JOB_CONCURRENCY</IC> actions (default 5) run at once per backend instance.
              Actions that still fail appear under <strong className="text-foreground">Developer → Jobs</strong>{' '}
              (admin only), where you can see the error and payload, retry one job or all failed jobs, and delete
              finished ones.
            </p>

            {/* Email setup (SMTP) */}
            <h3 className="font-semibold mb-3">Setting up email (SMTP)</h3>
            <p className="text-muted-foreground text-sm mb-4">
              The Email action only sends mail once SMTP is configured in <IC>backend/.env</IC>. Without it,
              submissions are still saved but no email is sent (the backend logs a warning, never crashes).
              Restart the backend after editing <IC>.env</IC> — the mail connection is created once at startup.
            </p>

            <div className="rounded-xl border border-border p-4 mb-4">
              <p className="text-sm font-semibold mb-2">Gmail (quick start)</p>
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                Gmail does <strong className="text-foreground">not</strong> accept your normal account password for SMTP.
                You must create a 16-character <strong className="text-foreground">App Password</strong>, which requires
                2-Step Verification to be enabled first:
              </p>
              <ol className="text-xs text-muted-foreground leading-relaxed space-y-1.5 mb-3 list-decimal pl-5">
                <li>
                  Enable 2-Step Verification:{' '}
                  <a href="https://myaccount.google.com/signinoptions/two-step-verification" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">
                    myaccount.google.com/signinoptions/two-step-verification
                  </a>
                </li>
                <li>
                  Create an App Password:{' '}
                  <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">
                    myaccount.google.com/apppasswords
                  </a>{' '}
                  — pick "Mail" / "Other", name it "NodePress", and copy the 16-character password it shows.
                </li>
                <li>Paste that value as <IC>SMTP_PASS</IC> below (remove the spaces), then restart the backend.</li>
              </ol>
              <CodeBlock code={`# backend/.env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false                  # false for port 587 (STARTTLS), true for 465 (SSL)
SMTP_USER=you@gmail.com
SMTP_PASS=your_16_char_app_password   # the Gmail App Password — NOT your login password
SMTP_FROM=Contact Form <you@gmail.com>`} />
            </div>

            <p className="text-muted-foreground text-sm mb-4">
              <strong className="text-foreground">For production</strong>, a transactional email provider
              (Resend, Brevo, Mailgun, SendGrid, Postmark) gives far better deliverability than Gmail. They all
              provide an SMTP host, user, and password — drop those into the same five variables. Gmail also
              limits sending to ~500 messages/day, so it's best for testing only.
            </p>

            <p className="text-sm font-semibold text-foreground mb-1">Branding the notification email</p>
            <p className="text-muted-foreground text-sm mb-8">
              The email shows each field by its <strong className="text-foreground">label</strong> (not the raw
              field name) and is wrapped in a header + footer using your brand. Set your{' '}
              <strong className="text-foreground">name, logo, and accent colour</strong> once on the{' '}
              <IC>Settings → Brand</IC> page — it applies to these emails as well as the admin sidebar, favicon,
              and login screen. The sender name comes from <IC>SMTP_FROM</IC>. For deeper layout changes, edit{' '}
              <IC>backend/src/mail/mail.service.ts</IC> (<IC>sendFormSubmission</IC>).
            </p>

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
                  Stops automated bots with a near-invisible challenge. Supports{' '}
                  <strong className="text-foreground">Cloudflare Turnstile</strong> (recommended — free, no puzzle for users),{' '}
                  <strong className="text-foreground">hCaptcha</strong>, and <strong className="text-foreground">Google reCAPTCHA v2/v3</strong>.
                  The full Cloudflare Turnstile walkthrough is below.
                </p>

                {/* The two keys — where each goes */}
                <p className="text-xs font-semibold text-foreground mb-2">The two keys (this is the part people get wrong)</p>
                <p className="text-xs text-muted-foreground leading-relaxed mb-2">
                  Every captcha provider gives you <strong className="text-foreground">two</strong> keys. They go in two
                  different places and must never be swapped:
                </p>
                <div className="overflow-x-auto mb-4">
                  <table className="w-full text-xs border border-border rounded-lg">
                    <thead>
                      <tr className="bg-muted/40 text-left">
                        <th className="px-3 py-2 font-semibold">Key</th>
                        <th className="px-3 py-2 font-semibold">Where you paste it</th>
                        <th className="px-3 py-2 font-semibold">Public?</th>
                      </tr>
                    </thead>
                    <tbody className="text-muted-foreground">
                      <tr className="border-t border-border">
                        <td className="px-3 py-2"><strong className="text-foreground">Site Key</strong></td>
                        <td className="px-3 py-2">In your <strong className="text-foreground">website's form HTML</strong> — the <IC>data-sitekey</IC> attribute on the widget. <strong className="text-foreground">Not</strong> in <IC>.env</IC>.</td>
                        <td className="px-3 py-2">Yes — safe to be visible</td>
                      </tr>
                      <tr className="border-t border-border">
                        <td className="px-3 py-2"><strong className="text-foreground">Secret Key</strong></td>
                        <td className="px-3 py-2">In <IC>backend/.env</IC> as <IC>CAPTCHA_SECRET_KEY</IC>. Never in website code or git.</td>
                        <td className="px-3 py-2">No — keep private</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <p className="text-xs font-semibold text-foreground mb-2">Step-by-step (Cloudflare Turnstile)</p>
                <ol className="text-xs text-muted-foreground leading-relaxed space-y-1.5 mb-3 list-decimal pl-5">
                  <li>
                    Open the Turnstile dashboard:{' '}
                    <a href="https://dash.cloudflare.com/?to=/:account/turnstile" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">dash.cloudflare.com → Turnstile</a>{' '}
                    (free; you do not need to host your domain on Cloudflare).
                  </li>
                  <li>Click <strong className="text-foreground">Add site</strong>, name it, add your domain(s) — include <IC>localhost</IC> while testing — and choose widget type <strong className="text-foreground">Managed</strong>.</li>
                  <li>Cloudflare shows your <strong className="text-foreground">Site Key</strong> and <strong className="text-foreground">Secret Key</strong>. Copy both.</li>
                  <li>Paste the <strong className="text-foreground">Secret Key</strong> into <IC>backend/.env</IC> (see block below) and <strong className="text-foreground">restart the backend</strong>.</li>
                  <li>In the admin, open your form → turn on the <strong className="text-foreground">Spam Protection (Captcha)</strong> switch → Save.</li>
                  <li>Paste the <strong className="text-foreground">Site Key</strong> into the widget on your website form (see HTML block below).</li>
                </ol>
                <p className="text-xs text-muted-foreground mb-3">
                  Setting <IC>CAPTCHA_PROVIDER</IC> without <IC>CAPTCHA_SECRET_KEY</IC> stops the backend from starting — set both or neither.
                  For local testing, Cloudflare's always-pass keys are Site Key <IC>1x00000000000000000000AA</IC> and Secret Key <IC>1x0000000000000000000000000000000AA</IC>.
                </p>

                <p className="text-xs font-semibold text-foreground mb-1">Backend — the Secret Key goes here</p>
                <CodeBlock code={`# backend/.env  (then restart the backend)
CAPTCHA_PROVIDER=turnstile
CAPTCHA_SECRET_KEY=0x4AAAAAAA...your_SECRET_key_here`} />

                <p className="text-xs font-semibold text-foreground mb-1 mt-3">Website form — the Site Key goes here</p>
                <CodeBlock code={`<!-- 1. Load the Turnstile script once -->
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>

<form id="contact">
  <input name="fullname" required />
  <input name="email" type="email" required />
  <textarea name="message"></textarea>

  <!-- 2. The widget — paste your SITE key here -->
  <div class="cf-turnstile" data-sitekey="YOUR_SITE_KEY"></div>

  <button type="submit">Send</button>
</form>

<script>
  document.getElementById('contact').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    // 3. Turnstile drops the token into a hidden field — send it as captchaToken
    const captchaToken = fd.get('cf-turnstile-response');
    await fetch('https://YOUR_API/api/submit/contact-us', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: { fullname: fd.get('fullname'), email: fd.get('email'), message: fd.get('message') },
        captchaToken,
      }),
    });
    if (window.turnstile) window.turnstile.reset(); // tokens are single-use
  });
</script>`} />
              </div>
            </div>

            {/* Submit API */}
            <h3 className="font-semibold mb-3">Submit a form (public API)</h3>
            <p className="text-muted-foreground text-sm mb-3">
              No authentication required. The slug is the one you set when creating the form. Put your field
              values inside <IC>data</IC>. Add <IC>captchaToken</IC> alongside <IC>data</IC> only if the form
              has captcha enabled (see Spam Protection above); leave it out otherwise.
            </p>
            <CodeBlock code={`POST /api/submit/{slug}
Content-Type: application/json

{
  "data": {
    "full_name": "Jane Doe",
    "email": "jane@example.com",
    "message": "Hello!"
  },
  "captchaToken": "..."   // optional — required only when the form has captcha enabled
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
              Think of it as a <strong className="text-foreground">reverse API call</strong>: instead of another app
              polling NodePress asking "anything new yet?", NodePress automatically POSTs a JSON payload
              to a URL you register the moment a matching event happens.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Events fire for every write path — the admin panel, the public REST API with an API key
              (<IC>POST/PUT/DELETE /api/{'{type}'}</IC>), imports and the scheduler.
            </p>

            {/* When to use one */}
            <h3 className="font-semibold mb-3">What you'd use them for</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              {[
                ['Rebuild a static site', 'A post is published → ping your Vercel / Netlify deploy hook → your live site rebuilds with the new content automatically.'],
                ['Team notifications', 'New entry or media upload → POST to a Slack / Discord incoming webhook → your team sees it in a channel.'],
                ['Sync to another system', 'Entry created or updated → push to a search index (Algolia), a CRM, an email list, or an analytics tool.'],
                ['Clear a CDN cache', 'Entry updated → tell Cloudflare / Fastly to purge the cached page so visitors get fresh content.'],
              ].map(([title, desc]) => (
                <div key={title} className="rounded-xl border border-border p-4">
                  <p className="text-sm font-semibold mb-1">{title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              <strong className="text-foreground">Webhooks vs. the other "notify" features:</strong> webhooks tell
              <em> other systems</em> about content &amp; media events (this page); a form's
              <strong className="text-foreground"> Email action</strong> emails a <em>human</em> on submission; and
              <strong className="text-foreground"> API Keys</strong> let other systems <em>pull</em> data on demand.
            </p>

            {/* How to create one */}
            <div className="rounded-xl border border-border p-5 mb-6 bg-muted/20 space-y-3">
              <h4 className="font-semibold text-sm">How to set one up</h4>
              <div className="space-y-2 text-sm text-muted-foreground">
                {[
                  ['1. Open Webhooks', 'Go to Developer → Webhooks (admin only) and click New Webhook.'],
                  ['2. Set the target URL', 'Paste the URL NodePress should POST to — e.g. your Vercel deploy hook or a Slack incoming webhook URL.'],
                  ['3. Pick events', 'Choose which events fire it (entry.created, entry.updated, …) or select * for all of them.'],
                  ['4. Add a secret (recommended)', 'Set a secret so each delivery is HMAC-SHA256 signed — your receiver can verify the request genuinely came from NodePress (see below).'],
                  ['5. Test Ping', 'Click Test Ping to send a sample event and confirm your endpoint is reachable before relying on it. Watch the Delivery Log for the result.'],
                ].map(([step, desc]) => (
                  <div key={step} className="flex gap-3">
                    <span className="font-medium text-foreground w-44 shrink-0">{step}</span>
                    <span>{desc}</span>
                  </div>
                ))}
              </div>
            </div>

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

            <h3 className="font-semibold mb-3 mt-4">Delivery queue & retries</h3>
            <p className="text-muted-foreground text-sm mb-3">
              Events are queued in the database and sent in the background, so a burst of writes never slows down
              the request that caused them. Every backend instance runs a worker that sends up to{' '}
              <IC>WEBHOOK_CONCURRENCY</IC> deliveries at a time (default 10); adding instances adds delivery capacity,
              and no delivery is ever sent by two instances. If an instance stops mid-delivery, another one retries it
              about a minute later. Set <IC>QUEUE_WORKER=false</IC> on instances that should only serve the API.
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

            <h3 className="font-semibold mb-2">Dead-Letter Queue (DLQ) & 1-Click UI Re-Delivery</h3>
            <p className="text-muted-foreground text-sm mb-4 leading-relaxed">
              When all 3 automatic attempts fail (or if an external server was temporarily unavailable), the delivery is moved to the <strong className="text-foreground">Dead-Letter Queue (DLQ)</strong>. 
              Under <strong className="text-foreground">Developer → Webhooks → Delivery Logs & DLQ</strong>, administrators can:
            </p>
            <ul className="text-muted-foreground text-sm space-y-1.5 list-disc pl-4 mb-4">
              <li><strong className="text-foreground">Filter by Status:</strong> View All, Failed (DLQ), Delivered, or Pending dispatches.</li>
              <li><strong className="text-foreground">Inspect Payload & Error:</strong> View the exact JSON payload sent, recipient HTTP status codes, and error traces.</li>
              <li><strong className="text-foreground">1-Click Re-Delivery:</strong> Click the <IC>Re-deliver</IC> button to immediately re-dispatch the recorded payload. You can also trigger re-delivery programmatically via <IC>POST /api/webhooks/deliveries/:id/retry</IC>.</li>
            </ul>

            {/* Real-World Use Cases & Recipes */}
            <h3 className="font-semibold mb-3 mt-6">Top 5 Real-World Webhook Recipes & How to Use Them</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Here is how to connect NodePress webhooks to popular production tools, frameworks, and workflows:
            </p>

            <div className="space-y-4 mb-6">
              {/* Recipe 1: Next.js On-Demand Revalidation (ISR) */}
              <div className="rounded-xl border border-border p-4 bg-muted/10 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">1. Next.js On-Demand Cache Revalidation (ISR)</p>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">Next.js App Router</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Instantly refresh cached pages when an entry is created or updated, without rebuilding the whole website.
                </p>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p><strong>Webhook Configuration:</strong> Target URL: <IC>https://your-frontend.com/api/revalidate</IC> | Events: <IC>entry.created, entry.updated, entry.deleted</IC></p>
                </div>
                <CodeBlock code={`// app/api/revalidate/route.ts (Next.js)
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  const bodyText = await req.text();
  const signature = req.headers.get('x-nodepress-signature');
  const secret = process.env.NODEPRESS_WEBHOOK_SECRET!;

  // 1. Verify HMAC-SHA256 signature
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(bodyText).digest('hex');
  if (signature !== expected) {
    return NextResponse.json({ message: 'Invalid signature' }, { status: 401 });
  }

  const payload = JSON.parse(bodyText);
  const { event, data } = payload;

  // 2. Revalidate specific paths
  if (data?.slug && data?.contentType) {
    revalidatePath(\`/\${data.contentType}/\${data.slug}\`);
    revalidatePath('/'); // refresh homepage
  }

  return NextResponse.json({ revalidated: true, event, timestamp: Date.now() });
}`} />
              </div>

              {/* Recipe 2: Vercel / Netlify Deploy Hook */}
              <div className="rounded-xl border border-border p-4 bg-muted/10 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">2. Vercel & Netlify Automated Production Deployments</p>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">CI / CD & SSG</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Trigger an automated build and deployment on Vercel, Netlify, or Cloudflare Pages whenever content is published or updated.
                </p>
                <div className="text-xs text-muted-foreground space-y-1.5 pl-1">
                  <p>• <strong>Step 1:</strong> In your Vercel/Netlify Dashboard → <em>Settings → Git / Deploy Hooks</em> → create a hook URL (e.g. <IC>https://api.vercel.com/v1/integrations/deploy/prj_.../hook_...</IC>).</p>
                  <p>• <strong>Step 2:</strong> In NodePress → <em>Developer → Webhooks</em> → Add New Webhook with that URL and select <IC>entry.updated</IC> and <IC>entry.created</IC>.</p>
                </div>
              </div>

              {/* Recipe 3: Team Alerts (Slack / Discord) */}
              <div className="rounded-xl border border-border p-4 bg-muted/10 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">3. Editorial Team Alerts (Slack & Discord Incoming Webhooks)</p>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Team Channels</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Post real-time alerts to Slack or Discord channels whenever content is submitted for review or a new form submission arrives.
                </p>
                <div className="text-xs text-muted-foreground space-y-1.5 pl-1">
                  <p>• <strong>Slack:</strong> Create an Incoming Webhook in Slack App Directory → paste URL in NodePress webhooks.</p>
                  <p>• <strong>Discord:</strong> Channel Settings → Integrations → Webhooks → append <IC>/slack</IC> to the Discord webhook URL to accept standard Slack-compatible JSON payloads directly!</p>
                </div>
              </div>

              {/* Recipe 4: Algolia / Meilisearch Sync */}
              <div className="rounded-xl border border-border p-4 bg-muted/10 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">4. Algolia / Meilisearch Instant Search Indexing</p>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">Search Sync</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Automatically index new articles or remove unpublished items from search engines in real time.
                </p>
                <CodeBlock code={`// serverless handler (e.g. /api/sync-search)
export async function handleSearchSync(payload) {
  const { event, data } = payload;
  
  if (event === 'entry.created' || event === 'entry.updated') {
    if (data.status === 'published') {
      await algoliaIndex.saveObject({ objectID: String(data.id), ...data });
    } else {
      await algoliaIndex.deleteObject(String(data.id));
    }
  } else if (event === 'entry.deleted' || event === 'entry.purged') {
    await algoliaIndex.deleteObject(String(data.id));
  }
}`} />
              </div>

              {/* Recipe 5: CRM & Zapier / Make.com Automation */}
              <div className="rounded-xl border border-border p-4 bg-muted/10 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">5. CRM & Lead Forwarding (HubSpot, Salesforce, Zapier, Make)</p>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">Automations</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Push contact leads and customer submissions directly into HubSpot, Salesforce, or multi-step Zapier automations.
                </p>
                <div className="text-xs text-muted-foreground space-y-1.5 pl-1">
                  <p>• In Zapier / Make, choose <em>Webhooks by Zapier (Catch Hook)</em>.</p>
                  <p>• Copy the webhook URL and paste it into NodePress under <em>Forms → Actions → Webhook Action</em> or <em>Developer → Webhooks</em>.</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 mt-4 text-sm">
              <strong className="text-amber-400">Delivery notes</strong>
              <ul className="text-muted-foreground mt-1 space-y-1 list-disc pl-4">
                <li>Timeout per delivery: 10 seconds.</li>
                <li>Signed headers include <IC>X-NodePress-Signature</IC> (HMAC-SHA256), <IC>X-NodePress-Event</IC>, <IC>X-NodePress-Delivery</IC>, and <IC>X-NodePress-Redelivery</IC>.</li>
                <li>Use the <strong className="text-foreground">Test Ping</strong> button in the admin panel to verify your endpoint is reachable.</li>
              </ul>
            </div>
          </Section>

          {/* ── SEO & Sitemap ─────────────────────────────────────────────── */}
          <Section id="seo" title="SEO & Sitemap" icon={Globe}>
            <p className="text-muted-foreground leading-relaxed mb-4">
              NodePress is engineered from the ground up for maximum search engine visibility, high CTR social cards,
              and automated Google Rich Snippets.
            </p>

            <h3 className="font-semibold mb-3">1. Content Creator Workflow (Admin UI)</h3>
            <p className="text-muted-foreground text-sm mb-3">
              Every entry editor has an <strong>SEO &amp; Open Graph</strong> drawer with real-time feedback:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs font-semibold text-foreground">SEO Title &amp; Description</p>
                <p className="text-xs text-muted-foreground mt-1">Live 70-character title counter and 160-character description counter to prevent Google truncation.</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs font-semibold text-foreground">Social OG Image</p>
                <p className="text-xs text-muted-foreground mt-1">Pick an image from the Media Library (1200x630px recommended) for Facebook, LinkedIn, and Twitter cards.</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs font-semibold text-foreground">Live SERP &amp; Social Preview</p>
                <p className="text-xs text-muted-foreground mt-1">Real-time preview of how your page appears on Google search results and Twitter/Facebook feed cards.</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs font-semibold text-foreground">noIndex / noFollow Toggle</p>
                <p className="text-xs text-muted-foreground mt-1">Hide staging, internal, or private pages from search engines with one click (also excludes from sitemap).</p>
              </div>
            </div>

            <h3 className="font-semibold mb-3 mt-6">2. Frontend Developer Integration (Next.js App Router)</h3>
            <p className="text-muted-foreground text-sm mb-3">
              In your Next.js 14/15 page (<IC>app/[type]/[slug]/page.tsx</IC>), integrate dynamic metadata and Schema.org JSON-LD:
            </p>
            <CodeBlock code={`import type { Metadata } from 'next';

// 1. Fetch entry payload from NodePress
async function getEntry(type: string, slug: string) {
  const res = await fetch(\`\${process.env.BACKEND_URL}/api/\${type}/\${slug}\`, { next: { revalidate: 60 } });
  return res.ok ? res.json() : null;
}

// 2. Next.js dynamic metadata for OpenGraph & Twitter
// Next.js 15+: params is a Promise
type Props = { params: Promise<{ type: string; slug: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const entry = await getEntry(params.type, params.slug);
  if (!entry) return { title: 'Not Found' };

  const title = entry.seo?.title || entry.data?.title || params.slug;
  const description = entry.seo?.description || entry.data?.description || entry.data?.excerpt;
  const image = entry.seo?.image || entry.data?.image;

  return {
    title: \`\${title} | My Website\`,
    description,
    robots: entry.seo?.noIndex ? 'noindex, nofollow' : 'index, follow',
    alternates: { canonical: \`/\${params.type}/\${params.slug}\` },
    openGraph: {
      title,
      description,
      url: \`/\${params.type}/\${params.slug}\`,
      type: 'article',
      ...(image ? { images: [{ url: image, width: 1200, height: 630 }] } : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

// 3. Page component with Schema.org JSON-LD Structured Data
export default async function Page(props: Props) {
  const params = await props.params;
  const entry = await getEntry(params.type, params.slug);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: entry.seo?.title || entry.data?.title,
    description: entry.seo?.description || entry.data?.description,
    image: entry.seo?.image ? [entry.seo.image] : undefined,
    datePublished: entry.createdAt,
    dateModified: entry.updatedAt,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': \`https://yourdomain.com/\${params.type}/\${params.slug}\`,
    },
  };

  return (
    <article>
      {/* Search Engine Rich Snippet */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <h1>{entry.data?.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: entry.data?.content }} />
    </article>
  );
}`} />

            <h3 className="font-semibold mb-3 mt-6">3. Other Frameworks (Astro, Remix, SvelteKit, HTML)</h3>
            <p className="text-muted-foreground text-sm mb-3">
              The REST API automatically delivers the <IC>seo</IC> object on <IC>GET /api/:type/:slug</IC>:
            </p>
            <CodeBlock code={`<head>
  <title>{entry.seo?.title || entry.data.title}</title>
  <meta name="description" content={entry.seo?.description} />
  <link rel="canonical" href={\`https://yourdomain.com/\${type}/\${entry.slug}\`} />
  <meta name="robots" content={entry.seo?.noIndex ? 'noindex, nofollow' : 'index, follow'} />

  <!-- Open Graph -->
  <meta property="og:title" content={entry.seo?.title || entry.data.title} />
  <meta property="og:description" content={entry.seo?.description} />
  <meta property="og:image" content={entry.seo?.image} />
  <meta property="og:url" content={\`https://yourdomain.com/\${type}/\${entry.slug}\`} />

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={entry.seo?.title || entry.data.title} />
  <meta name="twitter:description" content={entry.seo?.description} />
  <meta name="twitter:image" content={entry.seo?.image} />
</head>`} />

            <h3 className="font-semibold mb-3 mt-6">4. Dynamic Sitemap &amp; robots.txt</h3>
            <p className="text-muted-foreground text-sm mb-3">
              NodePress dynamically generates an updated XML sitemap at <IC>/api/sitemap.xml</IC> and
              crawl directives at <IC>/api/robots.txt</IC>.
            </p>
            <CodeBlock code={`# In your Next.js next.config.js, proxy sitemap & robots:
module.exports = {
  async rewrites() {
    return [
      { source: '/sitemap.xml', destination: \`\${process.env.BACKEND_URL}/api/sitemap.xml\` },
      { source: '/robots.txt', destination: \`\${process.env.BACKEND_URL}/api/robots.txt\` },
    ];
  },
};`} />

            <div className="mt-4 rounded-xl border border-green-500/20 bg-green-500/5 p-4 text-sm">
              <strong className="text-green-400">Google Search Console Submission:</strong>
              <p className="text-muted-foreground mt-1 text-xs">
                Submit <IC>https://yourdomain.com/sitemap.xml</IC> in Google Search Console under <em>Sitemaps</em>.
                Whenever editors publish or edit content, Google crawls and indexes the changes automatically.
              </p>
            </div>
          </Section>

          {/* ── Self-hosting ───────────────────────────────────────────────── */}
          {/* ── Redirects ─────────────────────────────────────────────────── */}
          <Section id="redirects" title="Redirects" icon={ArrowRightLeft}>
            <p className="text-muted-foreground leading-relaxed mb-4">
              <strong className="text-foreground">Content → Redirects</strong> (<IC>/redirects</IC>, editors and admins) manages{' '}
              <IC>301</IC>, <IC>302</IC>, <IC>307</IC>, <IC>308</IC> and <IC>410</IC> (gone) rules for your website. NodePress doesn&apos;t
              serve your site, so the site asks it: <IC>GET /api/redirects/resolve?path=/old-page</IC> returns{' '}
              <IC>{'{ to, statusCode }'}</IC> or <IC>404</IC> (public, cached 5 minutes server-side, <IC>Cache-Control: max-age=60</IC>).
              Hits are counted per rule — buffered in memory and written every 10 seconds; opening the admin list writes this
              instance&apos;s buffered hits first, so the counts are current (other instances&apos; arrive within 10 s).
            </p>
            <ul className="text-muted-foreground text-sm space-y-1.5 list-disc pl-4 mb-4">
              <li><strong className="text-foreground">Matching:</strong> on the path only — lowercased, trailing slash removed. A query string is matched only when the rule&apos;s <IC>from</IC> has one; otherwise the visitor&apos;s query is carried over to the target.</li>
              <li><strong className="text-foreground">Targets:</strong> a path or an <IC>http(s)</IC> URL. A <IC>410</IC> has no target (<IC>to: null</IC>). Loops and chains longer than 5 hops are refused.</li>
              <li><strong className="text-foreground">Bulk:</strong> CSV import/export with columns <IC>from,to,status</IC> (up to 10,000 rows, all or nothing, with a dry run).</li>
              <li><strong className="text-foreground">Automatic 301 on slug change:</strong> when the slug of an entry that has ever been published changes, a 301 from its old public path is added. The path comes from the content type&apos;s Preview URL when it contains <IC>{'{slug}'}</IC>, otherwise <IC>/&lt;type-in-kebab-case&gt;/&lt;slug&gt;</IC>, with a <IC>/&lt;locale&gt;</IC> prefix for non-default languages. Set <IC>REDIRECTS_ON_SLUG_CHANGE=false</IC> to turn it off.</li>
            </ul>
            <h3 className="font-semibold mb-2">Next.js middleware example</h3>
            <CodeBlock code={`// middleware.ts
import { NextRequest, NextResponse } from 'next/server';

const CMS = process.env.NODEPRESS_URL!;   // the NodePress backend

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const res = await fetch(
    \`\${CMS}/api/redirects/resolve?path=\${encodeURIComponent(pathname + search)}\`,
    { next: { revalidate: 60 } },
  );
  if (!res.ok) return NextResponse.next();                // 404 → no rule
  const { to, statusCode } = await res.json();
  if (statusCode === 410) return new Response('Gone', { status: 410 });
  return NextResponse.redirect(new URL(to, req.url), statusCode);
}

export const config = { matcher: ['/((?!_next|api|favicon.ico).*)'] };`} />
            <div className="rounded-xl border border-border overflow-hidden mt-4">
              <Endpoint method="GET"    path="/api/redirects/resolve?path=" desc="Look up a path — { to, statusCode } or 404 (public)" />
              <Endpoint method="GET"    path="/api/redirects"               desc="List rules — ?search, ?page, ?limit, ?sort (writes this instance's buffered hit counts first)" auth />
              <Endpoint method="POST"   path="/api/redirects"               desc="Create — body: { from, to?, statusCode? } (default 301)" auth />
              <Endpoint method="PATCH"  path="/api/redirects/:id"           desc="Change a rule" auth />
              <Endpoint method="DELETE" path="/api/redirects/:id"           desc="Delete a rule" auth />
              <Endpoint method="POST"   path="/api/redirects/import"        desc="Import CSV — body: { csv, dryRun? } (from,to,status; all or nothing; ≤10,000 rows)" auth />
              <Endpoint method="GET"    path="/api/redirects/export"        desc="Download all rules as CSV" auth />
            </div>
          </Section>

          {/* ── JS/TS client ───────────────────────────────────────────────── */}
          <Section id="client" title="JavaScript / TypeScript Client" icon={Code2}>
            <p className="text-muted-foreground leading-relaxed mb-4">
              <IC>@nodepress/client</IC> is a small typed client for the public API — no dependencies, works in Node 18+,
              browsers and edge runtimes. Pair it with <IC>npx nodepress generate:types</IC> for typed entries and filters.
            </p>
            <CodeBlock code={`npm install @nodepress/client

import { createClient } from '@nodepress/client';
import type { NodePressContentTypes } from './types/nodepress';

const cms = createClient<NodePressContentTypes>({ url: 'https://cms.example.com' });

const { data } = await cms.collection('post').list({
  where: { featured: { eq: true }, author: { slug: { eq: 'jane' } } },
  populate: ['author'], locale: 'fr', fallback: true,
});
const post = await cms.collection('post').get('hello-world');      // null when missing
for await (const e of cms.collection('post').all()) { /* every entry, page by page */ }
await cms.graphql('{ posts(limit: 5) { data { slug } } }');
cms.imageUrl(post?.data.cover, { w: 800, format: 'auto' });

// Writes need a write API key (keep it server-side); status defaults to "published"
const admin = createClient({ url: 'https://cms.example.com', apiKey: process.env.NODEPRESS_KEY });
await admin.collection('post').create({ slug: 'draft-1', data: { title: 'Hi' }, status: 'draft' });`} />
            <p className="text-muted-foreground text-xs mt-3">
              The public write API (<IC>POST/PUT /api/:type</IC>) validates <IC>data</IC> against the content type — the same
              rules as the admin — and accepts <IC>status: "draft" | "published"</IC> on create.
            </p>
          </Section>

          {/* ── Live preview ──────────────────────────────────────────────── */}
          <Section id="live-preview" title="Live Preview" icon={Eye}>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Set a content type&apos;s <strong className="text-foreground">Preview URL</strong> (see Content Types) and the entry editor
              gets a <strong className="text-foreground">Live</strong> toggle: your real website opens in a resizable pane next to the
              form, with device widths, reload and open-in-new-tab buttons. The preview token in the URL is refreshed automatically,
              and every edit streams to the page as you type — no save needed. The entry has to be saved once first: on the new-entry
              page, <strong className="text-foreground">Save draft &amp; preview</strong> (shown for types with a Preview URL) saves it
              as a draft and opens the editor with the Live pane already on (<IC>?live=1</IC>).
            </p>
            <h3 className="font-semibold mb-2">The postMessage protocol</h3>
            <div className="overflow-x-auto rounded-xl border border-border mb-4">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border bg-muted/30"><th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Message</th><th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Direction</th><th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Meaning</th></tr></thead>
                <tbody className="text-muted-foreground divide-y divide-border text-xs">
                  <tr><td className="px-4 py-2.5 font-mono">{'{ type: "nodepress:preview", contentType, slug, locale, data }'}</td><td className="px-4 py-2.5">admin → site</td><td className="px-4 py-2.5">The form&apos;s current values, unsaved edits included (debounced)</td></tr>
                  <tr><td className="px-4 py-2.5 font-mono">{'{ type: "nodepress:ready" }'}</td><td className="px-4 py-2.5">site → admin</td><td className="px-4 py-2.5">The page is listening — send the data now</td></tr>
                  <tr><td className="px-4 py-2.5 font-mono">{'{ type: "nodepress:focus-field", field }'}</td><td className="px-4 py-2.5">site → admin</td><td className="px-4 py-2.5">The visitor clicked an element — scroll to and focus that field</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-muted-foreground text-sm mb-2">
              Both sides accept messages only from exact origins (never <IC>*</IC>). Your site must allow being framed by the admin&apos;s
              origin (e.g. <IC>Content-Security-Policy: frame-ancestors https://cms.example.com</IC>). The helpers in{' '}
              <IC>@nodepress/client/preview</IC> handle the protocol:
            </p>
            <CodeBlock code={`import { onPreviewUpdate, enableClickToEdit, isInPreviewFrame } from '@nodepress/client/preview';

const adminOrigin = 'https://cms.example.com';

if (isInPreviewFrame()) {
  // Re-render with the editor's live values
  const stop = onPreviewUpdate((msg) => render(msg.data), { adminOrigin });

  // <h1 data-np-field="title">…</h1> — hover outline, click focuses the field in the editor
  enableClickToEdit({ adminOrigin });
}`} />
          </Section>

          {/* ── Starters ──────────────────────────────────────────────────── */}
          <Section id="starters" title="Framework Starters" icon={Layers}>
            <p className="text-muted-foreground leading-relaxed mb-4">
              The repo&apos;s <IC>starters/</IC> folder has minimal blog frontends built on <IC>@nodepress/client</IC> — copy one out to
              start a site. Each has a list page with cursor pagination, a post page that sanitizes richtext again, cover images
              through <IC>cms.imageUrl()</IC> and <IC>?populate=author</IC>.
            </p>
            <div className="overflow-x-auto rounded-xl border border-border mb-4">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border bg-muted/30"><th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Starter</th><th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Rendering</th><th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Extras</th></tr></thead>
                <tbody className="text-muted-foreground divide-y divide-border text-xs">
                  <tr><td className="px-4 py-2.5 font-mono">starters/nextjs</td><td className="px-4 py-2.5">Next.js 15 App Router, server components, 60 s fetch cache</td><td className="px-4 py-2.5">Draft mode + live preview in the entry editor</td></tr>
                  <tr><td className="px-4 py-2.5 font-mono">starters/astro</td><td className="px-4 py-2.5">Astro, static build</td><td className="px-4 py-2.5">Every page built at build time</td></tr>
                  <tr><td className="px-4 py-2.5 font-mono">starters/nuxt</td><td className="px-4 py-2.5">Nuxt 4, server-rendered, CMS calls in <IC>server/api</IC></td><td className="px-4 py-2.5">The API key never reaches the browser</td></tr>
                </tbody>
              </table>
            </div>
            <CodeBlock code={`cp -R starters/nextjs ../my-site && cd ../my-site
cp .env.example .env     # NODEPRESS_URL (the backend), NODEPRESS_TYPE=blog, NODEPRESS_POPULATE=author, NODEPRESS_API_KEY (optional)
npm install && npm run dev`} />
            <p className="text-muted-foreground text-xs mt-2">
              Starters aren&apos;t workspaces and ship without lockfiles. They depend on <IC>@nodepress/client</IC> via{' '}
              <IC>file:../../client</IC> — after copying one elsewhere, point that at your NodePress checkout&apos;s <IC>client/</IC>{' '}
              (built with <IC>npm run build</IC>).
            </p>
          </Section>

          {/* ── Schema CLI ────────────────────────────────────────────────── */}
          <Section id="schema-cli" title="Schema as Code (CLI)" icon={GitBranch}>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Keep your content model in git and promote it between environments. The CLI talks to the schema export/import
              endpoints with <IC>NODEPRESS_URL</IC> and <IC>NODEPRESS_TOKEN</IC> (or <IC>NODEPRESS_API_KEY</IC>, or <IC>--url</IC> /{' '}
              <IC>--token</IC>). A token starting with <IC>np_</IC> is sent as <IC>X-API-Key</IC> (it needs <IC>all</IC> access to{' '}
              <IC>*</IC>); anything else as an admin <IC>Bearer</IC> JWT.
            </p>
            <CodeBlock code={`npx create-nodepress-app schema:pull [--out nodepress.schema.json]   # save the site's content types (with components and choice lists)
npx create-nodepress-app schema:diff [--file nodepress.schema.json]  # what a push would change
npx create-nodepress-app schema:push [--file nodepress.schema.json] [--yes]   # apply (asks first unless --yes)

# CI: fail the build when production drifts from the file
NODEPRESS_URL=https://cms.example.com NODEPRESS_TOKEN=np_… npx create-nodepress-app schema:diff`} />
            <ul className="text-muted-foreground text-sm space-y-1.5 list-disc pl-4 mt-3">
              <li><IC>schema:diff</IC> exits <IC>0</IC> when in sync, <IC>1</IC> when there are changes, <IC>2</IC> on an error.</li>
              <li><IC>schema:push</IC> creates and updates content types but never deletes one that exists only on the server (diff lists those).</li>
            </ul>
          </Section>

          {/* ── Releases ──────────────────────────────────────────────────── */}
          <Section id="releases" title="Content Releases" icon={History}>
            <p className="text-muted-foreground leading-relaxed mb-4">
              A release groups entry changes — <strong className="text-foreground">publish</strong>, <strong className="text-foreground">unpublish</strong> or
              <strong className="text-foreground"> archive</strong> — and applies them together in one database transaction, now or at a
              scheduled time (checked every minute, on any instance, exactly once). Each entry goes out as it is when the release is
              published, so editors keep editing drafts until then. Add entries from the Entries list (select → <em>Add to release</em>)
              or the entry editor's <em>Release</em> button; manage them under <strong className="text-foreground">Content → Releases</strong>.
              An entry in two pending releases is flagged; whichever goes out last wins. Editors and admins manage releases.
            </p>
            <CodeBlock code={`POST   /api/releases                    { "name": "Spring launch" }
POST   /api/releases/:id/items          { "entryIds": [12, 13], "action": "publish" }   # or unpublish | archive
DELETE /api/releases/:id/items/:itemId
PUT    /api/releases/:id/schedule       { "scheduledAt": "2026-11-01T09:00:00Z" }        # null unschedules
POST   /api/releases/:id/publish        # now
GET    /api/releases  |  GET /api/releases/:id   (items + conflicts)`} />
            <p className="text-muted-foreground text-xs mt-3">
              Publishing fires the usual entry webhooks and plugin hooks (source <IC>release</IC>) plus a <IC>release.published</IC> webhook.
              A plugin veto or error fails the whole release with nothing changed.
            </p>
          </Section>

          {/* ── Templates ─────────────────────────────────────────────────── */}
          <Section id="templates" title="Starter Templates" icon={Layers}>
            <p className="text-muted-foreground leading-relaxed mb-4">
              <strong className="text-foreground">Content Types → Start from a template</strong> creates a ready-made set of content
              types — <IC>blog</IC> (posts, authors, categories), <IC>agency</IC> (services, case studies, team, testimonials, flexible
              pages) or <IC>docs</IC> (sections and pages) — with working relations and, optionally, sample entries. It refuses to run
              if any of its content type names already exists. API: <IC>GET /api/templates</IC>, <IC>POST /api/templates/:id/apply</IC>
              {' '}<IC>{'{ "sampleContent": false }'}</IC> (admin).
            </p>
          </Section>

          {/* ── WordPress import ──────────────────────────────────────────── */}
          <Section id="wordpress-import" title="WordPress Importer" icon={Upload}>
            <p className="text-muted-foreground leading-relaxed mb-4">
              <strong className="text-foreground">Settings → Import</strong> (<IC>/import</IC>, admin only) moves a WordPress site in.
              Export it from WordPress (<em>Tools → Export → All content</em>), upload the WXR <IC>.xml</IC> file (up to 50 MB) and review
              the dry-run summary before importing. The import runs as a background job (<IC>import.wordpress</IC>, one attempt) whose
              progress the page follows.
            </p>
            <div className="overflow-x-auto rounded-xl border border-border mb-4">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border bg-muted/30"><th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">WordPress</th><th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">NodePress</th></tr></thead>
                <tbody className="text-muted-foreground divide-y divide-border text-xs">
                  <tr><td className="px-4 py-2.5">Posts, pages, custom post types</td><td className="px-4 py-2.5">One content type each with <IC>title</IC>, <IC>content</IC> (richtext), <IC>excerpt</IC>, <IC>featured_image</IC>, <IC>categories</IC> / <IC>tags</IC> (JSON arrays of names), <IC>author</IC> (text), <IC>wp_id</IC>, <IC>meta</IC> (JSON of the non-underscore post meta, ACF included). Reserved names get a <IC>wp_</IC> prefix.</td></tr>
                  <tr><td className="px-4 py-2.5">Status</td><td className="px-4 py-2.5"><IC>publish</IC> → published, <IC>draft</IC> → draft, <IC>pending</IC> → pending review, <IC>private</IC> → draft, <IC>future</IC> → draft with <IC>publishAt</IC></td></tr>
                  <tr><td className="px-4 py-2.5">Media (optional)</td><td className="px-4 py-2.5">Downloaded into the &quot;WordPress import&quot; media folder — allowed upload types only, 10 MB each, public <IC>http(s)</IC> URLs only</td></tr>
                </tbody>
              </table>
            </div>
            <ul className="text-muted-foreground text-sm space-y-1.5 list-disc pl-4 mb-3">
              <li>Existing content types with the same name are reused (only their fields are filled). Existing slugs are skipped unless you choose <em>Overwrite</em>.</li>
              <li>On a reused content type, existing <IC>date</IC> / <IC>datetime</IC> fields are filled too when the matching value is a valid date.</li>
              <li>Never imported: login accounts, spam / trashed comments, pingbacks, <IC>post_format</IC> and <IC>nav_menu</IC> terms. PHP-serialized meta is kept as the raw string.</li>
              <li>With several backend instances, <IC>uploads/</IC> must be shared — the uploaded file waits in <IC>uploads/.cache/imports</IC> for the job.</li>
            </ul>
            <h3 className="font-semibold mb-2">Optional extras</h3>
            <p className="text-muted-foreground text-sm mb-2">
              All off by default, chosen on the import page or as query flags (the dry run takes them too and reports the options and
              counts). Re-running an import is idempotent: authors are keyed by login, comments by <IC>comment-&lt;wp_id&gt;</IC>.
            </p>
            <div className="overflow-x-auto rounded-xl border border-border mb-4">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border bg-muted/30"><th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Flag</th><th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Adds</th></tr></thead>
                <tbody className="text-muted-foreground divide-y divide-border text-xs">
                  <tr><td className="px-4 py-2.5 font-mono">categoryPaths</td><td className="px-4 py-2.5"><IC>category_paths</IC> (JSON) with each category&apos;s full path, e.g. <IC>&quot;News/Local&quot;</IC></td></tr>
                  <tr><td className="px-4 py-2.5 font-mono">taxonomies</td><td className="px-4 py-2.5"><IC>taxonomies</IC> (JSON <IC>{'{ "<taxonomy>": ["term", …] }'}</IC>) for custom taxonomies — only on the types that use them</td></tr>
                  <tr><td className="px-4 py-2.5 font-mono">authors</td><td className="px-4 py-2.5">A <IC>wp_author</IC> content type (<IC>login</IC>, <IC>display_name</IC>, <IC>first_name</IC>, <IC>last_name</IC>) and an <IC>author_ref</IC> relation on posts. Authors become content, not user accounts, and their email is not imported.</td></tr>
                  <tr><td className="px-4 py-2.5 font-mono">comments</td><td className="px-4 py-2.5">A <IC>wp_comment</IC> content type (<IC>author_name</IC>, <IC>content</IC> with HTML stripped, <IC>date</IC>, <IC>post_wp_id</IC>, <IC>post_type</IC>, <IC>parent_wp_id</IC>, <IC>wp_id</IC>, plus a <IC>post</IC> relation when every comment targets one content type). Approved comments only; commenter email, URL and IP are never imported.</td></tr>
                  <tr><td className="px-4 py-2.5 font-mono">pendingComments</td><td className="px-4 py-2.5">With <IC>comments</IC>: also import pending comments, as <IC>pending_review</IC> entries</td></tr>
                </tbody>
              </table>
            </div>
            <CodeBlock code={`POST /api/import/wordpress?dryRun=true      # multipart "file" → summary, nothing written
POST /api/import/wordpress?importMedia=true&overwrite=true   # → { jobId }
POST /api/import/wordpress?authors=true&comments=true&pendingComments=true&categoryPaths=true&taxonomies=true
GET  /api/import/wordpress/:jobId           # status and result`} />
          </Section>

          {/* ── AI ────────────────────────────────────────────────────────── */}
          <Section id="ai" title="AI Assistant & MCP" icon={Zap}>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Set <IC>ANTHROPIC_API_KEY</IC> on the backend (optionally <IC>AI_MODEL</IC>, default <IC>claude-opus-5-5</IC>) to turn on
              <strong className="text-foreground"> Generate with AI</strong> on the new content type page and
              <strong className="text-foreground"> Draft with AI</strong> in the entry editor. Suggestions are validated against the field
              rules and filled into the form — nothing is saved until you save. The prompt and the content type's fields are sent to
              the Claude API. Endpoints: <IC>GET /api/ai/status</IC>, <IC>POST /api/ai/content-model</IC> (admin),
              <IC>POST /api/ai/draft</IC> (contributor+), rate-limited.
            </p>
            <h3 className="font-semibold mb-2">MCP server</h3>
            <p className="text-muted-foreground text-sm mb-2">
              The CLI includes a Model Context Protocol server so AI assistants (Claude Desktop, Claude Code, Cursor…) can read your
              content and draft entries. Tools: <IC>list_content_types</IC>, <IC>list_entries</IC>, <IC>get_entry</IC>,
              <IC>create_entry</IC> (drafts by default), <IC>update_entry</IC>, <IC>graphql</IC>. Without a key it is read-only.
            </p>
            <CodeBlock code={`{
  "mcpServers": {
    "nodepress": {
      "command": "npx",
      "args": ["-y", "create-nodepress-app", "mcp"],
      "env": { "NODEPRESS_URL": "https://cms.example.com", "NODEPRESS_API_KEY": "np_..." }
    }
  }
}`} />
          </Section>

          {/* ── Search ────────────────────────────────────────────────────── */}
          <Section id="search" title="Search Engine" icon={Database}>
            <p className="text-muted-foreground leading-relaxed mb-4">
              <IC>?search=</IC> uses Postgres full-text search by default — nothing to run. For typo-tolerant ranked search set
              <IC> SEARCH_DRIVER=meilisearch</IC>, <IC>MEILISEARCH_URL</IC> and <IC>MEILISEARCH_KEY</IC> (or use
              <IC> docker-compose.search.yml</IC>), then rebuild the index once from <strong className="text-foreground">Settings → Email &amp; storage</strong>
              (or <IC>POST /api/search/reindex</IC>). Every entry write keeps it current through the job queue. Searches with
              <IC> fallback=true</IC>, and any search while Meilisearch is unreachable, use Postgres; <IC>meta.searchMode</IC> says which answered.
            </p>
          </Section>

          {/* ── Email & storage ───────────────────────────────────────────── */}
          <Section id="email-storage" title="Email & Storage Settings" icon={Server}>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Email (SMTP) and file storage (local disk or any S3-compatible bucket — AWS S3, Cloudflare R2, DigitalOcean Spaces,
              MinIO, Backblaze B2) can be set up in the setup wizard's optional steps and later under
              <strong className="text-foreground"> Settings → Email &amp; storage</strong>, with <em>Send test</em> and <em>Test connection</em>
              buttons. Passwords and secret keys are stored encrypted (key: <IC>SETTINGS_SECRET</IC>, else <IC>JWT_SECRET</IC> — changing
              it means re-entering them). <IC>SMTP_*</IC> and <IC>STORAGE_*</IC> environment variables still take precedence and make the
              matching section read-only. Email changes apply at once; a storage change applies after a restart (existing files aren't moved).
            </p>
          </Section>

          <Section id="self-hosting" title="Self-Hosting" icon={Server}>
            <p className="text-muted-foreground leading-relaxed mb-4">
              NodePress runs anywhere Node.js does. There are two ways to go live —
              pick whichever fits how much you want to manage. Either way you need a{' '}
              <strong className="text-foreground">PostgreSQL database</strong> and, for production,{' '}
              <strong className="text-foreground">S3-compatible storage</strong> for media (see below).
            </p>

            <h3 className="font-semibold mb-2">One-line install with automatic HTTPS</h3>
            <p className="text-muted-foreground text-sm mb-2">
              On a Linux server with Docker (Compose v2.24+), this clones NodePress, writes <IC>.env</IC> and starts the stack. With
              <IC> DOMAIN</IC>, Caddy gets a Let's Encrypt certificate (<IC>docker-compose.https.yml</IC>) — point the domain's DNS at the
              server first. Run it again to update. Or use the <strong className="text-foreground">Deploy to Render</strong> button in the
              README (<IC>render.yaml</IC>).
            </p>
            <CodeBlock code={`curl -fsSL https://raw.githubusercontent.com/buildwithkode/nodepress/main/scripts/install.sh \\
  | DOMAIN=cms.example.com ACME_EMAIL=you@example.com bash`} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 mt-6">
              <div className="rounded-xl border border-border p-4">
                <p className="text-sm font-semibold mb-1">Path A — Docker on your own server</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  A VPS (DigitalOcean, Hetzner, Linode…) with the bundled{' '}
                  <IC>docker-compose.prod.yml</IC> — Postgres, Redis, nginx, Prometheus + Grafana,
                  and automated DB backups in one command. Most control, one machine to manage.
                </p>
              </div>
              <div className="rounded-xl border border-border p-4">
                <p className="text-sm font-semibold mb-1">Path B — Any managed host (PaaS)</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Render, Railway, Fly.io, DigitalOcean App Platform, etc. Deploy the backend and
                  frontend as two web services from GitHub + a managed Postgres. No server to patch.
                </p>
              </div>
            </div>

            {/* Path B — generic, works on ANY host */}
            <h3 className="font-semibold mb-3">Deploy to any managed host (Path B)</h3>
            <p className="text-muted-foreground text-sm mb-3">
              These steps are host-agnostic — only the dashboard differs between Render, Railway,
              Fly, DigitalOcean App Platform, and the like.
            </p>
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 mb-4 text-sm">
              <strong className="text-blue-400">Why two services?</strong>
              <p className="text-muted-foreground mt-1 leading-relaxed">
                NodePress is two programs — a NestJS API and a Next.js frontend. Locally{' '}
                <IC>npm run dev</IC> just launches both at once with <IC>concurrently</IC> (API on{' '}
                <IC>:3000</IC>, frontend on <IC>:5173</IC>), so it <em>looks</em> like one command.
                Managed hosts run one process per service, so each gets its own service from the same
                repo. Prefer a single command on one box? Use the Docker path below — nginx serves both
                behind one URL.
              </p>
            </div>
            <div className="rounded-xl border border-border p-5 mb-5 bg-muted/20 space-y-2 text-sm text-muted-foreground">
              {[
                ['1. Push to GitHub', 'Commit your project and push it to a GitHub repo — most hosts deploy from there. Keep .env out of git (the scaffold already gitignores it).'],
                ['2. Provision Postgres + storage', 'Create a managed PostgreSQL (Neon, Supabase, or the host’s own add-on) and an S3-compatible bucket (Cloudflare R2 recommended). Copy the connection string + bucket keys.'],
                ['3. Deploy the backend service', 'Root directory backend. Build: npm install && npx prisma generate && npm run build. Start: npx prisma migrate deploy && npm run start:prod. The host injects PORT automatically.'],
                ['4. Deploy the frontend service', 'Root directory frontend. Build: npm install && npm run build. Start: npx next start -p $PORT.'],
                ['5. Wire the URLs', 'Deploy the backend first, take its public URL, then set the frontend’s BACKEND_URL to it, set the backend’s APP_URL to its own public URL, and its SITE_URL / CORS_ORIGIN to the frontend’s URL. Redeploy.'],
                ['6. Create the first admin', 'Open https://your-frontend-url/setup and register — it only works while the database has zero users.'],
              ].map(([step, desc]) => (
                <div key={step} className="flex gap-3">
                  <span className="font-medium text-foreground w-44 shrink-0">{step}</span>
                  <span>{desc}</span>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 mb-6 text-sm">
              <strong className="text-amber-400">Three things that break a first launch</strong>
              <ul className="text-muted-foreground mt-1 space-y-1 list-disc pl-4">
                <li><IC>JWT_SECRET</IC> must be <strong className="text-foreground">≥32 characters</strong> — otherwise the backend exits on boot.</li>
                <li>Use <IC>STORAGE_DRIVER=s3</IC> in production. On managed hosts the local disk is wiped on every redeploy, so local uploads disappear while the <IC>Media</IC> rows survive — broken images.</li>
                <li>Replace every <IC>localhost</IC> URL (<IC>BACKEND_URL</IC>, <IC>APP_URL</IC>, <IC>CORS_ORIGIN</IC>, <IC>SITE_URL</IC>) with the real public URLs, or the live site can’t reach the API.</li>
              </ul>
            </div>

            <h3 className="font-semibold mb-3">Deploy with Docker on a VPS (Path A)</h3>
            <p className="text-muted-foreground text-sm mb-3">
              Scaffold with <IC>--docker</IC> (or copy <IC>docker-compose.prod.yml</IC> + <IC>nginx/</IC>{' '}
              from the repo), fill in <IC>backend/.env</IC>, then start the whole stack — Postgres, nginx,
              and backups included — with one command:
            </p>
            <CodeBlock code={`# On your server (Docker installed)
git clone <your-repo> && cd <your-project>
# edit backend/.env  (set DATABASE_URL, JWT_SECRET, APP_URL, S3 keys…)
npm run docker:prod        # docker-compose -f docker-compose.prod.yml up -d --build
# then open https://yourdomain.com/setup`} />
            <p className="text-muted-foreground text-sm mb-6">
              Front it with HTTPS via your own certs in <IC>nginx/</IC>, Caddy, or Cloudflare (orange-cloud
              the DNS record for automatic SSL).
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
                    ['JWT_SECRET',           '64+ char random secret for signing tokens (auto-generated by the CLI, and by docker-compose.yml on first boot when unset)'],
                    ['JWT_EXPIRES_IN',       'Access token lifetime — default 7d. Refresh tokens last 30 days (HttpOnly cookie, rotated on use).'],
                    ['PORT',                 'API port (default 3000). In local dev the frontend reads it from backend/.env automatically, so changing it needs no other edits'],
                    ['CORS_ORIGIN',          'Frontend origin(s) allowed in CORS headers, comma-separated — never the backend’s own URL. Enforced in production; in development any localhost / 127.0.0.1 port is allowed'],
                    ['APP_URL',              'Backend’s own public URL — used in API responses and media URLs. In development a localhost value is kept in sync with PORT'],
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
                    ['REDIS_URL',            'Redis connection URL (optional). Shares cache, rate limits and realtime events across backend instances — required when running more than one.'],
                    ['TRUST_PROXY',          'Which reverse proxies may set X-Forwarded-For (default: private networks — Docker nginx, k8s ingress). Without it every client looks like the proxy and is rate-limited together. Use a hop count such as 2 behind Cloudflare → nginx.'],
                    ['DATABASE_REPLICA_URL', 'Postgres read replica (optional). Public content API reads (GET /api/{type}, /api/{type}/{slug}) go to it; writes, the admin panel and previews stay on the primary. For a few seconds after any write, reads use the primary so the replica can\'t re-cache stale data.'],
                    ['REPLICA_READ_AFTER_WRITE_MS', 'How long reads stay on the primary after a write when a replica is configured (default 5000).'],
                    ['HEALTH_MAX_HEAP_MB',   'GET /api/health reports "down" (HTTP 503) above this heap size. Default: 90% of the Node heap limit.'],
                    ['DB_POOL_SIZE',         'docker-compose.prod.yml only: Prisma connections per backend replica through PgBouncer (default 10).'],
                    ['METRICS_TOKEN',        'Bearer token to protect GET /api/metrics (optional but recommended in production)'],
                    ['CAPTCHA_PROVIDER',     'Captcha provider for form spam protection: turnstile | hcaptcha | recaptcha (optional)'],
                    ['CAPTCHA_SECRET_KEY',   'Server-side secret from your captcha provider dashboard (required when CAPTCHA_PROVIDER is set)'],
                    ['AUDIT_LOG_RETENTION_DAYS', 'How many days to keep audit log entries before pruning — default 90 (optional)'],
                    ['PLUGIN_REGISTRY_URL',  'Plugin directory for the Plugins → Browse tab (default: plugins-registry.json in the NodePress GitHub repo). Empty disables it (optional)'],
                    ['REDIRECTS_ON_SLUG_CHANGE', 'Add a 301 from the old path when a published entry\'s slug changes — default true; false turns it off (optional)'],
                    ['SENTRY_DSN',           'Sentry DSN for backend error tracking (optional; requires scaffolding with --sentry, or installing the @sentry packages)'],
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
                    ['BACKEND_URL',              'Backend URL used by Next.js server components and the /api proxy (e.g. http://backend:3000 in Docker). Locally it is auto-detected from PORT in backend/.env'],
                    ['NEXT_PUBLIC_API_URL',      'Browser-reachable backend URL for the realtime (Socket.io) connection. Auto-set for a local backend; set it explicitly when the backend is remote'],
                    ['NEXT_PUBLIC_SENTRY_DSN',   'Sentry DSN for frontend error tracking — enables Session Replay and client-side error capture (optional; requires scaffolding with --sentry, or installing @sentry/nextjs)'],
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

            <h3 className="font-semibold mb-3 mt-6">CDN caching</h3>
            <p className="text-muted-foreground text-sm mb-3">
              Public API reads of published content are sent with{' '}
              <IC>Cache-Control: public, max-age=0, s-maxage=…</IC>: browsers revalidate every time (a cheap{' '}
              <IC>304</IC> via the ETag), while a CDN such as Cloudflare or Fastly keeps the response. Each response also
              carries <IC>Cache-Tag</IC> (Cloudflare) and <IC>Surrogate-Key</IC> (Fastly) headers —{' '}
              <IC>np-all</IC> plus <IC>np-ct-&lt;contentTypeId&gt;</IC>. With a purge driver configured, every write
              purges just the content types it changed (batched over 2 seconds, retried through the job queue), so
              responses can be cached for an hour and still update within seconds of a publish.
            </p>
            <CodeBlock code={`# backend/.env — pick one driver
CDN_PURGE_DRIVER=cloudflare          # none (default) | cloudflare | fastly | webhook
CLOUDFLARE_ZONE_ID=...
CLOUDFLARE_API_TOKEN=...             # token with Zone → Cache Purge

# CDN_PURGE_DRIVER=fastly
# FASTLY_SERVICE_ID=...
# FASTLY_API_TOKEN=...               # purge_select scope

# CDN_PURGE_DRIVER=webhook           # Vercel, Netlify, Varnish, your own purger
# CDN_PURGE_WEBHOOK_URL=https://example.com/purge
# CDN_PURGE_WEBHOOK_SECRET=...       # body signed: X-NodePress-Signature: sha256=<hmac>

# CDN_CACHE_TTL=3600                 # s-maxage; default 3600 with a driver, 30 without`} />
            <p className="text-muted-foreground text-sm mt-3">
              A purge of everything uses the <IC>np-all</IC> tag, never Cloudflare&apos;s purge-everything, so the rest of
              your zone stays cached. Draft and staging reads are <IC>private</IC> and never tagged.
            </p>

            <h3 className="font-semibold mb-3 mt-6">Backup &amp; restore</h3>
            <p className="text-muted-foreground text-sm mb-3">
              <IC>npm run backup</IC> writes one archive with the database (a <IC>pg_dump</IC>), the uploads
              folder (when <IC>STORAGE_DRIVER=local</IC>) and a manifest of the version and migrations. It uses{' '}
              <IC>DIRECT_URL</IC> when set, because a transaction-mode pooler can&apos;t run <IC>pg_dump</IC>.
              Archives contain password hashes and API keys, so they are created readable by you only — store
              them privately. With S3 storage, back up the bucket with your provider&apos;s tools.
            </p>
            <CodeBlock code={`npm run backup                              # → backups/nodepress-<timestamp>.tar.gz
npm run backup -- --out /mnt/backups         # choose the folder

npm run restore -- backups/nodepress-20261019-093614.tar.gz`} />
            <p className="text-muted-foreground text-sm mt-3 mb-2">Restore is guarded so it can&apos;t silently destroy data:</p>
            <ul className="text-muted-foreground text-sm space-y-1 list-disc pl-4 mb-3">
              <li>It shows the target database and asks you to type its name (<IC>--yes</IC> skips this in scripts).</li>
              <li>It refuses a database that already has users, a backup from a newer NodePress version, or one with migrations your code doesn&apos;t have — <IC>--force</IC> overrides.</li>
              <li>The database is restored in a single transaction, then <IC>prisma migrate deploy</IC> brings an older backup up to date.</li>
            </ul>
            <p className="text-muted-foreground text-sm">
              Requires the PostgreSQL client tools (<IC>pg_dump</IC>, <IC>pg_restore</IC>, <IC>psql</IC>). The
              production Docker stack also runs a nightly database dump (2am UTC, 30-day retention).
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

            <h3 className="font-semibold mb-3 mt-6">Authentication &amp; Token Integration Guide</h3>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-foreground space-y-2 mb-6">
              <p className="font-semibold text-emerald-400">💡 Do I need a token for every API when integrating with a frontend?</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                <strong>No!</strong> For public websites and visitor frontends (Next.js, React, Astro, Vue, Svelte, or mobile apps),
                <strong className="text-foreground"> content reading and form submissions require ZERO authentication tokens</strong>.
                Anyone can fetch published content directly from the browser or server without passing headers or secret keys.
              </p>
            </div>

            <div className="grid gap-3 mb-6">
              <div className="rounded-xl border border-border bg-card p-4 text-xs space-y-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded font-bold font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">Tier 1: Public Read APIs</span>
                  <span className="text-muted-foreground font-mono">No Token Required (Zero Auth)</span>
                </div>
                <p className="text-muted-foreground">
                  Used by consumer-facing frontends to render blog posts, product catalogs, pages, brand settings, sitemaps, and accept public form submissions.
                </p>
                <div className="font-mono text-foreground bg-zinc-950 p-2.5 rounded border border-zinc-800 space-y-1">
                  <div>GET  /api/:contentType       <span className="text-muted-foreground">// e.g. /api/posts, /api/products</span></div>
                  <div>GET  /api/:contentType/:slug  <span className="text-muted-foreground">// e.g. /api/posts/my-post</span></div>
                  <div>GET  /api/brand              <span className="text-muted-foreground">// Public logo, name, colors</span></div>
                  <div>POST /api/submit/:formSlug   <span className="text-muted-foreground">// Protected by honeypot &amp; spam shield</span></div>
                  <div>GET  /api/sitemap.xml        <span className="text-muted-foreground">// Dynamic SEO sitemap</span></div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-4 text-xs space-y-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded font-bold font-mono bg-amber-500/10 text-amber-400 border border-amber-500/30">Tier 2: Headless Frontends &amp; Jamstack</span>
                  <span className="text-muted-foreground font-mono">X-API-Key: np_live_...</span>
                </div>
                <p className="text-muted-foreground">
                  For static site generation (Astro, Next.js build-time SSG), CI/CD content sync pipelines, or external microservices that need scoped access or draft preview without managing user credentials.
                </p>
                <div className="font-mono text-foreground bg-zinc-950 p-2.5 rounded border border-zinc-800 space-y-1">
                  <div>Header: <span className="text-amber-400">X-API-Key: np_live_...</span></div>
                  <div className="text-muted-foreground">Manage scoped keys in Admin Panel &rarr; Settings &rarr; API Keys</div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-4 text-xs space-y-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded font-bold font-mono bg-blue-500/10 text-blue-400 border border-blue-500/30">Tier 3: Admin &amp; Content Mutations</span>
                  <span className="text-muted-foreground font-mono">Authorization: Bearer &lt;JWT&gt;</span>
                </div>
                <p className="text-muted-foreground">
                  Required for creating, updating, deleting entries, uploading media files, managing schema, and inviting users. Authenticated via JWT obtained from <IC>POST /api/auth/login</IC>.
                </p>
                <div className="font-mono text-foreground bg-zinc-950 p-2.5 rounded border border-zinc-800 space-y-1">
                  <div>Header: <span className="text-blue-400">Authorization: Bearer eyJhbGciOi...</span></div>
                  <div className="text-muted-foreground">Admin panel rotates access tokens automatically via HttpOnly refresh cookie</div>
                </div>
              </div>
            </div>

            <h4 className="font-semibold text-sm mb-2 text-foreground">Frontend Code Examples</h4>
            <p className="text-xs text-muted-foreground mb-1">
              <strong>1. Public Vanilla Fetch (Zero Token):</strong> Works anywhere in Next.js Server Components, React, Vue, Svelte, or vanilla JS:
            </p>
            <CodeBlock code={`// Zero headers, zero authentication required!
const res = await fetch('http://localhost:3001/api/posts?status=published');
const { data: posts, meta } = await res.json();

console.log(\`Fetched \${posts.length} published posts (Total: \${meta.total})\`);`} />

            <p className="text-xs text-muted-foreground mt-4 mb-1">
              <strong>2. Built-in Frontend SDK (<IC>@/lib/nodepress</IC>):</strong> Pre-configured typed client helpers:
            </p>
            <CodeBlock code={`import { fetchEntries, fetchEntry } from '@/lib/nodepress';

// List entries with automatic pagination & sorting
const { data: articles } = await fetchEntries({
  type: 'blog',
  page: 1,
  limit: 10,
  sort: 'createdAt:desc',
});

// Fetch single entry by slug (ideal for generateStaticParams or dynamic routes)
const post = await fetchEntry({
  type: 'blog',
  slug: 'hello-world',
});`} />

            <p className="text-xs text-muted-foreground mt-4 mb-1">
              <strong>3. External SSG Build with API Key:</strong>
            </p>
            <CodeBlock code={`// Server-side static generation build or microservice
const res = await fetch('http://localhost:3001/api/entries?contentTypeId=articles', {
  headers: {
    'X-API-Key': process.env.NODEPRESS_API_KEY, // e.g. np_live_...
  },
  next: { revalidate: 3600 },
});
const entries = await res.json();`} />

            <h3 className="font-semibold mb-3 mt-6">Token lifecycle</h3>
            <p className="text-muted-foreground text-sm mb-3">
              Login returns a <strong className="text-foreground">JWT access token (7 days)</strong> and
              sets an <IC>HttpOnly SameSite=Lax</IC> refresh cookie valid for <strong className="text-foreground">30 days</strong>.
              The admin frontend silently calls <IC>POST /api/auth/refresh</IC> when a 401 is received,
              obtains a new access token, and retries the original request — completely transparent to the user.
              After 30 days, or after calling <IC>POST /api/auth/logout</IC>, the user must log in again.
            </p>

            <h3 className="font-semibold mb-3 mt-6">Single sign-on (OpenID Connect)</h3>
            <p className="text-muted-foreground text-sm mb-3">
              Let your team sign in with Google Workspace, Microsoft Entra ID, Okta, Auth0, Keycloak or any OpenID
              Connect provider. When configured, the login page shows a <strong className="text-foreground">Continue with …</strong>{' '}
              button next to the password form. Register this redirect URI with the provider:{' '}
              <IC>https://&lt;your-admin-site&gt;/api/auth/oidc/callback</IC>.
            </p>
            <CodeBlock code={`# backend/.env
OIDC_ISSUER=https://accounts.google.com            # Entra: https://login.microsoftonline.com/<tenant-id>/v2.0
OIDC_CLIENT_ID=...
OIDC_CLIENT_SECRET=...
OIDC_PROVIDER_NAME=Google                          # button label

# Optional
OIDC_ALLOWED_DOMAINS=acme.com,acme.co.uk           # only these email domains
OIDC_AUTO_CREATE=true                              # create accounts on first sign-in (default: invite-only)
OIDC_DEFAULT_ROLE=viewer                           # role for auto-created users
OIDC_ROLE_CLAIM=groups                             # map provider groups to roles…
OIDC_ROLE_MAP=cms-admins:admin,cms-editors:editor  # …highest match wins, re-applied at every sign-in
# OIDC_REDIRECT_URI=...                            # override the default <SITE_URL>/api/auth/oidc/callback`} />
            <ul className="text-muted-foreground text-sm space-y-1.5 list-disc pl-4 mb-3 mt-3">
              <li>Uses the authorization-code flow with PKCE, <IC>state</IC> and <IC>nonce</IC>; the ID token&apos;s signature (provider JWKS), issuer, audience and expiry are verified.</li>
              <li>Users are matched by email. By default only existing (invited) users can sign in; set <IC>OIDC_AUTO_CREATE=true</IC> to create accounts automatically. Emails the provider marks as unverified are refused.</li>
              <li>The issuer must match exactly, so use a single-tenant issuer for Microsoft (your tenant ID, not <IC>common</IC>).</li>
              <li>Password login keeps working (useful as a break-glass admin account). SSO sign-ins don&apos;t ask for NodePress 2FA — enforce MFA at your identity provider.</li>
              <li>Endpoints: <IC>GET /api/auth/oidc/config</IC>, <IC>GET /api/auth/oidc/login</IC>, <IC>GET /api/auth/oidc/callback</IC>, <IC>POST /api/auth/oidc/exchange</IC>.</li>
            </ul>

            <h3 className="font-semibold mb-3 mt-6">Two-Factor Authentication (2FA / TOTP)</h3>
            <p className="text-muted-foreground text-sm mb-3">
              NodePress has built-in RFC 6238 TOTP Two-Factor Authentication compatible with Google Authenticator, 1Password, Authy, and Apple Keychain.
            </p>
            <div className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground space-y-2 mb-4">
              <p><strong className="text-foreground">🔒 Default State:</strong> 2FA starts disabled by default for new accounts so users are never locked out before scanning their QR code.</p>
              <p><strong className="text-foreground">📱 Enabling 2FA:</strong> Navigate to <IC>Users → Security</IC> in the admin panel, scan the QR code with your authenticator app, and confirm with a 6-digit code.</p>
              <p><strong className="text-foreground">🔑 Backup Recovery Codes:</strong> When enabling 2FA, 8 single-use recovery codes are generated. If you lose access to your authenticator app, any of these codes will grant emergency login.</p>
            </div>

            <h3 className="font-semibold mb-3 mt-6">Emergency Admin Recovery CLI (<IC>npm run reset-admin</IC>)</h3>
            <p className="text-muted-foreground text-sm mb-3">
              If you forget your admin password, get locked out by 2FA, or lose access to your device, you can instantly reset your admin account directly from the server terminal:
            </p>
            <CodeBlock code={`# In backend directory:
npm run reset-admin <email> <newpassword>

# Example:
npm run reset-admin admin@nodepress.com MySecurePassword123!`} />
            <p className="text-muted-foreground text-xs mb-3">
              This command hashes the new password with bcrypt (10 rounds), resets any locked 2FA states, and creates the admin account if it does not already exist.
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
              <Endpoint method="GET"    path="/api/{type}"               desc="List entries — ?page or ?cursor (keyset, from meta.nextCursor), ?limit (max 100), ?sort=createdAt:desc, ?search=term (GIN-indexed full-text), ?where[field][op]=val (advanced filters: eq, ne, gt, gte, lt, lte, contains, in, notIn, OR, AND), ?fields=title,slug (projection), ?populate=author,author.company ($O(depth)$ batched lookups). ETag + Cache-Control: public, max-age=30." />
              <Endpoint method="GET"    path="/api/{type}/{slug}"        desc="Get a single entry — ?fields=title,slug, ?populate=author,author.company. ETag + Cache-Control: public, max-age=30." />
              <Endpoint method="GET"    path="/api/{type}/{slug}/preview" desc="Preview any entry (draft/archived) using a signed token — ?token=<token>. Token generated by POST /api/entries/:id/preview-url." />
              <Endpoint method="POST"   path="/api/{type}"               desc="Create a new entry — JWT callers need the role's create permission on the type (and publish unless status: 'draft'); enforces writeRoles" auth />
              <Endpoint method="PUT"    path="/api/{type}/{slug}"        desc="Update an existing entry — JWT callers need update (and publish to promote to published); enforces writeRoles" auth />
              <Endpoint method="DELETE" path="/api/{type}/{slug}"        desc="Delete an entry (soft delete) — JWT callers need delete" auth />
            </div>

            <h3 className="font-semibold mb-3">Auth</h3>
            <div className="rounded-xl border border-border overflow-hidden mb-6">
              <Endpoint method="GET"    path="/api/auth/setup-status"          desc="Check if initial setup is required" />
              <Endpoint method="POST"   path="/api/auth/register"              desc="Create first admin account (setup only)" />
              <Endpoint method="POST"   path="/api/auth/login"                 desc="Login — returns JWT access token (7d) + sets HttpOnly refresh cookie (30d)" />
              <Endpoint method="POST"   path="/api/auth/refresh"               desc="Exchange refresh cookie for a new access token (silent — no user prompt)" />
              <Endpoint method="POST"   path="/api/auth/logout"                desc="Revoke refresh token and clear the cookie" auth />
              <Endpoint method="GET"    path="/api/auth/me"                    desc="Get current user — role (built-in base role) + customRole" auth />
              <Endpoint method="POST"   path="/api/auth/forgot-password"       desc="Request a password reset email (always 200)" />
              <Endpoint method="POST"   path="/api/auth/reset-password"        desc="Set a new password using the reset token" />
            </div>

            <h3 className="font-semibold mb-3">Content Types</h3>
            <div className="rounded-xl border border-border overflow-hidden mb-6">
              <Endpoint method="GET"    path="/api/content-types"              desc="List all content types" auth />
              <Endpoint method="GET"    path="/api/content-types/export"       desc="Export all content type schemas (+ components, choice lists, preview URLs) as a JSON bundle — admin/editor JWT or a full-access API key" auth />
              <Endpoint method="POST"   path="/api/content-types/import"       desc="Import content type schemas, components and choice lists with dryRun pre-flight validation — admin JWT or a full-access API key" auth />
              <Endpoint method="POST"   path="/api/content-types"              desc="Create a content type (supports field-level readRoles & writeRoles)" auth />
              <Endpoint method="PUT"    path="/api/content-types/:id"          desc="Update a content type schema — optional fieldMigrations { renames, convert, drop } and previewUrl" auth />
              <Endpoint method="POST"   path="/api/content-types/:id/schema-impact" desc="Preview what an update would do to existing entries (same body as PUT, changes nothing) — admin only" auth />
              <Endpoint method="GET"    path="/api/content-types/:id/schema-history" desc="Previous schema versions — admin only" auth />
              <Endpoint method="DELETE" path="/api/content-types/:id"          desc="Delete a content type and all its entries" auth />
            </div>

            <h3 className="font-semibold mb-3">Entries (Admin)</h3>
            <div className="rounded-xl border border-border overflow-hidden mb-6">
              <Endpoint method="GET"    path="/api/entries"                    desc="List entries — ?contentTypeId, ?status, ?deleted, ?search, ?page, ?limit" auth />
              <Endpoint method="POST"   path="/api/entries"                    desc="Create an entry — checks the role's permissions on the entry's content type" auth />
              <Endpoint method="GET"    path="/api/entries/:id"                desc="Get a single entry by id" auth />
              <Endpoint method="PUT"    path="/api/entries/:id"                desc="Update an entry (snapshots a version)" auth />
              <Endpoint method="DELETE" path="/api/entries/:id"                desc="Soft-delete — moves to trash" auth />
              <Endpoint method="POST"   path="/api/entries/:id/restore"        desc="Restore a trashed entry" auth />
              <Endpoint method="DELETE" path="/api/entries/:id/purge"          desc="Permanently delete a trashed entry" auth />
              <Endpoint method="GET"    path="/api/entries/:id/versions"              desc="List all version snapshots for an entry" auth />
              <Endpoint method="POST"   path="/api/entries/:id/versions/:vid/restore" desc="Restore entry to a specific version" auth />
              <Endpoint method="POST"   path="/api/entries/:id/preview-url"           desc="Generate a 1-hour signed preview token for any entry status (draft, archived, published)" auth />
              <Endpoint method="GET"    path="/api/entries/export?contentTypeId=X&format=json|csv" desc="Export all entries as JSON array or RFC 4180 CSV spreadsheet" auth />
              <Endpoint method="POST"   path="/api/entries/import"                    desc="Import entries (JSON or CSV) with pre-flight dryRun validation & duplicate resolution" auth />
              <Endpoint method="POST"   path="/api/entries/bulk-publish"              desc="Bulk publish entries — body: { ids: number[] }" auth />
              <Endpoint method="POST"   path="/api/entries/bulk-archive"              desc="Bulk archive entries — body: { ids: number[] }" auth />
              <Endpoint method="POST"   path="/api/entries/bulk-pending-review"       desc="Bulk submit entries for review — body: { ids: number[] }" auth />
              <Endpoint method="POST"   path="/api/entries/bulk-delete"               desc="Bulk soft-delete entries — body: { ids: number[] }" auth />
            </div>
            <p className="text-muted-foreground text-xs mb-6 -mt-4">
              Bulk routes check the role&apos;s permission on every affected content type; any denial is a <IC>403</IC> with{' '}
              <IC>forbiddenContentTypes</IC> and nothing is changed.
            </p>

            <h3 className="font-semibold mb-3">Media</h3>
            <div className="rounded-xl border border-border overflow-hidden mb-6">
              <Endpoint method="GET"    path="/api/media"                                  desc="List media files — ?page, ?limit, ?folderId (null=unfiled)" />
              <Endpoint method="GET"    path="/api/media/:filename/transform"              desc="On-the-fly resize/convert: ?w, ?h (snapped to size buckets), ?q, ?format (auto|webp|avif|jpeg|png), ?fit, ?fp — cached" />
              <Endpoint method="GET"    path="/api/media/:filename/resize"                 desc="Alias for /transform" />
              <Endpoint method="PUT"    path="/api/media/:filename/focal-point"            desc="Set the focal point for cover crops — body: { x, y } (0–1), nulls clear it" auth />
              <Endpoint method="POST"   path="/api/media/upload"                           desc="Upload a file (multipart/form-data)" auth />
              <Endpoint method="DELETE" path="/api/media/:filename"                        desc="Delete a file" auth />
              <Endpoint method="GET"    path="/api/media/folders"                          desc="List all media folders (flat list)" auth />
              <Endpoint method="POST"   path="/api/media/folders"                          desc="Create a folder — body: { name, parentId? }" auth />
              <Endpoint method="DELETE" path="/api/media/folders/:id"                      desc="Delete a folder (cascades sub-folders; files become unfiled)" auth />
              <Endpoint method="PUT"    path="/api/media/:filename/folder"                 desc="Move file to folder — body: { folderId } (null = root)" auth />
            </div>

            <h3 className="font-semibold mb-3">Plugins & Hooks</h3>
            <div className="rounded-xl border border-border overflow-hidden mb-6">
              <Endpoint method="GET"    path="/api/plugins"                    desc="List registered plugins and active hook metrics" auth />
              <Endpoint method="GET"    path="/api/plugins/hooks"              desc="List registered lifecycle hook listeners and data filters" auth />
              <Endpoint method="GET"    path="/api/plugins/registry"           desc="Plugin directory (PLUGIN_REGISTRY_URL) with installed/compatible flags — ?refresh=true — admin only" auth />
              <Endpoint method="POST"   path="/api/plugins/registry/:id/install" desc="Download, verify (sha256, signature) and install a directory plugin — ?dryRun=true reviews only — admin only" auth />
            </div>

            <h3 className="font-semibold mb-3">Webhooks</h3>
            <div className="rounded-xl border border-border overflow-hidden mb-6">
              <Endpoint method="GET"    path="/api/webhooks"                   desc="List webhooks" auth />
              <Endpoint method="POST"   path="/api/webhooks"                   desc="Create a webhook" auth />
              <Endpoint method="DELETE" path="/api/webhooks/:id"               desc="Delete a webhook" auth />
              <Endpoint method="PATCH"  path="/api/webhooks/:id/toggle"        desc="Enable or disable a webhook" auth />
              <Endpoint method="POST"   path="/api/webhooks/:id/ping"          desc="Send a test ping to the webhook URL" auth />
              <Endpoint method="GET"    path="/api/webhooks/deliveries"        desc="List delivery log & DLQ — ?status, ?webhookId, ?page, ?limit" auth />
              <Endpoint method="POST"   path="/api/webhooks/deliveries/:id/retry" desc="1-Click immediate re-delivery of a delivery payload" auth />
            </div>

            <h3 className="font-semibold mb-3">Background Jobs</h3>
            <div className="rounded-xl border border-border overflow-hidden mb-6">
              <Endpoint method="GET"    path="/api/jobs"                       desc="List jobs with status counts — ?status=all|pending|done|failed, ?type, ?page, ?limit — admin only" auth />
              <Endpoint method="POST"   path="/api/jobs/:id/retry"             desc="Run a failed job again now with fresh attempts — admin only" auth />
              <Endpoint method="POST"   path="/api/jobs/retry-failed"          desc="Requeue every failed job (optionally ?type=) — admin only" auth />
              <Endpoint method="DELETE" path="/api/jobs/:id"                   desc="Delete a done or failed job — admin only" auth />
            </div>

            <h3 className="font-semibold mb-3">Languages</h3>
            <div className="rounded-xl border border-border overflow-hidden mb-6">
              <Endpoint method="GET"    path="/api/locales"                    desc="Enabled content languages and the default (public)" />
              <Endpoint method="PUT"    path="/api/locales"                    desc="Set enabled languages + default — body: { locales: ['en','fr'], defaultLocale: 'en' } — admin only" auth />
              <Endpoint method="GET"    path="/api/locales/usage"              desc="Entries per locale" auth />
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
              <Endpoint method="POST"   path="/api/users"                      desc="Invite a user — body: { email, role } (built-in or custom role) — admin only" auth />
              <Endpoint method="PUT"    path="/api/users/:id/role"             desc="Change a user's role — admin only" auth />
              <Endpoint method="DELETE" path="/api/users/:id"                  desc="Delete a user — cannot delete self or last admin" auth />
              <Endpoint method="POST"   path="/api/users/:id/invite"           desc="Send a 'Set Your Password' invitation email — admin only (no-op if SMTP not configured)" auth />
              <Endpoint method="PUT"    path="/api/users/me/password"          desc="Change your own password (requires current password)" auth />
            </div>

            <h3 className="font-semibold mb-3">Roles</h3>
            <div className="rounded-xl border border-border overflow-hidden mb-6">
              <Endpoint method="GET"    path="/api/roles"                      desc="List custom roles — admin only" auth />
              <Endpoint method="POST"   path="/api/roles"                      desc="Create — body: { name, label, baseRole: editor|contributor|viewer, description? } — admin only" auth />
              <Endpoint method="PUT"    path="/api/roles/:name"                desc="Change label, description or base role (reseeds the * row unless customised) — returns warnings[] — admin only" auth />
              <Endpoint method="DELETE" path="/api/roles/:name"                desc="Delete — 409 { userCount } while users have it — admin only" auth />
            </div>

            <h3 className="font-semibold mb-3">Components</h3>
            <div className="rounded-xl border border-border overflow-hidden mb-6">
              <Endpoint method="GET"    path="/api/components"                 desc="List components (signed-in users)" auth />
              <Endpoint method="GET"    path="/api/components/:id"             desc="One component with usage[]" auth />
              <Endpoint method="POST"   path="/api/components"                 desc="Create a component — admin only" auth />
              <Endpoint method="PUT"    path="/api/components/:id"             desc="Update and propagate to content types — optional fieldMigrations (component field names) — admin only" auth />
              <Endpoint method="DELETE" path="/api/components/:id"             desc="Delete (409 while in use) — admin only" auth />
            </div>

            <h3 className="font-semibold mb-3">Choice Lists</h3>
            <div className="rounded-xl border border-border overflow-hidden mb-6">
              <Endpoint method="GET"    path="/api/choice-lists/:name"         desc="One list — { name, label, choices } (public, cached 60 s)" />
              <Endpoint method="GET"    path="/api/choice-lists?names=a,b"     desc="Several lists by name, max 50 (public, cached 60 s)" />
              <Endpoint method="GET"    path="/api/choice-lists"               desc="Every list with usage — admin only" auth />
              <Endpoint method="POST"   path="/api/choice-lists"               desc="Create a list — admin only" auth />
              <Endpoint method="PUT"    path="/api/choice-lists/:id"           desc="Update and propagate to content types and components — reports removedValuesInUse — admin only" auth />
              <Endpoint method="DELETE" path="/api/choice-lists/:id"           desc="Delete (409 while in use) — admin only" auth />
            </div>

            <h3 className="font-semibold mb-3">Redirects</h3>
            <div className="rounded-xl border border-border overflow-hidden mb-6">
              <Endpoint method="GET"    path="/api/redirects/resolve?path="    desc="Resolve a path — { to, statusCode } or 404 (public)" />
              <Endpoint method="GET"    path="/api/redirects"                  desc="List — ?search, ?page, ?limit, ?sort (flushes buffered hits first) — editor/admin" auth />
              <Endpoint method="POST"   path="/api/redirects"                  desc="Create — { from, to?, statusCode? } — editor/admin" auth />
              <Endpoint method="PATCH"  path="/api/redirects/:id"              desc="Update — editor/admin" auth />
              <Endpoint method="DELETE" path="/api/redirects/:id"              desc="Delete — editor/admin" auth />
              <Endpoint method="POST"   path="/api/redirects/import"           desc="CSV import — { csv, dryRun? } — editor/admin" auth />
              <Endpoint method="GET"    path="/api/redirects/export"           desc="CSV export — editor/admin" auth />
            </div>

            <h3 className="font-semibold mb-3">Import (WordPress)</h3>
            <div className="rounded-xl border border-border overflow-hidden mb-6">
              <Endpoint method="POST"   path="/api/import/wordpress"           desc="Upload a WXR file (multipart file, ≤50 MB) — ?dryRun=true summary, ?importMedia, ?overwrite, ?categoryPaths, ?taxonomies, ?authors, ?comments, ?pendingComments; a real run returns { jobId } — admin only" auth />
              <Endpoint method="GET"    path="/api/import/wordpress/:jobId"    desc="Import job status and result — admin only" auth />
            </div>

            <h3 className="font-semibold mb-3">OpenAPI</h3>
            <div className="rounded-xl border border-border overflow-hidden mb-6">
              <Endpoint method="GET"    path="/api/openapi.json"               desc="OpenAPI 3.1 document for your content API, generated from the content types (public)" />
              <Endpoint method="GET"    path="/api/docs/content"               desc="Swagger UI for that document" />
            </div>

            <h3 className="font-semibold mb-3">Next.js Live Draft Mode</h3>
            <div className="rounded-xl border border-border overflow-hidden mb-6">
              <Endpoint method="GET"    path="/api/draft?secret=...&slug=...&type=..." desc="Enable Next.js App Router Draft Mode via signed preview token" />
              <Endpoint method="GET"    path="/api/disable-draft"                      desc="Disable Draft Mode and restore live production content" />
            </div>

            <h3 className="font-semibold mb-3">Audit Log</h3>
            <div className="rounded-xl border border-border overflow-hidden mb-6">
              <Endpoint method="GET"    path="/api/audit-log"                  desc="List audit events — ?resource (entry, content_type, user, api_key, form, media, plugin, settings, release, role, redirect, component, choice_list, import), ?page, ?limit (admin only)" auth />
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
    "totalPages": 3,
    "nextCursor": "eyJzIjoiY3JlYXRlZEF0OmRlc2MiLC4uLn0"
  }
}

// GET /api/blog?cursor=<meta.nextCursor>&limit=20 — keyset pagination
// Constant-time at any depth and skips the total count, so meta is just:
{ "data": [ ... ], "meta": { "limit": 20, "nextCursor": "…" } }   // null on the last page

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
// ?cursor=<nextCursor>    (keyset paging — use for deep pages / infinite scroll;
//                          keep the same sort; not combinable with search)
// ?search=hello           (indexed full-text search on slug + all fields)
// ?where[category][eq]=tech  (operators: eq, ne, gt, gte, lt, lte, contains,
//                             startsWith, endsWith, in, notIn, null, notNull)
// ?filters[...]           (Strapi-style alias for where)
// ?filter[category]=tech  (legacy partial match)`} />

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
                    ['403', 'Forbidden — the API key or the user\'s role lacks permission for this operation'],
                    ['422', 'Unprocessable — a plugin vetoed the write, or a read-only (reverse) field was sent'],
                    ['404', 'Not Found — content type or entry does not exist'],
                    ['409', 'Conflict — slug already exists in this content type, or a component / role / choice list is still in use'],
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
            <span>Copyright &copy; 2026-present BuildWithKode. &mdash; <a href="https://github.com/buildwithkode/nodepress/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">MIT License</a></span>
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
