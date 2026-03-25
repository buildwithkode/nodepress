#!/usr/bin/env node
'use strict';

const [,, command, ...args] = process.argv;

const HELP = `
  NodePress CLI

  Usage:
    npx create-nodepress-app <project-name>   Scaffold a new NodePress project
    npx create-nodepress-app --version        Show version
    npx create-nodepress-app --help           Show this help

  Examples:
    npx create-nodepress-app my-website
    npx create-nodepress-app company-cms
`;

switch (command) {
  case 'new':
    // Legacy: npx create-nodepress-app new <name>
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
    // Primary usage: npx create-nodepress-app <project-name>
    if (!command.startsWith('-')) {
      require('../src/new')(command);
    } else {
      console.error(`\n  Unknown option: "${command}"`);
      console.log(HELP);
      process.exit(1);
    }
}
