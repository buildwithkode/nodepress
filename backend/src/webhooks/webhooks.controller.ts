import {
  Controller, Get, Post, Delete, Patch,
  Param, Body, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { WebhooksService } from './webhooks.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Webhooks')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post()
  @ApiOperation({ summary: 'Register a new webhook (admin)' })
  create(@Body() dto: CreateWebhookDto) {
    return this.webhooksService.create(dto);
  }

  @SkipThrottle()
  @Get()
  @ApiOperation({ summary: 'List all webhooks (admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.webhooksService.findAll(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @SkipThrottle()
  @Get('deliveries')
  @ApiOperation({ summary: 'List webhook delivery log (admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findDeliveries(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.webhooksService.findDeliveries(
      undefined,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 25,
    );
  }

  @Patch(':id/toggle')
  @ApiOperation({ summary: 'Enable or disable a webhook (admin)' })
  @ApiParam({ name: 'id', type: Number })
  toggle(@Param('id', ParseIntPipe) id: number, @Body('enabled') enabled: boolean) {
    return this.webhooksService.toggle(id, enabled);
  }

  @Post(':id/ping')
  @ApiOperation({ summary: 'Send a test ping to a webhook (admin)' })
  @ApiParam({ name: 'id', type: Number })
  ping(@Param('id', ParseIntPipe) id: number) {
    return this.webhooksService.ping(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a webhook (admin)' })
  @ApiParam({ name: 'id', type: Number })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.webhooksService.remove(id);
  }
}
