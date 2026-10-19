import { ValidationPipe } from '@nestjs/common';
import { CreateContentTypeDto } from './create-content-type.dto';
import { ALL_FIELD_TYPES } from '../../fields/field.types';

// Same options as main.ts, so this is exactly what an API request goes through.
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const validate = (body: any) =>
  pipe.transform(body, { type: 'body', metatype: CreateContentTypeDto });

describe('CreateContentTypeDto', () => {
  it.each([...ALL_FIELD_TYPES])('accepts a "%s" field (every registered field type)', async (type) => {
    await expect(validate({ name: 'thing', schema: [{ name: 'f', type }] })).resolves.toBeDefined();
  });

  it('rejects an unknown field type', async () => {
    await expect(validate({ name: 'thing', schema: [{ name: 'f', type: 'hologram' }] })).rejects.toThrow();
  });
});
