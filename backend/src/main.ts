// Load environment variables FIRST — before any module is imported
import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    credentials: true,
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
  });

  // ─── Swagger ───────────────────────────────────────────────
  const config = new DocumentBuilder()
    .setTitle('NodePress CMS API')
    .setDescription(
      `Headless CMS REST API.\n\n` +
      `**Auth:** Click "Authorize" and paste your Bearer token from POST /api/auth/login.\n\n` +
      `**Public routes:** GET /api/:type and GET /api/:type/:slug require no auth.\n\n` +
      `**Write routes:** POST, PUT, DELETE require a valid JWT token.`,
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
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true, // keeps token across page refreshes
    },
  });
  // ───────────────────────────────────────────────────────────

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`🚀 Server running on http://localhost:${port}/api`);
  console.log(`📚 API Docs at   http://localhost:${port}/api/docs`);
  console.log(`📁 Uploads at    http://localhost:${port}/uploads`);
}

bootstrap();
