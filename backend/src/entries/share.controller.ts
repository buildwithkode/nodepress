import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { EntryShareService } from './entry-share.service';

/** Public: what a share link shows. No login; the token is the access. */
@ApiTags('Entries')
@Controller('share')
export class ShareController {
  constructor(private readonly share: EntryShareService) {}

  @Get(':token')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Robots-Tag', 'noindex')
  @ApiOperation({ summary: 'Open a share link: the entry (published or not) and its content type, until the link expires' })
  @ApiParam({ name: 'token', type: String })
  open(@Param('token') token: string) {
    return this.share.open(token);
  }
}
