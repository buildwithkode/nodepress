import {
  Body, Controller, Delete, ExecutionContext, ForbiddenException, Get, Injectable, Param, ParseIntPipe, Post, Put,
  Query, Request, Res, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuditService } from '../audit/audit.service';
import { ChoiceListsService } from './choice-lists.service';
import { CreateChoiceListDto, UpdateChoiceListDto } from './dto/choice-list.dto';

/** Short public cache: a CDN or the site's fetch cache absorbs repeat reads. */
const PUBLIC_CACHE_CONTROL = 'public, max-age=60';

/** `GET /choice-lists?names=…` is public; the plain list (with usage) is admin-only. */
@Injectable()
class PublicNamesOrAdminGuard extends JwtAuthGuard {
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    if (typeof req.query?.names === 'string') return true;
    await super.canActivate(ctx); // throws 401 without a valid token
    if (req.user?.role !== 'admin') throw new ForbiddenException('This action requires one of these roles: admin');
    return true;
  }
}

@ApiTags('Choice lists')
@Controller('choice-lists')
export class ChoiceListsController {
  constructor(
    private readonly lists: ChoiceListsService,
    private readonly auditService: AuditService,
  ) {}

  @UseGuards(PublicNamesOrAdminGuard)
  @Get()
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'With ?names=a,b: the named lists (public — name, label, choices). Without: every list with its usage (admin only)',
  })
  @ApiQuery({ name: 'names', required: false, example: 'gender,country' })
  findAll(@Query('names') names: string | undefined, @Res({ passthrough: true }) res: Response) {
    if (typeof names === 'string') {
      res.setHeader('Cache-Control', PUBLIC_CACHE_CONTROL);
      return this.lists.publicMany(names.split(','));
    }
    res.setHeader('Cache-Control', 'private, no-store');
    return this.lists.findAll();
  }

  @Get(':name')
  @ApiOperation({ summary: 'One choice list by name (public — name, label, choices)' })
  @ApiParam({ name: 'name', example: 'gender' })
  @ApiResponse({ status: 404, description: 'No list with this name' })
  findOne(@Param('name') name: string, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', PUBLIC_CACHE_CONTROL);
    return this.lists.publicOne(name);
  }

  // ─── Write routes — admin only ─────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT')
  @Post()
  @ApiOperation({ summary: 'Create a choice list (admin only)' })
  @ApiResponse({ status: 409, description: 'Name already exists' })
  async create(@Body() dto: CreateChoiceListDto, @Request() req: any) {
    const list = await this.lists.create(dto);
    await this.auditService.log(
      { id: req.user.id, email: req.user.email, ip: req.ip },
      'created', 'choice_list', list.name,
    );
    return list;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT')
  @Put(':id')
  @ApiOperation({
    summary: 'Update a choice list and every content type and component that uses it (admin only). ' +
      'removedValuesInUse counts entries still holding a removed value.',
  })
  @ApiParam({ name: 'id', type: Number })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateChoiceListDto, @Request() req: any) {
    const list = await this.lists.update(id, dto, req.user.id);
    await this.auditService.log(
      { id: req.user.id, email: req.user.email, ip: req.ip },
      'updated', 'choice_list', list.name,
      {
        updatedContentTypes: list.updatedContentTypes.map((c) => c.name),
        ...(list.removedValues ? { removedValues: list.removedValues } : {}),
      },
    );
    return list;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT')
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a choice list (admin only) — 409 while a field uses it' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 409, description: 'Choice list is in use' })
  async remove(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    const list = await this.lists.remove(id);
    await this.auditService.log(
      { id: req.user.id, email: req.user.email, ip: req.ip },
      'deleted', 'choice_list', list.name,
    );
    return list;
  }
}
