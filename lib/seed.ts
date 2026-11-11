import { eq } from 'drizzle-orm';
import { schema, type Db } from '@/lib/db';
import { newId } from '@/lib/id';
import { scoreReadiness } from '@/lib/readiness';
import { SEED_SHOPS } from '@/lib/seed-data';

/** Insert the demo shops if they are missing. Safe to run more than once. */
export async function seedDemoShops(db: Db): Promise<{ created: string[] }> {
  const created: string[] = [];
  for (const shop of SEED_SHOPS) {
    const existing = await db.select({ id: schema.shops.id }).from(schema.shops).where(eq(schema.shops.slug, shop.slug));
    if (existing.length > 0) continue;
    const shopId = newId();
    await db.insert(schema.shops).values({
      id: shopId,
      slug: shop.slug,
      name: shop.name,
      tagline: shop.tagline,
      about: shop.about,
      readinessScore: scoreReadiness({ about: shop.about, products: shop.products, rules: shop.rules.map((r) => r.rule) }).score,
      publishedAt: new Date(),
    });
    await db.insert(schema.products).values(shop.products.map((p) => ({ id: newId(), shopId, ...p })));
    await db.insert(schema.houseRules).values(shop.rules.map((r) => ({ id: newId(), shopId, rule: r.rule, sourceText: r.sourceText, confirmed: true })));
    created.push(shop.slug);
  }
  return { created };
}
