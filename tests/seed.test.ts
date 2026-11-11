import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { describe, expect, it } from 'vitest';
import { ensureSchema, schema, type Db } from '@/lib/db';
import { houseRuleSchema } from '@/lib/policy/rules';
import { seedDemoShops } from '@/lib/seed';
import { SEED_SHOPS } from '@/lib/seed-data';

describe('seed', () => {
  it('creates the schema and the demo shops once', async () => {
    const db = drizzle(new PGlite(), { schema }) as unknown as Db;
    await ensureSchema(db);
    expect((await seedDemoShops(db)).created).toHaveLength(SEED_SHOPS.length);
    expect((await seedDemoShops(db)).created).toHaveLength(0);
    const products = await db.select().from(schema.products);
    expect(products.length).toBe(SEED_SHOPS.reduce((n, s) => n + s.products.length, 0));
    const rules = await db.select().from(schema.houseRules);
    for (const r of rules) expect(houseRuleSchema.safeParse(r.rule).success).toBe(true);
  });
});
