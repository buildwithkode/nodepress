import { Controller, Delete, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { JobsService } from './jobs.service';

/** Background job queue inspection — payloads can hold form submissions, so admin only. */
@ApiTags('Jobs')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @SkipThrottle()
  @Get()
  @ApiOperation({ summary: 'List background jobs with status counts (admin)' })
  @ApiQuery({ name: 'status', required: false, description: 'all | pending | done | failed' })
  @ApiQuery({ name: 'type', required: false, description: 'e.g. form.email' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  list(
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.jobs.list({
      status,
      type: type || undefined,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 25,
    });
  }

  // Static path — must stay before ':id' routes.
  @Post('retry-failed')
  @ApiOperation({ summary: 'Requeue all failed jobs, optionally of one type (admin)' })
  @ApiQuery({ name: 'type', required: false })
  retryFailed(@Query('type') type?: string) {
    return this.jobs.retryFailed(type || undefined);
  }

  @Post(':id/retry')
  @ApiOperation({ summary: 'Run a failed job again now with fresh attempts (admin)' })
  retry(@Param('id', ParseIntPipe) id: number) {
    return this.jobs.retry(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a finished (done/failed) job (admin)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.jobs.remove(id);
  }
}
