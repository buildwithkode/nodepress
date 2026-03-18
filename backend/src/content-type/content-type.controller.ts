import {
  Controller, Get, Post, Put, Delete,
  Body, Param, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiResponse,
  ApiBearerAuth, ApiParam,
} from '@nestjs/swagger';
import { ContentTypeService } from './content-type.service';
import { CreateContentTypeDto } from './dto/create-content-type.dto';
import { UpdateContentTypeDto } from './dto/update-content-type.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Content Types')
@Controller('content-types')
export class ContentTypeController {
  constructor(private readonly contentTypeService: ContentTypeService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create a new content type' })
  @ApiResponse({ status: 201, description: 'Content type created' })
  @ApiResponse({ status: 409, description: 'Name already exists' })
  create(@Body() dto: CreateContentTypeDto) {
    return this.contentTypeService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all content types' })
  @ApiResponse({ status: 200, description: 'Array of content types' })
  findAll() {
    return this.contentTypeService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single content type by ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Content type found' })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.contentTypeService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Update a content type' })
  @ApiParam({ name: 'id', type: Number })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateContentTypeDto,
  ) {
    return this.contentTypeService.update(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Delete a content type and all its entries' })
  @ApiParam({ name: 'id', type: Number })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.contentTypeService.remove(id);
  }
}
