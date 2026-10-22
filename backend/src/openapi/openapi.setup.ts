import { INestApplication } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import { OpenApiService } from './openapi.service';

export const CONTENT_DOCS_PATH = 'api/docs/content';

/**
 * Swagger UI for the generated content API at /api/docs/content. The document
 * is fetched per request (patchDocumentOnRequest), so it follows content type
 * changes without a restart. Call before app.init()/listen() — otherwise the
 * DynamicApi wildcard routes (/:type/:slug) would answer first.
 */
export function setupContentDocs(app: INestApplication) {
  const service = app.get(OpenApiService);
  const placeholder = { openapi: '3.1.0', info: { title: 'NodePress Content API', version: '1' }, paths: {} };
  SwaggerModule.setup(CONTENT_DOCS_PATH, app, placeholder as any, {
    raw: false, // the JSON lives at /api/openapi.json
    customSiteTitle: 'NodePress Content API',
    swaggerOptions: { persistAuthorization: true },
    patchDocumentOnRequest: () => service.document() as any,
  });
}
