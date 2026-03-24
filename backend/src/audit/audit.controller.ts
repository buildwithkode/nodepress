import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Audit Log')
@Controller('audit-log')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@ApiBearerAuth('JWT')
export class AuditController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List audit log entries (admin only)' })
  @ApiQuery({ name: 'resource', required: false, description: 'Filter by resource type' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Paginated audit log' })
  async findAll(
    @Query('resource') resource?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const p = Math.max(1, parseInt(page ?? '1', 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit ?? '50', 10) || 50));
    const skip = (p - 1) * l;

    const where = resource ? { resource } : {};

    const [total, data] = await Promise.all([
      (this.prisma as any).auditLog.count({ where }),
      (this.prisma as any).auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: l,
      }),
    ]);

    return { data, meta: { total, page: p, limit: l, totalPages: Math.ceil(total / l) } };
  }
}
