#!/usr/bin/env node
'use strict';

const argv = process.argv.slice(2);
const flags = argv.filter((a) => a.startsWith('-'));
const positionals = argv.filter((a) => !a.startsWith('-'));

const outFlagIndex = argv.findIndex((a) => a === '--out' || a === '-o');
const outValue = outFlagIndex !== -1 ? argv[outFlagIndex + 1] : undefined;

const schemaCommand = argv.find((a) => /^schema:(pull|diff|push)$/.test(a));

const opts = {
  docker: flags.includes('--docker'),
  sentry: flags.includes('--sentry'),
  install: !flags.includes('--no-install'),
  out: outValue,
};

const HELP = `
  NodePress CLI

  Usage:
    npx nodepress <project-name>                      Scaffold a new NodePress project (local PostgreSQL)
    npx nodepress <project-name> --docker             Scaffold with Docker (Postgres + Redis + nginx)
    npx nodepress <project-name> --sentry             Include Sentry error tracking
    npx nodepress <project-name> --no-install         Skip npm install (run it yourself later)
    npx nodepress upgrade [version] [--dry-run]       Update this project's code to a newer release (default: latest)
    npx nodepress upgrade --from <version>            First upgrade of a project created before nodepress.json existed
    npx nodepress generate:types [--out <path>]       Generate TypeScript interfaces from Content Types
    npx nodepress plugin keygen [--out <key.pem>]     Create a key for signing plugin packages
    npx nodepress plugin pack [dir] [--key <key.pem>] Zip (and sign) a built plugin for Plugins → Upload
    npx nodepress mcp                                 MCP server for AI assistants (NODEPRESS_URL, NODEPRESS_API_KEY)
    npx nodepress schema:pull [--out <file>]          Save the site's content types to nodepress.schema.json
    npx nodepress schema:diff [--file <file>]         Show what a push would change (exit 1 when it would)
    npx nodepress schema:push [--file <file>] [--yes] Apply the file's content types to the site (asks first)
    npx nodepress --version                           Show version
    npx nodepress --help                              Show this help

  Examples:
    npx nodepress my-website
    npx nodepress generate:types --out frontend/types/nodepress.d.ts
    npx nodepress generate:types
    NODEPRESS_URL=https://cms.example.com NODEPRESS_TOKEN=np_… npx nodepress schema:diff

  schema:* connect with NODEPRESS_URL and NODEPRESS_TOKEN (or --url / --token): an API key
  with "all" access to every content type (np_…) or an admin JWT.
`;

// --version / --help take priority over positionals
if (flags.includes('--version') || flags.includes('-v')) {
  console.log(require('../package.json').version);
} else if (flags.includes('--help') || flags.includes('-h')) {
  console.log(HELP);
} else if (positionals[0] === 'mcp') {
  require('../src/mcp')();
} else if (schemaCommand) {
  // Flags may come before or after the command: --url/--token/--file/--out/--yes.
  require('../src/schema')(schemaCommand, argv.filter((a, i) => i !== argv.indexOf(schemaCommand)));
} else if (positionals[0] === 'upgrade') {
  require('../src/upgrade')(argv.slice(argv.indexOf('upgrade') + 1));
} else if (positionals[0] === 'plugin') {
  require('../src/plugin')(argv.slice(argv.indexOf('plugin') + 1));
} else if (positionals[0] === 'generate:types' || positionals[0] === 'types' || positionals[0] === 'generate-types') {
  require('../src/generate-types')(opts, positionals.slice(1));
} else if (positionals[0] === 'new') {
  // Legacy: npx create-nodepress-app new <name>
  require('../src/new')(positionals[1], opts);
} else if (positionals.length > 0) {
  // Primary usage: npx create-nodepress-app <project-name> [--docker]
  require('../src/new')(positionals[0], opts);
} else if (flags.length > 0) {
  console.error(`\n  Unknown option: "${flags[0]}"`);
  console.log(HELP);
  process.exit(1);
} else {
  console.log(HELP);
}
