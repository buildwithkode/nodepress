import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BrandService } from './brand.service';
import { BrandController } from './brand.controller';

// Global so MailService (and anything else) can inject BrandService without
// re-importing this module.
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [BrandController],
  providers: [BrandService],
  exports: [BrandService],
})
export class BrandModule {}
