import { Controller, Get, Header } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OpenApiService } from './openapi.service';

@ApiTags('Dynamic API')
@Controller()
export class OpenApiController {
  constructor(private readonly openApi: OpenApiService) {}

  @Get('openapi.json')
  @Header('Cache-Control', 'no-cache')
  @ApiOperation({
    summary: 'OpenAPI 3.1 document for the content API (public)',
    description: 'Paths and schemas for every content type: list, get by slug, create, update, delete — as allowedMethods permits. Fields hidden from public reads are left out.',
  })
  @ApiResponse({ status: 200, description: 'OpenAPI 3.1 JSON document' })
  document() {
    return this.openApi.document();
  }
}
