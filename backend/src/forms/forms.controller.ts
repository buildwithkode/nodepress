import {
  Controller, Get, Post, Put, Delete,
  Param, Body, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth, ApiOperation, ApiParam, ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FormsService } from './forms.service';
import { CreateFormDto } from './dto/create-form.dto';
import { UpdateFormDto } from './dto/update-form.dto';

@ApiTags('Forms')
@Controller('forms')
export class FormsController {
  constructor(private readonly forms: FormsService) {}

  // ── Recent submissions across all forms (dashboard) ─────────────────────

  @Get('submissions/recent')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get 6 most recent submissions across all forms (dashboard)' })
  recentSubmissions() {
    return this.forms.findRecentSubmissions(6);
  }

  // ── CRUD (JWT required) ──────────────────────────────────────────────────

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create a new form' })
  create(@Body() dto: CreateFormDto) {
    return this.forms.create(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List all forms (with submission counts)' })
  findAll() {
    return this.forms.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get a single form by id' })
  @ApiParam({ name: 'id', type: Number })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.forms.findOne(id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Update a form' })
  @ApiParam({ name: 'id', type: Number })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFormDto,
  ) {
    return this.forms.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Delete a form (and all its submissions)' })
  @ApiParam({ name: 'id', type: Number })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.forms.remove(id);
  }

  // ── Submissions (admin view) ─────────────────────────────────────────────

  @Get(':id/submissions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List all submissions for a form' })
  @ApiParam({ name: 'id', type: Number })
  async submissions(@Param('id', ParseIntPipe) id: number) {
    await this.forms.findOne(id); // validates form exists
    return this.forms.findSubmissions(id);
  }
}
