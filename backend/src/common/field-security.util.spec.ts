import {
  fieldRoleNames,
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

  describe('custom roles', () => {
    const rules: FieldDef[] = [
      { name: 'title', type: 'text' },
      { name: 'review_notes', type: 'textarea', readRoles: ['reviewer'], writeRoles: ['reviewer'] } as any,
      { name: 'margin', type: 'number', options: { readRoles: ['editor'], writeRoles: ['editor'] } } as any,
    ];
    const data = { title: 'T', review_notes: 'n', margin: 5 };

    it('fieldRoleNames lists the custom role and the base role', () => {
      expect(fieldRoleNames({ role: 'contributor', customRole: 'reviewer' })).toEqual(['reviewer', 'contributor']);
      expect(fieldRoleNames({ role: 'editor' })).toEqual(['editor']);
      expect(fieldRoleNames('viewer')).toEqual(['viewer']);
      expect(fieldRoleNames(undefined)).toEqual([]);
    });

    it('a read rule matches the custom role name or the base role', () => {
      expect(filterUnauthorizedReadFields(data, rules, { role: 'contributor', customRole: 'reviewer' }))
        .toEqual({ title: 'T', review_notes: 'n' });
      expect(filterUnauthorizedReadFields(data, rules, { role: 'editor', customRole: 'lead' }))
        .toEqual({ title: 'T', margin: 5 });
      expect(filterUnauthorizedReadFields(data, rules, { role: 'viewer', customRole: 'auditor' }))
        .toEqual({ title: 'T' });
      // The single-string form still works.
      expect(filterUnauthorizedReadFields(data, rules, 'editor')).toEqual({ title: 'T', margin: 5 });
    });

    it('a write rule matches the custom role name or the base role', () => {
      const reviewer = { role: 'contributor', customRole: 'reviewer' };
      expect(() => validateFieldWritePermissions({ review_notes: 'x' }, undefined, rules, reviewer)).not.toThrow();
      expect(() => validateFieldWritePermissions({ margin: 1 }, undefined, rules, reviewer)).toThrow(ForbiddenException);
      expect(() => validateFieldWritePermissions({ margin: 1 }, undefined, rules, { role: 'editor', customRole: 'lead' })).not.toThrow();
      expect(() => validateFieldWritePermissions({ review_notes: 'x' }, undefined, rules, 'contributor')).toThrow(ForbiddenException);
    });

    it('admin as the base role still bypasses every rule', () => {
      expect(filterUnauthorizedReadFields(data, rules, { role: 'admin' })).toEqual(data);
    });
  });
});
