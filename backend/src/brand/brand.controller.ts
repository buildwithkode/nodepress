import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BrandService } from './brand.service';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Access } from '../auth/decorators/access.decorator';

@ApiTags('Brand')
@Controller('brand')
export class BrandController {
  constructor(private readonly brand: BrandService) {}

  // Public — login, setup, the favicon, and the document title all need the
  // brand before any user is authenticated.
  @Get()
  @ApiOperation({ summary: 'Get the install brand (public)' })
  get() {
    return this.brand.get();
  }

  @Put()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Access('brand', 'edit')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Update the install brand (admin only)' })
  update(@Body() dto: UpdateBrandDto) {
    return this.brand.update(dto);
  }
}
