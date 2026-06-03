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

module.exports = async function createProject(name, opts = {}) {
  const useDocker = opts.docker === true;

  // ── Validate name ──────────────────────────────────────────────────────────
  if (!name) {
    log(`\n  ${c.bold}Usage:${c.reset} npx create-nodepress-app <project-name> [--docker]\n`);
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

  // ── Docker files — keep only when --docker is requested ────────────────────
  if (!useDocker) {
    const dockerOnly = [
      'docker-compose.yml',
      'docker-compose.prod.yml',
      'nginx',         // reverse-proxy config (Docker production only)
      'monitoring',    // Prometheus/Grafana stack (Docker only)
    ];
    for (const entry of dockerOnly) {
      fs.rmSync(path.join(projectDir, entry), { recursive: true, force: true });
    }
  }

  // ── Generate secrets ───────────────────────────────────────────────────────
  const dbPassword = secret(24);
  const jwtSecret  = secret(48);

  // ── Write backend .env ─────────────────────────────────────────────────────
  // Docker: the random password + `nodepress` db match the container Compose
  // provisions, so DATABASE_URL works out of the box. Local: use clear
  // placeholders the user fills in — a random password would just be misleading.
  const databaseUrl = useDocker
    ? `postgresql://postgres:${dbPassword}@localhost:5432/nodepress`
    : 'postgresql://postgres:YOUR_PASSWORD@localhost:5432/YOUR_NODEPRESS_DATABASE';
  const backendEnv = {
    DATABASE_URL:  databaseUrl,
    // Direct (non-pooled) connection — required by the Prisma schema's directUrl.
    // For local Postgres / Docker (no pooler) it's the same as DATABASE_URL.
    DIRECT_URL:    databaseUrl,
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

  // ── Write root .env (for Docker Compose) — only in Docker mode ─────────────
  if (useDocker) {
    const rootEnv = {
      DB_PASSWORD:   dbPassword,
      JWT_SECRET:    jwtSecret,
      CORS_ORIGIN:   'http://localhost',
      APP_URL:       'http://localhost:3000',
      SITE_URL:      'http://localhost',
    };
    writeEnvFile(path.join(projectDir, '.env'), rootEnv);
    ok('.env generated for Docker Compose');
  }

  // ── Write root package.json (convenience scripts) ──────────────────────────
  const scripts = {
    // Generate the Prisma client after install. With npm workspaces the
    // hoisted @prisma/client postinstall can't locate backend/prisma/schema.prisma,
    // so the client is generated here from the backend package instead. Without
    // this the backend fails to compile (`Prisma.InputJsonValue` missing) until
    // the first `prisma migrate`/`generate`.
    postinstall: 'cd backend && npx prisma generate',
    dev: 'concurrently "npm run dev:backend" "npm run dev:frontend"',
    'dev:backend': 'cd backend && npm run start:dev',
    'dev:frontend': 'cd frontend && npm run dev',
    build: 'cd backend && npm run build && cd ../frontend && npm run build',
    migrate: 'cd backend && npx prisma migrate dev',
    studio: 'cd backend && npx prisma studio',
    'install:all': 'npm install',
  };
  if (useDocker) {
    scripts['docker:dev']  = 'docker-compose up -d';
    scripts['docker:prod'] = 'docker-compose -f docker-compose.prod.yml up -d --build';
    scripts['docker:down'] = 'docker-compose down';
  }
  const rootPkg = {
    name: safeName,
    version: '1.0.0',
    private: true,
    workspaces: ['backend', 'frontend'],
    scripts,
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
  // npm workspaces: a single root `npm install` installs backend + frontend too.
  info('Installing dependencies (backend + frontend) …');
  run('npm install', projectDir, 'inherit');
  ok('Dependencies installed');

  // ── Done ───────────────────────────────────────────────────────────────────
  log('');
  log(`  ${c.green}${c.bold}✓ NodePress "${safeName}" is ready!${c.reset}`);
  log('');

  if (useDocker) {
    if (!hasDocker) {
      warn('Docker not found on your machine — install Docker Desktop to use the commands below.');
      log('');
    }
    log(`  ${c.bold}Next steps (Docker — no local PostgreSQL needed):${c.reset}`);
    log('');
    log(`    cd ${safeName}`);
    log(`    docker-compose up -d             ${c.dim}# starts PostgreSQL + Redis${c.reset}`);
    log(`    npm run migrate                  ${c.dim}# create DB tables${c.reset}`);
    log(`    npm run dev                      ${c.dim}# backend :3000 + admin panel :5173${c.reset}`);
  } else {
    log(`  ${c.bold}Next steps:${c.reset}`);
    log('');
    log(`  ${c.yellow}1.${c.reset} Open ${c.bold}${safeName}/backend/.env${c.reset} and set DATABASE_URL — replace YOUR_PASSWORD and YOUR_NODEPRESS_DATABASE:`);
    log(`     ${c.dim}postgresql://postgres:YOUR_PASSWORD@localhost:5432/YOUR_NODEPRESS_DATABASE${c.reset}`);
    log(`     ${c.dim}(No password? Use: postgresql://postgres@localhost:5432/YOUR_NODEPRESS_DATABASE — npm run migrate creates the database for you)${c.reset}`);
    log('');
    log(`  ${c.yellow}2.${c.reset} Run migrations and start both servers:`);
    log(`     cd ${safeName}`);
    log(`     npm run migrate                  ${c.dim}# create DB tables${c.reset}`);
    log(`     npm run dev                      ${c.dim}# backend :3000 + admin panel :5173${c.reset}`);
    log('');
    log(`  ${c.dim}Prefer Docker to run PostgreSQL for you? Re-scaffold with: npx create-nodepress-app <name> --docker${c.reset}`);
  }

  log('');
  log(`  ${c.cyan}Admin panel:${c.reset}  http://localhost:5173`);
  log(`  ${c.cyan}API docs:${c.reset}     http://localhost:3000/api/docs`);
  log(`  ${c.cyan}Health check:${c.reset} http://localhost:3000/api/health`);
  log('');
  log(`  ${c.dim}Docs: https://nodepress.buildwithkode.com${c.reset}`);
  log('');
};
