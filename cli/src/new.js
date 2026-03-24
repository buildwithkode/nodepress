'use strict';

const { execSync, spawnSync } = require('child_process');
const { randomBytes } = require('crypto');
const fs = require('fs');
const path = require('path');

const REPO_URL = 'https://github.com/your-org/nodepress.git'; // ← update before publishing

// ANSI colours (degrade gracefully if not supported)
const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  blue:   '\x1b[34m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  dim:    '\x1b[2m',
};

function log(msg)     { process.stdout.write(msg + '\n'); }
function ok(msg)      { log(`  ${c.green}✔${c.reset}  ${msg}`); }
function info(msg)    { log(`  ${c.blue}→${c.reset}  ${msg}`); }
function warn(msg)    { log(`  ${c.yellow}⚠${c.reset}  ${msg}`); }
function header(msg)  { log(`\n${c.bold}${msg}${c.reset}`); }

function secret(bytes = 32) {
  return randomBytes(bytes).toString('hex');
}

function writeEnvFile(filePath, vars) {
  const content = Object.entries(vars)
    .map(([k, v]) => (v === '' ? `# ${k}=` : `${k}="${v}"`))
    .join('\n');
  fs.writeFileSync(filePath, content + '\n', 'utf8');
}

function run(cmd, cwd, stdio = 'pipe') {
  return spawnSync(cmd, { shell: true, cwd, stdio, encoding: 'utf8' });
}

module.exports = async function createProject(name) {
  // ── Validate name ──────────────────────────────────────────────────────────
  if (!name) {
    log(`\n  ${c.bold}Usage:${c.reset} npx nodepress new <project-name>\n`);
    process.exit(1);
  }

  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
  const projectDir = path.resolve(process.cwd(), safeName);

  if (fs.existsSync(projectDir)) {
    warn(`Directory "${safeName}" already exists. Choose a different name.`);
    process.exit(1);
  }

  header(`\n  NodePress — Creating "${safeName}"`);
  log('');

  // ── Check dependencies ─────────────────────────────────────────────────────
  const hasGit    = run('git --version').status === 0;
  const hasDocker = run('docker --version').status === 0;
  const hasNode   = run('node --version').status === 0;

  if (!hasNode) { warn('Node.js 18+ is required.'); process.exit(1); }
  if (!hasGit)  { warn('Git is required. Install from https://git-scm.com'); process.exit(1); }

  // ── Clone repository ───────────────────────────────────────────────────────
  info(`Cloning NodePress into ./${safeName} …`);
  const cloneResult = run(`git clone --depth 1 ${REPO_URL} "${safeName}"`, process.cwd(), 'inherit');
  if (cloneResult.status !== 0) {
    warn('Clone failed. Check your internet connection or the repository URL.');
    process.exit(1);
  }
  ok('Repository cloned');

  // Remove git history (this is a fresh project, not a fork)
  run(`rm -rf .git`, projectDir);
  run(`git init`, projectDir);
  ok('Fresh git repository initialized');

  // ── Generate secrets ───────────────────────────────────────────────────────
  const dbPassword = secret(24);
  const jwtSecret  = secret(48);

  // ── Write backend .env ─────────────────────────────────────────────────────
  const backendEnv = {
    DATABASE_URL:  `postgresql://postgres:${dbPassword}@localhost:5432/nodepress`,
    PORT:          '3000',
    JWT_SECRET:    jwtSecret,
    JWT_EXPIRES_IN:'7d',
    CORS_ORIGIN:   'http://localhost:5173',
    APP_URL:       'http://localhost:3000',
    SITE_URL:      'http://localhost:5173',
  };
  writeEnvFile(path.join(projectDir, 'backend', '.env'), backendEnv);
  ok('backend/.env generated with random secrets');

  // ── Write frontend .env.local ──────────────────────────────────────────────
  const frontendEnv = {
    BACKEND_URL: 'http://localhost:3000',
  };
  writeEnvFile(path.join(projectDir, 'frontend', '.env.local'), frontendEnv);
  ok('frontend/.env.local generated');

  // ── Write root .env (for Docker Compose) ──────────────────────────────────
  const rootEnv = {
    DB_PASSWORD:   dbPassword,
    JWT_SECRET:    jwtSecret,
    CORS_ORIGIN:   'http://localhost',
    APP_URL:       'http://localhost:3000',
    SITE_URL:      'http://localhost',
  };
  writeEnvFile(path.join(projectDir, '.env'), rootEnv);
  ok('.env generated for Docker Compose');

  // ── Install dependencies ───────────────────────────────────────────────────
  info('Installing backend dependencies …');
  run('npm install', path.join(projectDir, 'backend'), 'inherit');
  ok('Backend dependencies installed');

  info('Installing frontend dependencies …');
  run('npm install', path.join(projectDir, 'frontend'), 'inherit');
  ok('Frontend dependencies installed');

  // ── Done ───────────────────────────────────────────────────────────────────
  log('');
  log(`  ${c.green}${c.bold}✓ NodePress "${safeName}" is ready!${c.reset}`);
  log('');
  log(`  ${c.bold}Next steps:${c.reset}`);
  log('');

  if (hasDocker) {
    log(`  ${c.cyan}Option A — Docker (recommended for production):${c.reset}`);
    log(`    cd ${safeName}`);
    log(`    docker-compose -f docker-compose.prod.yml up -d`);
    log('');
    log(`  ${c.cyan}Option B — Local development:${c.reset}`);
  } else {
    log(`  ${c.cyan}Start local development:${c.reset}`);
    warn('Docker not found — you\'ll need PostgreSQL running locally (port 5432)');
  }

  log(`    cd ${safeName}/backend`);
  log(`    npx prisma migrate dev   ${c.dim}# create DB tables${c.reset}`);
  log(`    npm run start:dev        ${c.dim}# backend on :3000${c.reset}`);
  log('');
  log(`    cd ${safeName}/frontend`);
  log(`    npm run dev              ${c.dim}# admin panel on :5173${c.reset}`);
  log('');
  log(`  ${c.cyan}Admin panel:${c.reset}  http://localhost:5173`);
  log(`  ${c.cyan}API docs:${c.reset}     http://localhost:3000/api-docs`);
  log(`  ${c.cyan}Health check:${c.reset} http://localhost:3000/api/health`);
  log('');
  log(`  ${c.dim}Docs: https://github.com/your-org/nodepress${c.reset}`);
  log('');
};
