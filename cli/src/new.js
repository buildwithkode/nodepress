'use strict';

const { spawnSync } = require('child_process');
const { randomBytes } = require('crypto');
const fs = require('fs');
const path = require('path');

const REPO_URL = 'https://github.com/buildwithkode/nodepress.git';

// ANSI colours (degrade gracefully if not supported)
const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  dim:    '\x1b[2m',
};

function log(msg)  { process.stdout.write(msg + '\n'); }
function ok(msg)   { log(`  ${c.green}✔${c.reset}  ${msg}`); }
function warn(msg) { log(`  ${c.yellow}⚠${c.reset}  ${msg}`); }

function printLogo(version) {
  log('');
  log(`${c.cyan}  ███╗   ██╗ ██████╗ ██████╗ ███████╗${c.reset}`);
  log(`${c.cyan}  ████╗  ██║██╔═══██╗██╔══██╗██╔════╝${c.reset}`);
  log(`${c.cyan}  ██╔██╗ ██║██║   ██║██║  ██║█████╗  ${c.reset}`);
  log(`${c.cyan}  ██║╚██╗██║██║   ██║██║  ██║██╔══╝  ${c.reset}`);
  log(`${c.cyan}  ██║ ╚████║╚██████╔╝██████╔╝███████╗${c.reset}`);
  log(`${c.cyan}  ╚═╝  ╚═══╝ ╚═════╝ ╚═════╝ ╚══════╝${c.reset}`);
  log('');
  log(`${c.cyan}  ██████╗ ██████╗ ███████╗███████╗███████╗${c.reset}`);
  log(`${c.cyan}  ██╔══██╗██╔══██╗██╔════╝██╔════╝██╔════╝${c.reset}`);
  log(`${c.cyan}  ██████╔╝██████╔╝█████╗  ███████╗███████╗${c.reset}`);
  log(`${c.cyan}  ██╔═══╝ ██╔══██╗██╔══╝  ╚════██║╚════██║${c.reset}`);
  log(`${c.cyan}  ██║     ██║  ██║███████╗███████║███████║${c.reset}`);
  log(`${c.cyan}  ╚═╝     ╚═╝  ╚═╝╚══════╝╚══════╝╚══════╝${c.reset}`);
  log('');
  log(`  ${c.dim}Fast · Headless · Self-hosted    v${version}${c.reset}`);
  log('');
}

// Animated braille spinner — animates in-place, zero dependencies
class Spinner {
  constructor() {
    this.frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    this.i = 0;
    this.timer = null;
    this.text = '';
  }

  start(text) {
    this.text = text;
    this.i = 0;
    this.startedAt = Date.now();
    process.stdout.write('\x1b[?25l'); // hide cursor while spinning
    this.timer = setInterval(() => {
      const frame   = this.frames[this.i % this.frames.length];
      const elapsed = Math.floor((Date.now() - this.startedAt) / 1000);
      const timer   = elapsed > 0 ? `${c.dim} (${elapsed}s)${c.reset}` : '';
      process.stdout.write(`\r  ${c.cyan}${frame}${c.reset}  ${this.text}${timer}   `);
      this.i++;
    }, 80);
    return this;
  }

  update(text) {
    this.text = text;
  }

  succeed(text) {
    this._stop();
    process.stdout.write(`\r  ${c.green}✔${c.reset}  ${text || this.text}\n`);
  }

  fail(text) {
    this._stop();
    process.stdout.write(`\r  ${c.red}✖${c.reset}  ${text || this.text}\n`);
  }

  _stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    process.stdout.write('\x1b[?25h'); // restore cursor
  }
}

function secret(bytes = 32) {
  return randomBytes(bytes).toString('hex');
}

function writeEnvFile(filePath, content) {
  fs.writeFileSync(filePath, content.trimStart() + '\n', 'utf8');
}

function run(cmd, cwd, stdio = 'pipe') {
  return spawnSync(cmd, { shell: true, cwd, stdio, encoding: 'utf8' });
}


