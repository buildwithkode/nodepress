import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Access } from '../auth/decorators/access.decorator';
import { AiService } from './ai.service';

class ContentModelDto {
  @IsString()
  @MaxLength(4000)
  prompt: string;
}

class DraftEntryDto {
  @IsInt()
  contentTypeId: number;

  @IsString()
  @MaxLength(4000)
  prompt: string;

  @IsOptional()
  @IsObject()
  current?: Record<string, unknown>;
}

@ApiTags('AI')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('status')
  @ApiOperation({ summary: 'Whether AI help is configured (ANTHROPIC_API_KEY)' })
  status() {
    return this.ai.status();
  }

  @Access('content_model', 'edit')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('content-model')
  @ApiOperation({ summary: 'Suggest a content type from a description (not saved)' })
  contentModel(@Body() dto: ContentModelDto) {
    return this.ai.generateContentModel(dto.prompt);
  }

  @Access('content', 'edit')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post('draft')
  @ApiOperation({ summary: 'Draft field values for an entry (not saved)' })
  draft(@Body() dto: DraftEntryDto) {
    return this.ai.draftEntry(dto.contentTypeId, dto.prompt, dto.current);
  }
}
