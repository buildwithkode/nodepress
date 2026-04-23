'use strict';

const { spawnSync, spawn } = require('child_process');
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

function writeEnvFile(filePath, content) {
  fs.writeFileSync(filePath, content.trimStart() + '\n', 'utf8');
}

function run(cmd, cwd, stdio = 'pipe') {
  return spawnSync(cmd, { shell: true, cwd, stdio, encoding: 'utf8' });
}

// Run two npm installs in parallel and stream both outputs to the terminal.
// Returns a promise that resolves when both finish, or rejects if either fails.
function installBoth(backendDir, frontendDir) {
  return new Promise((resolve, reject) => {
    let failed = false;

    function spawnInstall(cwd, label) {
      // Use npm ci when a lockfile exists (faster — skips resolution).
      // Fall back to npm install when there is no lockfile.
      const lockfile = path.join(cwd, 'package-lock.json');
      const cmd = fs.existsSync(lockfile) ? 'npm ci' : 'npm install';
      const child = spawn(cmd, { shell: true, cwd, stdio: 'pipe' });

      child.stdout.on('data', (d) => process.stdout.write(`  [${label}] ${d}`));
      child.stderr.on('data', (d) => {
        const line = d.toString();
        // suppress noisy deprecation warnings — only show real errors
        if (!line.includes('npm warn deprecated') && !line.includes('npm warn old lockfile')) {
          process.stderr.write(`  [${label}] ${line}`);
        }
      });

      return new Promise((res, rej) => {
        child.on('close', (code) => {
          if (code !== 0 && !failed) {
            failed = true;
            rej(new Error(`${label} install failed (exit ${code})`));
          } else {
            res();
          }
        });
      });
    }

    Promise.all([
      spawnInstall(backendDir, 'backend'),
      spawnInstall(frontendDir, 'frontend'),
    ]).then(resolve).catch(reject);
  });
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
    'package.json',      // Root package.json (not backend or frontend)
    'package-lock.json',
    'node_modules',
  ];
  for (const entry of devOnly) {
    fs.rmSync(path.join(projectDir, entry), { recursive: true, force: true });
  }

  // ── Generate secrets ───────────────────────────────────────────────────────
  const dbPassword = secret(24);
  const jwtSecret  = secret(48);

  // ── Write backend .env ─────────────────────────────────────────────────────
  writeEnvFile(path.join(projectDir, 'backend', '.env'), `
# NodePress Backend — update DATABASE_URL with your PostgreSQL credentials before starting

# ── Required ──────────────────────────────────────────────────────────────────

# Replace YOUR_PASSWORD and YOUR_NODEPRESS_DATABASE before running migrations
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/YOUR_NODEPRESS_DATABASE"

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
  ok('backend/.env generated with random secrets');

  // ── Write frontend .env.local ──────────────────────────────────────────────
  writeEnvFile(path.join(projectDir, 'frontend', '.env.local'), `
# NodePress Frontend — used only in Next.js server components (not exposed to the browser)

# URL of the running backend (no trailing slash)
BACKEND_URL="http://localhost:3000"
`);
  ok('frontend/.env.local generated');

  // ── Write root .env (for Docker Compose) ──────────────────────────────────
  writeEnvFile(path.join(projectDir, '.env'), `
# Root .env — used by Docker Compose only (docker-compose.yml)
# Do not use this file for backend or frontend configuration directly.

DB_PASSWORD="${dbPassword}"
JWT_SECRET="${jwtSecret}"
CORS_ORIGIN="http://localhost"
APP_URL="http://localhost:3000"
SITE_URL="http://localhost"
`);
  ok('.env generated for Docker Compose');

  // ── Install dependencies (parallel) ───────────────────────────────────────
  info('Installing backend + frontend dependencies in parallel …');
  try {
    await installBoth(
      path.join(projectDir, 'backend'),
      path.join(projectDir, 'frontend'),
    );
    ok('Dependencies installed');
  } catch (err) {
    warn(`Dependency install failed: ${err.message}`);
    warn('Run "npm install" manually inside backend/ and frontend/');
  }

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
    log(`    cd backend`);
    log(`    npx prisma migrate dev           ${c.dim}# create DB tables${c.reset}`);
    log(`    npm run start:dev                ${c.dim}# backend on :3000${c.reset}`);
    log('');
    log(`    cd ../${safeName}/frontend`);
    log(`    npm run dev                      ${c.dim}# admin panel on :5173${c.reset}`);
    log('');
    log(`  ${c.cyan}Option B — Local PostgreSQL:${c.reset}`);
    log(`  ${c.yellow}⚠${c.reset}  Open ${c.bold}${safeName}/backend/.env${c.reset} and update DATABASE_URL with your PostgreSQL password:`);
    log(`    ${c.dim}postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/nodepress${c.reset}`);
    log('');
    log(`    cd ${safeName}/backend`);
    log(`    npx prisma migrate dev           ${c.dim}# create DB tables${c.reset}`);
    log(`    npm run start:dev                ${c.dim}# backend on :3000${c.reset}`);
    log('');
    log(`    cd ${safeName}/frontend`);
    log(`    npm run dev                      ${c.dim}# admin panel on :5173${c.reset}`);
  } else {
    log(`  ${c.bold}Next steps:${c.reset}`);
    log('');
    warn(`Docker not found — using local PostgreSQL (port 5432)`);
    log('');
    log(`  ${c.yellow}1.${c.reset} Open ${c.bold}${safeName}/backend/.env${c.reset} and update DATABASE_URL with your PostgreSQL password:`);
    log(`     ${c.dim}postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/nodepress${c.reset}`);
    log(`     ${c.dim}(No password? Use: postgresql://postgres@localhost:5432/nodepress)${c.reset}`);
    log('');
    log(`  ${c.yellow}2.${c.reset} Run migrations and start the backend:`);
    log(`     cd ${safeName}/backend`);
    log(`     npx prisma migrate dev           ${c.dim}# create DB tables${c.reset}`);
    log(`     npm run start:dev                ${c.dim}# backend on :3000${c.reset}`);
    log('');
    log(`  ${c.yellow}3.${c.reset} Start the frontend:`);
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
