#!/usr/bin/env node
'use strict';

const argv = process.argv.slice(2);
const flags = argv.filter((a) => a.startsWith('-'));
const positionals = argv.filter((a) => !a.startsWith('-'));
const opts = {
  docker: flags.includes('--docker'),
  sentry: flags.includes('--sentry'),
};

const HELP = `
  NodePress CLI

  Usage:
    npx create-nodepress-app <project-name>            Scaffold a new NodePress project (local PostgreSQL)
    npx create-nodepress-app <project-name> --docker   Scaffold with Docker (Postgres + Redis + nginx)
    npx create-nodepress-app <project-name> --sentry   Include Sentry error tracking (~100 MB; off by default)
    npx create-nodepress-app --version                 Show version
    npx create-nodepress-app --help                    Show this help

  Examples:
    npx create-nodepress-app my-website
    npx create-nodepress-app company-cms --docker
    npx create-nodepress-app monitored-cms --sentry
`;

// --version / --help take priority over positionals
if (flags.includes('--version') || flags.includes('-v')) {
  console.log(require('../package.json').version);
} else if (flags.includes('--help') || flags.includes('-h')) {
  console.log(HELP);
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
