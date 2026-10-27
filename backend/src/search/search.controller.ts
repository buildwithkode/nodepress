import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Access } from '../auth/decorators/access.decorator';
import { SearchService } from './search.service';

@ApiTags('Search')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Access('server_settings', 'view')
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get('status')
  @ApiOperation({ summary: 'Which search engine answers ?search= (admin)' })
  status() {
    return this.search.status();
  }

  @Access('server_settings', 'edit')
  @Post('reindex')
  @ApiOperation({ summary: 'Rebuild the external search index in the background (admin)' })
  async reindex() {
    if (!this.search.external) return { queued: false, reason: 'SEARCH_DRIVER is postgres — its index is always current' };
    await this.search.reindex();
    return { queued: true };
  }
}
