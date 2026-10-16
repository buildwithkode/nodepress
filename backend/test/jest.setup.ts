// Load .env BEFORE any module is imported — mirrors what main.ts does at runtime.
// Jest imports test files (and their transitive deps like env.ts / AppModule) after
// setupFiles run, so process.env is populated by the time Zod validates it.
import * as dotenv from 'dotenv';
import * as path from 'path';

// .env.test (if present) wins over .env, and real environment variables win over both.
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Never send real email from tests: invites, password resets and form email
// actions would go out through the SMTP account configured in .env (to
// addresses like editor@test.com). With SMTP_HOST blank, MailService skips
// sending and the API returns invite links instead. Blank, not deleted: the
// Prisma client loads .env again on import and would restore a deleted key
// (like dotenv, it never overwrites one that exists). E2E_ALLOW_SMTP=1 overrides.
if (process.env.E2E_ALLOW_SMTP !== '1') {
  process.env.SMTP_HOST = '';
  process.env.SMTP_USER = '';
  process.env.SMTP_PASS = '';
}

// The e2e suite DELETEs every table between tests. Refuse to run it against a
// database that is not on this machine, so a production DATABASE_URL in .env can
// never be wiped by `npm run test:e2e`. Set E2E_ALLOW_REMOTE_DB=1 to override.
const dbUrl = process.env.DATABASE_URL ?? '';
let dbHost = '';
try {
  dbHost = new URL(dbUrl).hostname;
} catch {
  // Unparseable URL — leave dbHost empty so the check below rejects it.
}
const isLocal = ['localhost', '127.0.0.1', '::1', '[::1]', 'postgres', 'db'].includes(dbHost);
if (!isLocal && process.env.E2E_ALLOW_REMOTE_DB !== '1') {
  throw new Error(
    `Refusing to run e2e tests against non-local database host "${dbHost || '(invalid DATABASE_URL)'}". ` +
      'The suite deletes all data. Point DATABASE_URL at a disposable local database ' +
      '(e.g. in backend/.env.test) or set E2E_ALLOW_REMOTE_DB=1.',
  );
}
