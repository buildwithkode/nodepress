import { PartialType } from '@nestjs/swagger';
import { CreateFormDto } from './create-form.dto';

// All fields become optional — standard NestJS pattern
export class UpdateFormDto extends PartialType(CreateFormDto) {}
