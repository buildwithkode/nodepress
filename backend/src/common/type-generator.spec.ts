import { generateTypeScriptDefinitions, toPascalCase } from './type-generator';
import { FieldDef } from '../fields/field.types';

describe('type-generator', () => {
  it('converts names to PascalCase', () => {
    expect(toPascalCase('blog_post')).toBe('BlogPost');
    expect(toPascalCase('user-profile')).toBe('UserProfile');
    expect(toPascalCase('product')).toBe('Product');
  });

  it('generates accurate TypeScript definitions for content types with various fields', () => {
    const schema: FieldDef[] = [
      { name: 'title', type: 'text', required: true },
      { name: 'price', type: 'number' },
      { name: 'inStock', type: 'boolean', required: true },
      { name: 'category', type: 'select', options: { choices: ['tech', 'gaming'] } },
      { name: 'gallery', type: 'repeater', options: { subFields: [{ name: 'image', type: 'image', required: true }, { name: 'caption', type: 'text' }] } },
      {
        name: 'pageBuilder',
        type: 'flexible',
        options: {
          layouts: [
            { name: 'hero', fields: [{ name: 'heading', type: 'text', required: true }] },
            { name: 'cta', fields: [{ name: 'buttonText', type: 'text' }] },
          ],
        },
      },
    ];

    const result = generateTypeScriptDefinitions([
      {
        name: 'product',
        label: 'Product',
        schema,
      },
    ]);

    expect(result).toContain('export interface ProductData {');
    expect(result).toContain('title: string;');
    expect(result).toContain('price?: number;');
    expect(result).toContain('inStock: boolean;');
    expect(result).toContain('category?: "tech" | "gaming";');
    expect(result).toContain('gallery?: Array<{');
    expect(result).toContain('image: { url: string; alt?: string };');
    expect(result).toContain('caption?: string;');
    expect(result).toContain('_layout: "hero";');
    expect(result).toContain('_layout: "cta";');
    expect(result).toContain('export type ProductEntry = BaseEntry<ProductData>;');
    expect(result).toContain('"product": ProductEntry;');
  });
});
