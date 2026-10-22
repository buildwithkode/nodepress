import { Body, Controller, Get, HttpCode, Post, Put, Request, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuditService } from '../audit/audit.service';
import { ServerSettingsService } from './server-settings.service';
import { MailSettingsDto, MailTestDto, StorageSettingsDto } from './server-settings.dto';

@ApiTags('Settings')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('server-settings')
export class ServerSettingsController {
  constructor(private readonly settings: ServerSettingsService, private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Email and storage settings (secrets are never returned)' })
  get() {
    return this.settings.get();
  }

  @Put('mail')
  @ApiOperation({ summary: 'Save SMTP settings — applies immediately' })
  async saveMail(@Body() dto: MailSettingsDto, @Request() req: any) {
    const res = await this.settings.saveMail(dto);
    await this.log(req, { mail: dto.enabled ? dto.host : 'off' });
    return res;
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('mail/test')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a test email (with the given, or the saved, settings)' })
  testMail(@Body() dto: MailTestDto) {
    return this.settings.testMail(dto.to, dto.host ? { ...dto, enabled: true } : undefined);
  }

  @Put('storage')
  @ApiOperation({ summary: 'Save storage settings — takes effect after a restart' })
  async saveStorage(@Body() dto: StorageSettingsDto, @Request() req: any) {
    const res = await this.settings.saveStorage(dto);
    await this.log(req, { storage: dto.driver === 's3' ? dto.bucket : 'local' });
    return res;
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('storage/test')
  @HttpCode(200)
  @ApiOperation({ summary: 'Write and delete a test object in the bucket' })
  testStorage(@Body() dto: StorageSettingsDto) {
    return this.settings.testStorage(dto.driver === 's3' ? dto : undefined);
  }

  private log(req: any, metadata: Record<string, any>) {
    return this.audit.log({ id: req.user.id, email: req.user.email, ip: req.ip }, 'updated', 'settings', 'server', metadata);
  }
}
