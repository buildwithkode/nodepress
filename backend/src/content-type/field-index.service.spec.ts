import { FieldIndexService, fieldIndexName, indexedFieldNames } from './field-index.service';

describe('field indexes', () => {
  it('indexes only flagged, top-level scalar fields with safe names', () => {
    const schema = [
      { name: 'category', type: 'select', indexed: true },
      { name: 'price', type: 'number', indexed: true },
      { name: 'body', type: 'richtext', indexed: true },   // not indexable
      { name: 'title', type: 'text' },                     // not flagged
      { name: 'bad"name', type: 'text', indexed: true },   // unsafe identifier
    ];
    expect(indexedFieldNames(schema)).toEqual(['category', 'price']);
  });

  it('keeps index names within the 63-char Postgres limit and unique', () => {
    const a = fieldIndexName(7, 'a'.repeat(80));
    const b = fieldIndexName(7, 'a'.repeat(79) + 'b');
    expect(a.length).toBeLessThanOrEqual(63);
    expect(a).not.toBe(b);
    expect(fieldIndexName(7, 'price')).toBe('entries_f_7_price');
  });

  it('creates missing indexes and drops ones no longer wanted', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        { name: 'entries_f_3_old', valid: true },
        { name: 'entries_f_3_price', valid: true },
      ]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    };
    const svc = new FieldIndexService(prisma as any);

    await svc.sync(3, [
      { name: 'price', type: 'number', indexed: true },
      { name: 'category', type: 'select', indexed: true },
    ]);

    const sql = prisma.$executeRawUnsafe.mock.calls.map((c) => c[0]);
    expect(sql).toContain('DROP INDEX CONCURRENTLY IF EXISTS "entries_f_3_old"');
    expect(sql).toContain(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "entries_f_3_category" ON "entries" (("data" #> '{category}')) WHERE "contentTypeId" = 3`,
    );
    expect(sql.some((q: string) => q.includes('entries_f_3_price'))).toBe(false);
  });

  it('never throws, so a failed index build cannot fail the schema save', async () => {
    const prisma = { $queryRaw: jest.fn().mockRejectedValue(new Error('boom')), $executeRawUnsafe: jest.fn() };
    await expect(new FieldIndexService(prisma as any).sync(1, [])).resolves.toBeUndefined();
  });
});
