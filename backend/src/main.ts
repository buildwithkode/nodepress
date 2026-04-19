// Copyright (c) 2026-present Karthik Paulraj / BuildWithKode
// Licensed under the MIT License. See LICENSE file in the project root for details.

// Load environment variables FIRST — before any module is imported
import * as dotenv from 'dotenv';
dotenv.config();

// Validate all env vars immediately — crashes loudly if anything is missing or malformed.
// Import AFTER dotenv.config() so process.env is populated before Zod parses it.
import { env } from './config/env';

// Sentry MUST be initialised before any other import (instruments require() calls)
import './instrument';

// Increase libuv thread pool from the default 4 → 16.
// Sharp (libvips) uses libuv threads for image encoding. Without this,
// 4+ concurrent image uploads saturate the pool and stall all async I/O.
process.env.UV_THREADPOOL_SIZE = '16';

import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { join } from 'path';
import helmet from 'helmet';
import * as express from 'express';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { SentryExceptionFilter } from './common/sentry-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Suppress NestJS's default logger — pino takes over after bootstrap
    bufferLogs: true,
  });

  // Use pino as the application logger (replaces NestJS's default console logger)
  app.useLogger(app.get(Logger));

  // ─── Sentry global exception filter ───────────────────────────────────────
  // Captures all 5xx errors and sends them to Sentry. No-op when SENTRY_DSN is unset.
  const { httpAdapter } = app.get(HttpAdapterHost);
  app.useGlobalFilters(new SentryExceptionFilter(httpAdapter));

  // ─── Security headers (Helmet) ─────────────────────────────────────────────
  // Sets: X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy,
  // X-XSS-Protection, Content-Security-Policy, and 6 more headers.
  // CSP is disabled — this is an API server serving JSON, not user-facing HTML.
  // Swagger UI and GraphQL Playground both need external CDN resources that CSP would block.
  // Other Helmet protections (HSTS, X-Frame-Options, X-Content-Type-Options, etc.) remain active.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow /uploads served to other origins
      contentSecurityPolicy: false,
    }),
  );

  // ─── Request body size limits ──────────────────────────────────────────────
  // Prevents memory exhaustion via large JSON payloads.
  // Multer enforces its own 10 MB limit on file uploads separately.
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '500kb' }));

  // ─── Content-Type enforcement ──────────────────────────────────────────────
  // Mutating requests (POST/PUT/PATCH/DELETE) must send application/json or
  // multipart/form-data (for file uploads). This prevents CSRF via HTML form
  // submission, since browsers cannot set application/json cross-origin without
  // a CORS preflight that this server already restricts.
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    const method = req.method;
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return next();

    const ct = req.headers['content-type'] ?? '';
    if (
      ct.includes('application/json') ||
      ct.includes('multipart/form-data') ||
      ct.includes('application/x-www-form-urlencoded')
    ) {
      return next();
    }

    // Allow requests with no body (e.g. DELETE with empty body)
    const contentLength = req.headers['content-length'];
    if (!contentLength || contentLength === '0') return next();

    res.status(415).json({ message: 'Unsupported Media Type' });
  });

  // ─── CORS ──────────────────────────────────────────────────────────────────
  // CORS_ORIGIN is now required — validated by env.ts at startup.
  // Supports comma-separated origins: "https://app.com,https://staging.app.com"
  const origins = env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
  app.enableCors({
    origin: origins.length === 1 ? origins[0] : origins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    credentials: true,
  });

  app.use(cookieParser());
  app.setGlobalPrefix('api');

  // ─── Validation ────────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // ─── Static uploads ────────────────────────────────────────────────────────
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
  });

  // ─── Swagger ───────────────────────────────────────────────────────────────
  const config = new DocumentBuilder()
    .setTitle('NodePress CMS API')
    .setDescription(
      `Headless CMS REST API.\n\n` +
      `**Auth:** Click "Authorize" and paste your Bearer token from POST /api/auth/login.\n\n` +
      `**Public routes:** GET /api/:type and GET /api/:type/:slug require no auth.\n\n` +
      `**Write routes:** POST, PUT, DELETE require a valid JWT token.\n\n` +
      `**Rate limits:** 120 req/min default · 10 req/min on login/register · 20 req/min on form submit`,
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'JWT',
    )
    .addTag('Auth', 'Register, login, and get current user')
    .addTag('Content Types', 'Manage content type schemas')
    .addTag('Entries', 'Manage content entries')
    .addTag('Dynamic API', 'Auto-generated public API per content type')
    .addTag('Media', 'File upload and management')
    .addTag('Forms', 'Dynamic form builder — create forms, collect submissions, trigger actions')
    .addTag('Health', 'System health and uptime check')
    .addTag('Plugins', 'Registered plugin registry')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  // ─── Graceful shutdown ─────────────────────────────────────────────────────
  // enableShutdownHooks() makes NestJS listen for SIGTERM/SIGINT and call
  // OnModuleDestroy on all providers (PrismaService.$disconnect, Redis.quit, etc.)
  app.enableShutdownHooks();

  const port = env.PORT;
  await app.listen(port);

  console.log(`🚀 Server running on http://localhost:${port}/api`);
  console.log(`📚 API Docs at   http://localhost:${port}/api/docs`);
  console.log(`📁 Uploads at    http://localhost:${port}/uploads`);
  console.log(`❤️  Health at     http://localhost:${port}/api/health`);
}

bootstrap();
