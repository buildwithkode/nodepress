'use strict';

/**
 * `mcp` — a Model Context Protocol server (stdio) for a NodePress site, so AI
 * assistants (Claude Desktop, Claude Code, Cursor…) can read content and draft
 * entries through the public API. Zero dependencies: JSON-RPC 2.0 over
 * newline-delimited stdin/stdout.
 *
 *   NODEPRESS_URL=https://cms.example.com NODEPRESS_API_KEY=np_… npx create-nodepress-app mcp
 *
 * Reads work without a key (published content only). Writes need a write/all
 * API key, and new entries are drafts unless the assistant is told otherwise.
 * stdout carries protocol messages only — logs go to stderr.
 */

const PROTOCOL_VERSION = '2025-06-18';

const TOOLS = [
  {
    name: 'list_content_types',
    description: 'List the content types on the site with their fields (names, types, relations). Call this first to learn what can be queried.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_entries',
    description:
      'List published entries of a content type. Supports filters (where), full-text search, sorting, paging, language and relation population — the same options as GET /api/{type}.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Content type name, e.g. "post"' },
        where: {
          type: 'object',
          description: 'Filters, e.g. {"featured":{"eq":true},"author":{"slug":{"eq":"jane"}}}. Operators: eq ne gt gte lt lte in notIn contains startsWith endsWith null notNull; OR/AND arrays.',
        },
        search: { type: 'string' },
        sort: { type: 'string', description: '"createdAt:desc" (default), "updatedAt:asc", "slug:asc"…' },
        page: { type: 'integer', minimum: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
        locale: { type: 'string' },
        fallback: { type: 'boolean', description: 'Use default-language entries where a translation is missing' },
        populate: { type: 'array', items: { type: 'string' }, description: 'Relation fields to inline, e.g. ["author"]' },
      },
      required: ['type'],
    },
  },
  {
    name: 'get_entry',
    description: 'Get one published entry by slug.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string' },
        slug: { type: 'string' },
        locale: { type: 'string' },
        fallback: { type: 'boolean' },
        populate: { type: 'array', items: { type: 'string' } },
      },
      required: ['type', 'slug'],
    },
  },
  {
    name: 'create_entry',
    description:
      'Create an entry (needs a write API key). It is saved as a DRAFT unless status is "published" — prefer drafts so a person reviews them. `data` must match the content type\'s fields.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string' },
        slug: { type: 'string', description: 'lowercase-words-with-hyphens, unique within the type' },
        data: { type: 'object' },
        locale: { type: 'string' },
        status: { type: 'string', enum: ['draft', 'published'], default: 'draft' },
      },
      required: ['type', 'slug', 'data'],
    },
  },
  {
    name: 'update_entry',
    description: 'Replace the data of an existing entry (needs a write API key). Read it first and send every field you want to keep.',
    inputSchema: {
      type: 'object',
      properties: { type: { type: 'string' }, slug: { type: 'string' }, data: { type: 'object' }, locale: { type: 'string' } },
      required: ['type', 'slug', 'data'],
    },
  },
  {
    name: 'graphql',
    description: 'Run a GraphQL query against /graphql. Each content type has typed queries, e.g. { posts(limit: 5) { data { slug data { title } } } }.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, variables: { type: 'object' } },
      required: ['query'],
    },
  },
];

