import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { houseRuleSchema, type HouseRule } from '@/lib/policy/rules';

export type Shop = typeof schema.shops.$inferSelect;
export type Product = typeof schema.products.$inferSelect;

export async function getShopBySlug(slug: string): Promise<Shop | null> {
  const db = await getDb();
  const [shop] = await db.select().from(schema.shops).where(eq(schema.shops.slug, slug));
  return shop ?? null;
}

export async function listProducts(shopId: string): Promise<Product[]> {
  const db = await getDb();
  return db.select().from(schema.products).where(eq(schema.products.shopId, shopId));
}

/** Confirmed rules only: a rule the merchant has not confirmed is never enforced. */
export async function getHouseRules(shopId: string): Promise<HouseRule[]> {
  const db = await getDb();
  const rows = await db.select().from(schema.houseRules).where(and(eq(schema.houseRules.shopId, shopId), eq(schema.houseRules.confirmed, true)));
  return rows.flatMap((r) => {
    const parsed = houseRuleSchema.safeParse(r.rule);
    return parsed.success ? [parsed.data] : [];
  });
}

const words = (s: string): string[] => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);
const stem = (w: string): string => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);

/** Small keyword search. A shop has tens of products, so no embeddings are needed. */
export function searchProducts(products: Product[], query: string, opts: { category?: string; maxPriceCents?: number } = {}): Product[] {
  const terms = words(query).map(stem);
  const scored = products
    .filter((p) => !opts.category || p.category.toLowerCase() === opts.category.toLowerCase())
    .filter((p) => opts.maxPriceCents === undefined || p.priceCents <= opts.maxPriceCents)
    .map((p) => {
      const name = words(p.name).map(stem);
      const rest = words(`${p.category} ${p.description}`).map(stem);
      const score = terms.reduce((s, t) => s + (name.includes(t) ? 3 : 0) + (rest.includes(t) ? 1 : 0), 0);
      return { p, score };
    });
  const hits = scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  // Nothing matched (or no query): show the whole shelf rather than an empty answer.
  return (hits.length > 0 ? hits : scored).map((x) => x.p);
}