module.exports = function createProject(name) {
  const { version } = require('../package.json');

  printLogo(version);

  // ── Validate name ──────────────────────────────────────────────────────────
  if (!name) {
    log(`  ${c.bold}Usage:${c.reset} npx create-nodepress-app <project-name>\n`);
    process.exit(1);
  }

  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
  const projectDir = path.resolve(process.cwd(), safeName);

  if (fs.existsSync(projectDir)) {
    warn(`Directory "${safeName}" already exists. Choose a different name.`);
    process.exit(1);
  }

  log(`  Creating ${c.bold}${safeName}${c.reset}\n`);

  // ── Check dependencies ─────────────────────────────────────────────────────
  const hasGit    = run('git --version').status === 0;
  const hasDocker = run('docker --version').status === 0;
  const hasNode   = run('node --version').status === 0;

  if (!hasNode) { warn('Node.js 18+ is required.'); process.exit(1); }
  if (!hasGit)  { warn('Git is required. Install from https://git-scm.com'); process.exit(1); }

  // ── Clone repository ───────────────────────────────────────────────────────
  const spinner = new Spinner();
  spinner.start(`Cloning repository into ./${safeName} …`);
  const cloneResult = run(`git clone --depth 1 ${REPO_URL} "${safeName}"`, process.cwd());
  if (cloneResult.status !== 0) {
    spinner.fail('Clone failed — check your internet connection');
    process.exit(1);
  }
  spinner.succeed('Repository cloned');

  fs.rmSync(path.join(projectDir, '.git'), { recursive: true, force: true });
  run('git init', projectDir);
  ok('Fresh git repository initialized');

  // ── Remove dev-only files ──────────────────────────────────────────────────
  for (const entry of [
    '.claude', 'CLAUDE.md', 'cli', 'scripts', 'docs',
    'CHANGELOG.md', 'CODE_OF_CONDUCT.md', 'CONTRIBUTING.md',
    '.github', 'package.json', 'package-lock.json', 'node_modules',
  ]) {
    fs.rmSync(path.join(projectDir, entry), { recursive: true, force: true });
  }

  // ── Generate secrets ───────────────────────────────────────────────────────
  const dbPassword = secret(24);
  const jwtSecret  = secret(48);

  // ── Write env files ────────────────────────────────────────────────────────
  writeEnvFile(path.join(projectDir, 'backend', '.env'), `
# NodePress Backend — update DATABASE_URL with your PostgreSQL credentials before starting

# ── Required ──────────────────────────────────────────────────────────────────

# Replace YOUR_PASSWORD and YOUR_NODEPRESS_DATABASE before running migrations
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/YOUR_NODEPRESS_DATABASE"

# Direct (non-pooled) URL — used by Prisma migrations.
# If you're not using a connection pooler (PgBouncer / Neon), set this to the same value as DATABASE_URL.
DIRECT_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/YOUR_NODEPRESS_DATABASE"

PORT="3000"

# Auto-generated secure secret — do not share or commit this file
JWT_SECRET="${jwtSecret}"

# Admin panel origin (no trailing slash). Comma-separated for multiple origins.
CORS_ORIGIN="http://localhost:5173"

# ── Optional ──────────────────────────────────────────────────────────────────

APP_URL="http://localhost:3000"
SITE_URL="http://localhost:5173"

# ── Email (SMTP) ───────────────────────────────────────────────────────────────
# Required for password reset emails. Leave commented out to skip in development.
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_SECURE=false
# SMTP_USER=you@gmail.com
# SMTP_PASS=your_app_password
# SMTP_FROM=NodePress <noreply@yourdomain.com>
`);

  writeEnvFile(path.join(projectDir, 'frontend', '.env.local'), `
# NodePress Frontend — used only in Next.js server components (not exposed to the browser)

# URL of the running backend (no trailing slash)
BACKEND_URL="http://localhost:3000"
`);

  writeEnvFile(path.join(projectDir, '.env'), `
# Root .env — used by Docker Compose only (docker-compose.yml)
# Do not use this file for backend or frontend configuration directly.

DB_PASSWORD="${dbPassword}"
JWT_SECRET="${jwtSecret}"
CORS_ORIGIN="http://localhost"
APP_URL="http://localhost:3000"
SITE_URL="http://localhost"
`);
  ok('Environment files generated');

  // ── Done ───────────────────────────────────────────────────────────────────
  log('');
  log(`  ${c.green}${c.bold}✓ NodePress "${safeName}" is ready!${c.reset}`);
  log('');

  if (hasDocker) {
    log(`  ${c.bold}Next steps:${c.reset}`);
    log('');
    log(`  ${c.yellow}1.${c.reset} Install dependencies:`);
    log(`     cd ${safeName}/backend  && npm install`);
    log(`     cd ${safeName}/frontend && npm install`);
    log('');
    log(`  ${c.cyan}Option A — Docker (recommended, no PostgreSQL needed):${c.reset}`);
    log(`  ${c.yellow}2.${c.reset} Start PostgreSQL + Redis:`);
    log(`     cd ${safeName}`);
    log(`     docker-compose up -d`);
    log('');
    log(`  ${c.yellow}3.${c.reset} Run migrations and start the backend:`);
    log(`     cd ${safeName}/backend`);
    log(`     npx prisma migrate dev           ${c.dim}# create DB tables${c.reset}`);
    log(`     npm run start:dev                ${c.dim}# backend on :3000${c.reset}`);
    log('');
    log(`  ${c.yellow}4.${c.reset} Start the frontend:`);
    log(`     cd ${safeName}/frontend`);
    log(`     npm run dev                      ${c.dim}# admin panel on :5173${c.reset}`);
    log('');
    log(`  ${c.cyan}Option B — Local PostgreSQL:${c.reset}`);
    log(`  ${c.yellow}⚠${c.reset}  Open ${c.bold}${safeName}/backend/.env${c.reset} and update DATABASE_URL first:`);
    log(`     ${c.dim}postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/nodepress${c.reset}`);
    log('');
    log(`     cd ${safeName}/backend`);
    log(`     npx prisma migrate dev           ${c.dim}# create DB tables${c.reset}`);
    log(`     npm run start:dev                ${c.dim}# backend on :3000${c.reset}`);
    log('');
    log(`     cd ${safeName}/frontend`);
    log(`     npm run dev                      ${c.dim}# admin panel on :5173${c.reset}`);
  } else {
    log(`  ${c.bold}Next steps:${c.reset}`);
    log('');
    warn('Docker not found — using local PostgreSQL (port 5432)');
    log('');
    log(`  ${c.yellow}1.${c.reset} Install dependencies:`);
    log(`     cd ${safeName}/backend  && npm install`);
    log(`     cd ${safeName}/frontend && npm install`);
    log('');
    log(`  ${c.yellow}2.${c.reset} Open ${c.bold}${safeName}/backend/.env${c.reset} and update DATABASE_URL:`);
    log(`     ${c.dim}postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/nodepress${c.reset}`);
    log(`     ${c.dim}(No password? Use: postgresql://postgres@localhost:5432/nodepress)${c.reset}`);
    log('');
    log(`  ${c.yellow}3.${c.reset} Run migrations and start the backend:`);
    log(`     cd ${safeName}/backend`);
    log(`     npx prisma migrate dev           ${c.dim}# create DB tables${c.reset}`);
    log(`     npm run start:dev                ${c.dim}# backend on :3000${c.reset}`);
    log('');
    log(`  ${c.yellow}4.${c.reset} Start the frontend:`);
    log(`     cd ${safeName}/frontend`);
    log(`     npm run dev                      ${c.dim}# admin panel on :5173${c.reset}`);
  }

  log('');
  log(`  ${c.cyan}Admin panel:${c.reset}  http://localhost:5173`);
  log(`  ${c.cyan}API docs:${c.reset}     http://localhost:3000/api/docs`);
  log(`  ${c.cyan}Health check:${c.reset} http://localhost:3000/api/health`);
  log('');
  log(`  ${c.dim}Docs: https://nodepress.buildwithkode.com${c.reset}`);
  log('');
};
