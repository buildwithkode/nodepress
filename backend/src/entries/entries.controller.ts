import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiResponse,
  ApiBearerAuth, ApiParam, ApiQuery,
} from '@nestjs/swagger';
import { EntriesService } from './entries.service';
import { CreateEntryDto } from './dto/create-entry.dto';
import { UpdateEntryDto } from './dto/update-entry.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Entries')
@Controller('entries')
export class EntriesController {
  constructor(private readonly entriesService: EntriesService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create a new entry' })
  @ApiResponse({ status: 201, description: 'Entry created' })
  @ApiResponse({ status: 409, description: 'Slug already exists in this content type' })
  create(@Body() dto: CreateEntryDto) {
    return this.entriesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List entries (optionally filter by content type)' })
  @ApiQuery({ name: 'contentTypeId', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Array of entries' })
  findAll(
    @Query('contentTypeId', new ParseIntPipe({ optional: true }))
    contentTypeId?: number,
  ) {
    return this.entriesService.findAll(contentTypeId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single entry by ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Entry found' })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.entriesService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Update an entry' })
  @ApiParam({ name: 'id', type: Number })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEntryDto,
  ) {
    return this.entriesService.update(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Delete an entry' })
  @ApiParam({ name: 'id', type: Number })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.entriesService.remove(id);
  }
}
