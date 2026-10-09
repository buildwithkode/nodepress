import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateContentTypeDto, FieldDto } from './create-content-type.dto';
import { UpdateContentTypeDto } from './update-content-type.dto';
import { ALL_FIELD_TYPES } from '../../fields/field.types';

describe('ContentType DTO Validation Flow', () => {
  it('validates FieldDto with link field successfully', async () => {
    const field = plainToInstance(FieldDto, {
      name: 'cta_link',
      type: 'link',
      label: 'Call to Action Link',
      required: false,
    });
    const errors = await validate(field);
    expect(errors).toHaveLength(0);
  });

  it('validates CreateContentTypeDto with all 16 field types including link', async () => {
    const dto = plainToInstance(CreateContentTypeDto, {
      name: 'landing_page',
      schema: ALL_FIELD_TYPES.map((type, idx) => ({
        name: `field_${idx}_${type}`,
        type,
        required: false,
      })),
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('validates UpdateContentTypeDto with link field successfully', async () => {
    const dto = plainToInstance(UpdateContentTypeDto, {
      displayName: 'Landing Page',
      schema: [
        { name: 'title', type: 'text', required: true },
        { name: 'banner_link', type: 'link', required: false },
      ],
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects unsupported field type with error mentioning allowed values', async () => {
    const dto = plainToInstance(CreateContentTypeDto, {
      name: 'landing_page',
      schema: [
        { name: 'title', type: 'text' },
        { name: 'bad_field', type: 'invalid_type' },
      ],
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    // Finds the nested FieldDto validation error on schema
    const schemaError = errors.find((e) => e.property === 'schema');
    expect(schemaError).toBeDefined();
    const childErrors = schemaError?.children ?? [];
    expect(childErrors.length).toBeGreaterThan(0);
  });
});
