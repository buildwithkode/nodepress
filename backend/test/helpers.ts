import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as express from 'express';
import cookieParser = require('cookie-parser');
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/** Boot the full NestJS app against the test database (DATABASE_URL env var).
 *  Mirrors the middleware setup in main.ts so behaviour is identical to production.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();

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
  await prisma.$executeRawUnsafe(`DELETE FROM "entry_versions"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "entries"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "content_types"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "audit_logs"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "webhook_deliveries"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "webhooks"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "api_keys"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "form_submissions"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "forms"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "media"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "permissions"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "password_reset_tokens"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "refresh_tokens"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "users"`);
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
