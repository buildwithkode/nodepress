// Load environment variables FIRST — before any module is imported
import * as dotenv from 'dotenv';
dotenv.config();

// Increase libuv thread pool from the default 4 → 16.
// Sharp (libvips) uses libuv threads for image encoding. Without this,
// 4+ concurrent image uploads saturate the pool and stall all async I/O.
process.env.UV_THREADPOOL_SIZE = '16';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { join } from 'path';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // ─── Security headers (Helmet) ─────────────────────────────────────────────
  // Sets: X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy,
  // X-XSS-Protection, Content-Security-Policy, and 6 more headers.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow /uploads served to other origins
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],   // needed for Swagger UI
          styleSrc: ["'self'", "'unsafe-inline'"],    // needed for Swagger UI
          imgSrc: ["'self'", 'data:', 'blob:', '*'],  // allow uploaded images
          connectSrc: ["'self'"],
        },
      },
    }),
  );

  // ─── CORS ──────────────────────────────────────────────────────────────────
  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
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
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`🚀 Server running on http://localhost:${port}/api`);
  console.log(`📚 API Docs at   http://localhost:${port}/api/docs`);
  console.log(`📁 Uploads at    http://localhost:${port}/uploads`);
  console.log(`❤️  Health at     http://localhost:${port}/api/health`);
}

bootstrap();
