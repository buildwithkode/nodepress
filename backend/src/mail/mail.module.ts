import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

/**
 * MailModule — global singleton email service.
 *
 * Marked @Global so every module (AuthModule, FormsModule) can inject
 * MailService without needing to import MailModule explicitly.
 */
@Global()
@Module({
  providers: [MailService],
  exports:   [MailService],
})
export class MailModule {}
