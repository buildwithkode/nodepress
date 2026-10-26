---
title: MCP server
description: Connect AI assistants such as Claude Desktop, Claude Code or Cursor to a NodePress site with the built-in Model Context Protocol server.
sidebar:
  order: 6
---

`create-nodepress-app mcp` runs a [Model Context Protocol](https://modelcontextprotocol.io) server for a NodePress site. An AI assistant that supports MCP can then look up your content types, read and search published content, run GraphQL queries and, with an API key, draft new entries.

The server talks to the site's public API over HTTP, so it runs on your computer (or wherever the assistant runs), not on the NodePress server. It needs Node.js 18 or newer.

## Configuration

| Variable | Required | Meaning |
|---|---|---|
| `NODEPRESS_URL` | yes | The backend's URL, e.g. `https://cms.example.com` (a trailing `/api` is fine) |
| `NODEPRESS_API_KEY` | no | An API key (`np_…`), sent as `X-API-Key`. Needed for writes. |

Without a key, the server is read-only and sees published content only. To let the assistant create and update entries, give it a key with `write` or `all` access, limited to the content types it should touch. See [API keys](/access-control/api-keys/).

The server reads published entries even with a key. Drafts are never returned.

## Adding it to your assistant

Most MCP clients take the same JSON block. For **Claude Desktop**, add it to `claude_desktop_config.json` (**Settings → Developer → Edit Config**); for **Cursor**, to `.cursor/mcp.json`:

```json title="claude_desktop_config.json"
{
  "mcpServers": {
    "nodepress": {
      "command": "npx",
      "args": ["-y", "create-nodepress-app", "mcp"],
      "env": {
        "NODEPRESS_URL": "https://cms.example.com",
        "NODEPRESS_API_KEY": "np_…"
      }
    }
  }
}
```

Leave out `NODEPRESS_API_KEY` for read-only access. Restart the assistant after editing the file.

For **Claude Code**:

```bash
claude mcp add nodepress \
  -e NODEPRESS_URL=https://cms.example.com \
  -e NODEPRESS_API_KEY=np_… \
  -- npx -y create-nodepress-app mcp
```

## Tools

| Tool | What it does | API call |
|---|---|---|
| `list_content_types` | Lists content types with their fields: name, type, `required`, relation target and cardinality, select choices | GraphQL `contentTypes` |
| `list_entries` | Lists published entries of a type, with `where`, `search`, `sort`, `page`, `limit` (1–100), `locale`, `fallback` and `populate` | `GET /api/{type}` |
| `get_entry` | Gets one published entry by slug, with `locale`, `fallback` and `populate` | `GET /api/{type}/{slug}` |
| `create_entry` | Creates an entry from `slug`, `data`, `locale` and `status`. Saved as a **draft** unless `status` is `published`. | `POST /api/{type}` |
| `update_entry` | Replaces an entry's `data` (send every field to keep) | `PUT /api/{type}/{slug}` |
| `graphql` | Runs a GraphQL query with optional variables | `POST /graphql` |

`list_entries` and `get_entry` take the same filters as the REST API (see [Querying](/apis/querying/)), and the server checks every write the same way it checks API writes: field validation, field write rules and the key's scope. Errors come back to the assistant as the API's message.

The server tells the assistant to call `list_content_types` first and to prefer drafts, so a person reviews new content in the admin before it goes live.

## Example prompts

- "Which content types does the site have?"
- "List the five newest blog posts with their authors."
- "Find posts mentioning 'pricing' and summarize them."
- "Draft a blog post about our new release, as a draft."

## Running it by hand

```bash
NODEPRESS_URL=https://cms.example.com npx create-nodepress-app mcp
```

The server speaks JSON-RPC over stdin and stdout and prints `[nodepress-mcp] serving <url> (read-only)` (or `(with API key)`) to stderr. Started without `NODEPRESS_URL`, it prints a sample client configuration and exits.
