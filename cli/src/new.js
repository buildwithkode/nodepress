'use strict';

const { execSync, spawnSync } = require('child_process');
const { randomBytes } = require('crypto');
const fs = require('fs');
const path = require('path');

const REPO_URL = 'https://github.com/buildwithkode/nodepress.git';

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
  fs.rmSync(path.join(projectDir, '.git'), { recursive: true, force: true });
  run(`git init`, projectDir);
  ok('Fresh git repository initialized');

  // ── Remove dev-only files (not needed in a user project) ───────────────────
  const devOnly = [
    '.claude',           // Claude Code AI config
    'CLAUDE.md',         // Claude Code instructions
    'cli',               // The CLI tool itself
    'scripts',           // Internal dev scripts
    'docs',              // NodePress GitHub Pages site
    'CHANGELOG.md',      // NodePress version history
    'CODE_OF_CONDUCT.md',// NodePress open source conduct file
    'CONTRIBUTING.md',   // NodePress contributor guide
    '.github',           // NodePress CI/CD workflows and issue templates
    'package-lock.json', // Root lockfile (regenerated for the fresh root package.json)
    'node_modules',
  ];
  for (const entry of devOnly) {
    fs.rmSync(path.join(projectDir, entry), { recursive: true, force: true });
  }

  // ── Generate secrets ───────────────────────────────────────────────────────
  const dbPassword = secret(24);
  const jwtSecret  = secret(48);

  // ── Write backend .env ─────────────────────────────────────────────────────
  const backendEnv = {
    DATABASE_URL:  `postgresql://postgres:${dbPassword}@localhost:5432/nodepress`,
    PORT:          '3000',
    JWT_SECRET:    jwtSecret,
    CORS_ORIGIN:   'http://localhost:5173',
    APP_URL:       'http://localhost:3000',
    SITE_URL:      'http://localhost:5173',
    // Email — configure to enable password reset emails
    SMTP_HOST:     '',
    SMTP_PORT:     '587',
    SMTP_SECURE:   'false',
    SMTP_USER:     '',
    SMTP_PASS:     '',
    SMTP_FROM:     '',
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

  // ── Write root package.json (convenience scripts) ──────────────────────────
  const rootPkg = {
    name: safeName,
    version: '1.0.0',
    private: true,
    scripts: {
      dev: 'concurrently "npm run dev:backend" "npm run dev:frontend"',
      'dev:backend': 'cd backend && npm run start:dev',
      'dev:frontend': 'cd frontend && npm run dev',
      build: 'cd backend && npm run build && cd ../frontend && npm run build',
      'docker:dev': 'docker-compose up -d',
      'docker:prod': 'docker-compose -f docker-compose.prod.yml up -d --build',
      'docker:down': 'docker-compose down',
      migrate: 'cd backend && npx prisma migrate dev',
      studio: 'cd backend && npx prisma studio',
      'install:all': 'cd backend && npm install && cd ../frontend && npm install',
    },
    devDependencies: {
      concurrently: '^10.0.0',
    },
  };
  fs.writeFileSync(
    path.join(projectDir, 'package.json'),
    JSON.stringify(rootPkg, null, 2) + '\n',
    'utf8',
  );
  ok('package.json generated with dev/build scripts');

  // ── Install dependencies ───────────────────────────────────────────────────
  info('Installing root dependencies …');
  run('npm install', projectDir, 'inherit');
  ok('Root dependencies installed');

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

  if (hasDocker) {
    log(`  ${c.bold}Next steps:${c.reset}`);
    log('');
    log(`  ${c.cyan}Option A — Docker (recommended, no PostgreSQL needed):${c.reset}`);
    log(`    cd ${safeName}`);
    log(`    docker-compose up -d             ${c.dim}# starts PostgreSQL + Redis${c.reset}`);
    log(`    npm run migrate                  ${c.dim}# create DB tables${c.reset}`);
    log(`    npm run dev                      ${c.dim}# backend :3000 + admin panel :5173${c.reset}`);
    log('');
    log(`  ${c.cyan}Option B — Local PostgreSQL:${c.reset}`);
    log(`  ${c.yellow}⚠${c.reset}  Open ${c.bold}${safeName}/backend/.env${c.reset} and update DATABASE_URL with your PostgreSQL password:`);
    log(`    ${c.dim}postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/nodepress${c.reset}`);
    log('');
    log(`    cd ${safeName}`);
    log(`    npm run migrate                  ${c.dim}# create DB tables${c.reset}`);
    log(`    npm run dev                      ${c.dim}# backend :3000 + admin panel :5173${c.reset}`);
  } else {
    log(`  ${c.bold}Next steps:${c.reset}`);
    log('');
    warn(`Docker not found — using local PostgreSQL (port 5432)`);
    log('');
    log(`  ${c.yellow}1.${c.reset} Open ${c.bold}${safeName}/backend/.env${c.reset} and update DATABASE_URL with your PostgreSQL password:`);
    log(`     ${c.dim}postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/nodepress${c.reset}`);
    log(`     ${c.dim}(No password? Use: postgresql://postgres@localhost:5432/nodepress)${c.reset}`);
    log('');
    log(`  ${c.yellow}2.${c.reset} Run migrations and start both servers:`);
    log(`     cd ${safeName}`);
    log(`     npm run migrate                  ${c.dim}# create DB tables${c.reset}`);
    log(`     npm run dev                      ${c.dim}# backend :3000 + admin panel :5173${c.reset}`);
  }

  log('');
  log(`  ${c.cyan}Admin panel:${c.reset}  http://localhost:5173`);
  log(`  ${c.cyan}API docs:${c.reset}     http://localhost:3000/api/docs`);
  log(`  ${c.cyan}Health check:${c.reset} http://localhost:3000/api/health`);
  log('');
  log(`  ${c.dim}Docs: https://nodepress.buildwithkode.com${c.reset}`);
  log('');
};
