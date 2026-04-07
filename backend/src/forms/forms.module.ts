import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';   // provides JwtAuthGuard
import { FormsController } from './forms.controller';
import { SubmitController } from './submit.controller';
import { FormsService } from './forms.service';
import { SubmissionService } from './submission.service';
import { ActionsService } from './actions/actions.service';
import { EmailActionHandler } from './actions/email.action';
import { WebhookActionHandler } from './actions/webhook.action';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [FormsController, SubmitController],
  providers: [
    FormsService,
    SubmissionService,
    ActionsService,
    EmailActionHandler,
    WebhookActionHandler,
  ],
})
export class FormsModule {}