function queryString(params) {
  const parts = [];
  const add = (key, value) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      if (value.length && value.every((v) => typeof v !== 'object')) parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value.join(','))}`);
      else value.forEach((v, i) => add(`${key}[${i}]`, v));
    } else if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) add(`${key}[${k}]`, v);
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  };
  for (const [k, v] of Object.entries(params)) add(k, v);
  return parts.length ? `?${parts.join('&')}` : '';
}

function createApi({ url, apiKey, fetchImpl = globalThis.fetch }) {
  const base = url.replace(/\/+$/, '').replace(/\/api$/, '');
  const request = async (method, path, body) => {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (apiKey) headers['X-API-Key'] = apiKey;
    const res = await fetchImpl(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    if (!res.ok) {
      const msg = json && json.message ? (Array.isArray(json.message) ? json.message.join(', ') : json.message) : `HTTP ${res.status}`;
      const details = json && json.errors ? ` — ${JSON.stringify(json.errors)}` : '';
      throw new Error(`${method} ${path}: ${msg}${details}`);
    }
    return json;
  };
  const enc = encodeURIComponent;
  return {
    async call(name, a = {}) {
      switch (name) {
        case 'list_content_types': {
          const res = await request('POST', '/graphql', { query: '{ contentTypes { name schema allowedMethods } }' });
          if (res.errors) throw new Error(res.errors[0].message);
          return res.data.contentTypes.map((ct) => ({
            name: ct.name,
            allowedMethods: ct.allowedMethods,
            fields: (ct.schema || []).map((f) => ({
              name: f.name,
              type: f.type,
              ...(f.required ? { required: true } : {}),
              ...(f.type === 'relation' ? { relatedContentType: f.options && f.options.relatedContentType, cardinality: f.options && f.options.cardinality, ...(f.options && f.options.mappedBy ? { readOnly: true } : {}) } : {}),
              ...(f.type === 'select' ? { choices: f.options && f.options.choices } : {}),
            })),
          }));
        }
        case 'list_entries':
          return request('GET', `/api/${enc(a.type)}${queryString({
            where: a.where, search: a.search, sort: a.sort, page: a.page, limit: a.limit,
            locale: a.locale, fallback: a.fallback, populate: a.populate,
          })}`);
        case 'get_entry':
          return request('GET', `/api/${enc(a.type)}/${enc(a.slug)}${queryString({ locale: a.locale, fallback: a.fallback, populate: a.populate })}`);
        case 'create_entry':
          return request('POST', `/api/${enc(a.type)}`, { slug: a.slug, data: a.data, locale: a.locale, status: a.status || 'draft' });
        case 'update_entry':
          return request('PUT', `/api/${enc(a.type)}/${enc(a.slug)}`, { data: a.data, locale: a.locale });
        case 'graphql': {
          const res = await request('POST', '/graphql', { query: a.query, variables: a.variables });
          if (res.errors && res.errors.length) throw new Error(res.errors.map((e) => e.message).join('; '));
          return res.data;
        }
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    },
  };
}

/** Handle one JSON-RPC message; returns the response object, or null for notifications. */
async function handle(message, api, version) {
  const { id, method, params } = message || {};
  const isNotification = id === undefined || id === null;
  const reply = (result) => (isNotification ? null : { jsonrpc: '2.0', id, result });
  const error = (code, msg) => (isNotification ? null : { jsonrpc: '2.0', id, error: { code, message: msg } });

  switch (method) {
    case 'initialize':
      return reply({
        protocolVersion: (params && params.protocolVersion) || PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'nodepress', version },
        instructions: 'NodePress CMS. Call list_content_types first. Only published content is readable; created entries are drafts by default.',
      });
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: TOOLS });
    case 'tools/call': {
      const name = params && params.name;
      if (!TOOLS.some((t) => t.name === name)) return error(-32602, `Unknown tool: ${name}`);
      try {
        const result = await api.call(name, (params && params.arguments) || {});
        return reply({ content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
      } catch (err) {
        return reply({ content: [{ type: 'text', text: err.message }], isError: true });
      }
    }
    default:
      if (isNotification) return null; // notifications/initialized etc.
      return error(-32601, `Method not found: ${method}`);
  }
}

function serve({ input = process.stdin, output = process.stdout, api, version }) {
  let buffer = '';
  const queue = [];
  let busy = false;
  const send = (obj) => output.write(`${JSON.stringify(obj)}\n`);
  const drain = async () => {
    if (busy) return;
    busy = true;
    while (queue.length) {
      const line = queue.shift();
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
        continue;
      }
      const res = await handle(msg, api, version);
      if (res) send(res);
    }
    busy = false;
  };
  input.setEncoding('utf8');
  input.on('data', (chunk) => {
    buffer += chunk;
    let i;
    while ((i = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (line) queue.push(line);
    }
    void drain();
  });
}

module.exports = function mcp() {
  const url = process.env.NODEPRESS_URL;
  if (!url) {
    process.stderr.write(
      '\n  Set NODEPRESS_URL (and NODEPRESS_API_KEY for writes), e.g. in your MCP client config:\n\n' +
        '  { "mcpServers": { "nodepress": { "command": "npx", "args": ["-y", "create-nodepress-app", "mcp"],\n' +
        '      "env": { "NODEPRESS_URL": "https://cms.example.com", "NODEPRESS_API_KEY": "np_…" } } } }\n\n',
    );
    process.exit(1);
  }
  if (typeof globalThis.fetch !== 'function') {
    process.stderr.write('  The MCP server needs Node 18 or newer.\n');
    process.exit(1);
  }
  const version = require('../package.json').version;
  serve({ api: createApi({ url, apiKey: process.env.NODEPRESS_API_KEY }), version });
  process.stderr.write(`[nodepress-mcp] serving ${url}${process.env.NODEPRESS_API_KEY ? ' (with API key)' : ' (read-only)'}\n`);
};

module.exports.handle = handle;
module.exports.createApi = createApi;
module.exports.TOOLS = TOOLS;
