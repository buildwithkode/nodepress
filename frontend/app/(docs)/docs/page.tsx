'use client';

// The full documentation lives on the docs site (docs/ in the repo). This page
// keeps what only this install can show — its own endpoints — plus a short
// quick reference and links to every topic.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Copy, Check, BookOpen, Zap, ExternalLink, Globe, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/axios';

const DOCS_URL = 'https://nodepress-docs.vercel.app';

interface ContentType { id: number; name: string; allowedMethods: string[] | null }

function useCopy(text: string) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return { copied, copy };
}

// ─── Code block ──────────────────────────────────────────────────────────────
function CodeBlock({ code }: { code: string }) {
  const { copied, copy } = useCopy(code.trim());
  return (
    <div className="relative my-3 rounded-xl overflow-hidden border border-zinc-800">
      <div className="flex items-center justify-end bg-zinc-900 px-4 py-2 border-b border-zinc-800">
        <button onClick={copy} className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors">
          {copied ? <><Check className="h-3.5 w-3.5 text-green-400" /> <span className="text-green-400">Copied!</span></> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
        </button>
      </div>
      <pre className="bg-zinc-950 text-zinc-200 p-4 text-xs font-mono overflow-x-auto leading-6"><code>{code.trim()}</code></pre>
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
  return <span className={cn('inline-flex w-16 justify-center px-2 py-0.5 rounded text-xs font-bold border font-mono shrink-0', METHOD[m])}>{m}</span>;
}

// ─── Endpoint row ─────────────────────────────────────────────────────────────
function Endpoint({ method, path, desc, auth }: { method: string; path: string; desc: string; auth?: boolean }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-border last:border-0">
      <MethodBadge m={method} />
      <div className="flex-1 min-w-0">
        <code className="text-sm font-mono text-foreground break-all">{path}</code>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      </div>
      {auth && <span className="text-[10px] border border-border rounded px-1.5 py-0.5 text-muted-foreground shrink-0">Auth</span>}
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

// ─── Docs site topics (sidebar order of docs/) ───────────────────────────────
const TOPICS: { title: string; pages: [string, string][] }[] = [
  { title: 'Getting started', pages: [
    ['What is NodePress?', 'getting-started/what-is-nodepress'], ['Installation', 'getting-started/installation'],
    ['Quick start', 'getting-started/quick-start'], ['Project structure', 'getting-started/project-structure'],
    ['Core concepts', 'getting-started/concepts'],
  ] },
  { title: 'Content modeling', pages: [
    ['Content types', 'content-modeling/content-types'], ['Fields', 'content-modeling/fields'],
    ['Repeaters, groups and flexible fields', 'content-modeling/nested-fields'], ['Relations', 'content-modeling/relations'],
    ['Components', 'content-modeling/components'], ['Choice lists', 'content-modeling/choice-lists'],
    ['Conditional fields', 'content-modeling/conditional-fields'], ['Schema changes', 'content-modeling/schema-changes'],
  ] },
  { title: 'Managing content', pages: [
    ['Entries', 'content/entries'], ['Versions', 'content/versions'], ['Releases', 'content/releases'],
    ['Languages', 'content/languages'], ['Media', 'content/media'], ['Live preview', 'content/live-preview'],
    ['SEO', 'content/seo'], ['Redirects', 'content/redirects'], ['Forms', 'content/forms'],
    ['Starter templates', 'content/templates'], ['WordPress import', 'content/wordpress-import'], ['AI assistance', 'content/ai'],
  ] },
  { title: 'APIs', pages: [
    ['REST API', 'apis/rest'], ['Querying', 'apis/querying'], ['GraphQL', 'apis/graphql'], ['OpenAPI', 'apis/openapi'],
    ['JavaScript client', 'apis/js-client'], ['Frontend starters', 'apis/starters'],
    ['Real-time events', 'apis/realtime'], ['Webhooks', 'apis/webhooks'],
  ] },
  { title: 'Access control', pages: [
    ['Users and roles', 'access-control/users-and-roles'], ['Permissions', 'access-control/permissions'],
    ['Field access', 'access-control/field-access'], ['API keys', 'access-control/api-keys'],
    ['Authentication', 'access-control/authentication'], ['Single sign-on (SSO)', 'access-control/sso'],
    ['Audit log', 'access-control/audit-log'],
  ] },
  { title: 'Extending', pages: [
    ['Plugins', 'extending/plugins'], ['Building plugins', 'extending/building-plugins'],
    ['Hooks reference', 'extending/hooks'], ['Publishing plugins', 'extending/publishing-plugins'],
  ] },
  { title: 'CLI', pages: [
    ['CLI overview', 'cli/overview'], ['Create a project', 'cli/create'], ['Upgrade', 'cli/upgrade'],
    ['Generate types', 'cli/generate-types'], ['Schema sync', 'cli/schema'], ['MCP server', 'cli/mcp'],
  ] },
  { title: 'Deployment', pages: [
    ['Choose a host', 'deployment/deploy'], ['Deploy on a server', 'deployment/deploy-vps'],
    ['Server without Docker', 'deployment/deploy-vps-node'], ['Deploy on a platform', 'deployment/deploy-platforms'],
    ['Self-hosting', 'deployment/self-hosting'], ['Docker', 'deployment/docker'], ['File storage', 'deployment/storage'],
    ['Email', 'deployment/email'], ['Scaling', 'deployment/scaling'], ['Search', 'deployment/search'],
    ['CDN caching', 'deployment/cdn'], ['Backups', 'deployment/backups'], ['Upgrading', 'deployment/upgrading'],
    ['Monitoring', 'deployment/monitoring'],
  ] },
  { title: 'Reference', pages: [
    ['Environment variables', 'reference/environment-variables'], ['API endpoints', 'reference/api-endpoints'],
  ] },
];

const TOC_ITEMS = [
  { id: 'your-endpoints',  label: 'Your endpoints' },
  { id: 'quick-reference', label: 'Quick reference' },
  { id: 'topics',          label: 'Documentation' },
];

const OPERATIONS = [
  { key: 'list',   method: 'GET',    suffix: '',        desc: 'List published entries',     auth: false },
  { key: 'read',   method: 'GET',    suffix: '/{slug}', desc: 'Get one published entry',    auth: false },
  { key: 'create', method: 'POST',   suffix: '',        desc: 'Create an entry',            auth: true },
  { key: 'update', method: 'PUT',    suffix: '/{slug}', desc: 'Update the fields you send', auth: true },
  { key: 'delete', method: 'DELETE', suffix: '/{slug}', desc: 'Delete an entry',            auth: true },
];

// ─── Your endpoints (live) ───────────────────────────────────────────────────
function YourEndpoints({ baseUrl }: { baseUrl: string }) {
  const [types, setTypes] = useState<ContentType[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    // Anonymous callers get the types open to the public API; signed-in users get all of them.
    api.get<ContentType[]>('/content-types')
      .then((res) => {
        setTypes(res.data);
        if (res.data.length) setSelected(res.data[0].id);
      })
      .catch(() => setFailed(true));
  }, []);

  if (failed) return <p className="text-sm text-muted-foreground">Couldn&apos;t load the content types from this install.</p>;
  if (!types) return <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>;
  if (!types.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No content types yet. <Link href="/content-types" className="text-primary hover:underline">Create one</Link> and its endpoints appear here.
      </p>
    );
  }

  const ct = types.find((t) => t.id === selected) ?? types[0];
  const path = `/api/${ct.name.replace(/_/g, '-')}`;
  const ops = OPERATIONS.filter((op) => ct.allowedMethods === null || ct.allowedMethods.includes(op.key));

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {types.map((t) => (
          <button
            key={t.id}
            onClick={() => setSelected(t.id)}
            className={cn(
              'px-3 py-1 rounded-md text-xs font-medium border transition-colors',
              t.id === ct.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {t.name.replace(/_/g, ' ')}
          </button>
        ))}
      </div>
      <div className="rounded-xl border border-border overflow-hidden mb-4">
        {ops.length
          ? ops.map((op) => <Endpoint key={op.key} method={op.method} path={`${path}${op.suffix}`} desc={op.desc} auth={op.auth} />)
          : <p className="px-4 py-3 text-sm text-muted-foreground">This content type is private: the public API doesn&apos;t serve it.</p>}
      </div>
      {ops.some((op) => op.key === 'list') && <CodeBlock code={`curl "${baseUrl}${path}?limit=10"`} />}
    </div>
  );
}

export default function DocsPage() {
  const [baseUrl, setBaseUrl] = useState('https://your-domain.com');

  useEffect(() => {
    setBaseUrl(window.location.origin);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/90 backdrop-blur border-b border-border">
        <div className="w-full px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 group">
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-primary-foreground text-xs font-extrabold">N</span>
              </div>
              <span className="font-semibold text-sm group-hover:text-primary transition-colors">NodePress</span>
            </a>
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
                  <a href={`#${item.id}`} className="block text-sm py-1 px-2 rounded text-muted-foreground hover:text-foreground transition-colors">
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* ── Main content ──────────────────────────────────────────────────── */}
        <main className="flex-1 min-w-0 max-w-4xl">

          {/* Hero */}
          <div className="mb-14">
            <h1 className="text-4xl font-extrabold mb-3">NodePress CMS</h1>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl mb-5">
              A self-hosted headless CMS. Define your content structure, fill it in the admin panel, then
              read it over REST or GraphQL from any site or app.
            </p>
            <a
              href={DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <BookOpen className="h-4 w-4" /> Read the full documentation <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>

          <Section id="your-endpoints" title="Your endpoints" icon={Globe}>
            <p className="text-sm text-muted-foreground mb-4">
              The REST endpoints of this install, from its content types. Writes need an API key (<IC>X-API-Key</IC>) or a
              signed-in user&apos;s token (<IC>Authorization: Bearer …</IC>).
            </p>
            <YourEndpoints baseUrl={baseUrl} />
          </Section>

          <Section id="quick-reference" title="Quick reference" icon={Zap}>
            <div className="rounded-xl border border-border overflow-hidden mb-4">
              <Endpoint method="GET" path="/api/{type}?page=2&limit=50&sort=createdAt:desc" desc="Page and sort (or ?cursor= for keyset paging)" />
              <Endpoint method="GET" path="/api/{type}?where[title][contains]=hello" desc="Filter by field (eq, ne, gt, lt, contains, in, null…), or ?search= for full-text search" />
              <Endpoint method="GET" path="/api/{type}/{slug}?populate=author" desc="Resolve relation fields (comma-separated, dot paths up to 3 levels)" />
              <Endpoint method="GET" path="/api/{type}?locale=fr&fallback=true" desc="Entries in one content language, plus default-language entries without a translation" />
              <Endpoint method="POST" path="/graphql" desc="GraphQL, with typed queries for every public content type" />
              <Endpoint method="GET" path="/api/openapi.json" desc="OpenAPI document of the content API (Swagger UI at /api/docs/content)" />
            </div>
            <CodeBlock code={`curl -X POST "${baseUrl}/api/{type}" \\
  -H "X-API-Key: np_…" \\
  -H "Content-Type: application/json" \\
  -d '{ "slug": "hello-world", "status": "draft", "data": { "title": "Hello" } }'`} />
            <p className="text-sm text-muted-foreground">
              From JavaScript, use the typed client: <IC>npm install @nodepress-cms/client</IC> (
              <a href={`${DOCS_URL}/apis/js-client/`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">JavaScript client</a>).
            </p>
          </Section>

          <Section id="topics" title="Documentation" icon={BookOpen}>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {TOPICS.map((group) => (
                <div key={group.title}>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">{group.title}</h3>
                  <ul className="space-y-1">
                    {group.pages.map(([label, slug]) => (
                      <li key={slug}>
                        <a
                          href={`${DOCS_URL}/${slug}/`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-foreground hover:text-primary transition-colors"
                        >
                          {label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Section>
        </main>
      </div>
    </div>
  );
}
