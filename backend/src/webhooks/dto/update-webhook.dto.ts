import { PartialType } from '@nestjs/swagger';
import { CreateWebhookDto } from './create-webhook.dto';

// All fields become optional — standard NestJS pattern
export class UpdateWebhookDto extends PartialType(CreateWebhookDto) {}
