import {
  filterUnauthorizedReadFields,
  validateFieldWritePermissions,
} from './field-security.util';
import { FieldDef } from '../fields/field.types';
import { ForbiddenException } from '@nestjs/common';

describe('field-security.util', () => {
  const schema: FieldDef[] = [
    { name: 'title', type: 'text' },
    { name: 'publicPrice', type: 'number' },
    { name: 'internalMargin', type: 'number', readRoles: ['admin', 'editor'], writeRoles: ['admin'] } as any,
    { name: 'secretNotes', type: 'textarea', options: { readRoles: ['admin'] } } as any,
  ];

  describe('filterUnauthorizedReadFields', () => {
    it('allows admin to read all fields', () => {
      const data = { title: 'Test', publicPrice: 100, internalMargin: 20, secretNotes: 'secret' };
      const filtered = filterUnauthorizedReadFields(data, schema, 'admin');
      expect(filtered).toEqual(data);
    });

    it('filters secretNotes for editor but keeps internalMargin', () => {
      const data = { title: 'Test', publicPrice: 100, internalMargin: 20, secretNotes: 'secret' };
      const filtered = filterUnauthorizedReadFields(data, schema, 'editor');
      expect(filtered.title).toBe('Test');
      expect(filtered.internalMargin).toBe(20);
      expect(filtered.secretNotes).toBeUndefined();
    });

    it('filters both secretNotes and internalMargin for viewer and public', () => {
      const data = { title: 'Test', publicPrice: 100, internalMargin: 20, secretNotes: 'secret' };
      const viewerData = filterUnauthorizedReadFields(data, schema, 'viewer');
      expect(viewerData.title).toBe('Test');
      expect(viewerData.publicPrice).toBe(100);
      expect(viewerData.internalMargin).toBeUndefined();
      expect(viewerData.secretNotes).toBeUndefined();

      const publicData = filterUnauthorizedReadFields(data, schema, undefined);
      expect(publicData.internalMargin).toBeUndefined();
      expect(publicData.secretNotes).toBeUndefined();
    });
  });

  describe('validateFieldWritePermissions', () => {
    it('allows admin to write any field', () => {
      expect(() => {
        validateFieldWritePermissions({ internalMargin: 25 }, undefined, schema, 'admin');
      }).not.toThrow();
    });

    it('throws ForbiddenException when editor attempts to modify admin-only field', () => {
      expect(() => {
        validateFieldWritePermissions({ internalMargin: 25 }, { internalMargin: 20 }, schema, 'editor');
      }).toThrow(ForbiddenException);
    });

    it('allows editor to pass through unchanged admin-only field in updates', () => {
      expect(() => {
        validateFieldWritePermissions(
          { title: 'New Title', internalMargin: 20 },
          { title: 'Old Title', internalMargin: 20 },
          schema,
          'editor',
        );
      }).not.toThrow();
    });
  });
});
