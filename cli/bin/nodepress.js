#!/usr/bin/env node
'use strict';

const [,, command, ...args] = process.argv;

const HELP = `
  NodePress CLI

  Usage:
    npx nodepress new <project-name>   Scaffold a new NodePress project
    npx nodepress --version            Show version
    npx nodepress --help               Show this help

  Examples:
    npx nodepress new my-website
    npx nodepress new company-cms
`;

switch (command) {
  case 'new':
    require('../src/new')(args[0]);
    break;
  case '--version':
  case '-v':
    console.log(require('../package.json').version);
    break;
  case '--help':
  case '-h':
  case undefined:
    console.log(HELP);
    break;
  default:
    console.error(`\n  Unknown command: "${command}"`);
    console.log(HELP);
    process.exit(1);
}
