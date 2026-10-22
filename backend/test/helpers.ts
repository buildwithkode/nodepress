import { INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as express from 'express';
import cookieParser = require('cookie-parser');
import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module';
import { parseQueryString } from '../src/common/query-parser';
import { PrismaService } from '../src/prisma/prisma.service';
import { reloadPluginHost } from '../src/plugin/plugin-loader';

/**
 * AppModule again, with the plugins loaded afresh from the database — what a
 * restart does (AppModule itself loads them once per process).
 */
function rebootedAppModule() {
  const meta = (key: string) => Reflect.getMetadata(key, AppModule) ?? [];
  @Module({
    imports: meta('imports').map((m: any) => (m instanceof Promise ? reloadPluginHost() : m)),
    controllers: meta('controllers'),
    providers: meta('providers'),
  })
  class RebootedAppModule {}
  return RebootedAppModule;
}

/** Boot the full NestJS app against the test database (DATABASE_URL env var).
 *  Mirrors the middleware setup in main.ts so behaviour is identical to production.
 */
export async function createTestApp(opts: { reloadPlugins?: boolean } = {}): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [opts.reloadPlugins ? rebootedAppModule() : AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<NestExpressApplication>();
  app.set('query parser', parseQueryString);

  // ── Mirror main.ts middleware setup exactly ──────────────────────────────
  // express.json must be registered BEFORE app.init() so Apollo Server can
  // parse GraphQL request bodies. Without this, Apollo falls through to the
  // DynamicApiController wildcard /:type which returns 401.
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '500kb' }));
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.setGlobalPrefix('api');
  await app.init();
  return app;
}

/** Wipe all tables that integration tests touch, in safe dependency order. */
export async function cleanDatabase(app: INestApplication) {
  const prisma = app.get(PrismaService);
  // Delete in dependency order (child → parent)
  await prisma.$executeRawUnsafe(`DELETE FROM "releases"`); // cascades to release_items
  await prisma.$executeRawUnsafe(`DELETE FROM "entry_versions"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "entries"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "content_types"`); // cascades to entry_slugs
  await prisma.$executeRawUnsafe(`DELETE FROM "audit_logs"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "webhook_deliveries"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "webhooks"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "api_keys"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "jobs"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "form_submissions"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "forms"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "media"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "permissions"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "password_reset_tokens"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "refresh_tokens"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "users"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "plugin_packages"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "roles"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "components"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "redirects"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "choice_lists"`);
}

/** Register the first admin user and return the token. */
export async function registerAdmin(
  app: INestApplication,
  email = 'admin@test.com',
  password = 'Password123!',
) {
  const res = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ email, password });
  return res.body.access_token as string;
}

/**
 * Invite a team member the way the admin UI does (email + role, no password),
 * then accept the invitation by setting a password through the invite link.
 * Returns the new user's id and a logged-in access token.
 */
export async function inviteUser(
  app: INestApplication,
  adminToken: string,
  email: string,
  role: string,
  password = 'Password123!',
) {
  const server = app.getHttpServer();
  const invite = await request(server)
    .post('/api/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ email, role });
  if (invite.status !== 201) {
    throw new Error(`Invite for ${email} failed: ${invite.status} ${JSON.stringify(invite.body)}`);
  }

  const token = new URL(invite.body.inviteUrl).searchParams.get('token');
  await request(server).post('/api/auth/reset-password').send({ token, password }).expect(201);

  const login = await request(server).post('/api/auth/login').send({ email, password });
  return { id: invite.body.id as number, token: login.body.access_token as string };
}
