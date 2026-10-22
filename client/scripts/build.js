#!/usr/bin/env node
// Builds dist/cjs and dist/esm with the monorepo's TypeScript (no own dependencies).
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const tsc = require.resolve('typescript/bin/tsc', { paths: [root, path.join(root, '..')] });
fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });
const run = (...args) => execFileSync(process.execPath, [tsc, '-p', 'tsconfig.json', ...args], { cwd: root, stdio: 'inherit' });
run();
run('--module', 'es2020', '--moduleResolution', 'bundler', '--outDir', 'dist/esm');
fs.writeFileSync(path.join(root, 'dist/esm/package.json'), '{ "type": "module" }\n');
