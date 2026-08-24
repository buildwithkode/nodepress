#!/usr/bin/env node
'use strict';

const argv = process.argv.slice(2);
const flags = argv.filter((a) => a.startsWith('-'));
const positionals = argv.filter((a) => !a.startsWith('-'));

const outFlagIndex = argv.findIndex((a) => a === '--out' || a === '-o');
const outValue = outFlagIndex !== -1 ? argv[outFlagIndex + 1] : undefined;

const opts = {
  docker: flags.includes('--docker'),
  sentry: flags.includes('--sentry'),
  out: outValue,
};

const HELP = `
  NodePress CLI

  Usage:
    npx nodepress <project-name>                      Scaffold a new NodePress project (local PostgreSQL)
    npx nodepress <project-name> --docker             Scaffold with Docker (Postgres + Redis + nginx)
    npx nodepress <project-name> --sentry             Include Sentry error tracking
    npx nodepress generate:types [--out <path>]       Generate TypeScript interfaces from Content Types
    npx nodepress --version                           Show version
    npx nodepress --help                              Show this help

  Examples:
    npx nodepress my-website
    npx nodepress generate:types --out frontend/types/nodepress.d.ts
    npx nodepress generate:types
`;

// --version / --help take priority over positionals
if (flags.includes('--version') || flags.includes('-v')) {
  console.log(require('../package.json').version);
} else if (flags.includes('--help') || flags.includes('-h')) {
  console.log(HELP);
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
