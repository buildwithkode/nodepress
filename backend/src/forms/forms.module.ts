import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';   // provides JwtAuthGuard
import { MailModule } from '../mail/mail.module';
import { FormsController } from './forms.controller';
import { SubmitController } from './submit.controller';
import { FormsService } from './forms.service';
import { SubmissionService } from './submission.service';
import { ActionsService } from './actions/actions.service';
import { EmailActionHandler, EmailReplyActionHandler } from './actions/email.action';
import { WebhookActionHandler } from './actions/webhook.action';
import { CaptchaService } from './captcha.service';

@Module({
  imports: [PrismaModule, AuthModule, MailModule],
  controllers: [FormsController, SubmitController],
  providers: [
    FormsService,
    SubmissionService,
    ActionsService,
    EmailActionHandler,
    EmailReplyActionHandler,
    WebhookActionHandler,
    CaptchaService,
  ],
})
export class FormsModule {}
