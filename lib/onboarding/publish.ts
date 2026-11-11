import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema } from '@/lib/db';
import { newId } from '@/lib/id';
import * as paypal from '@/lib/paypal';
import { houseRuleSchema } from '@/lib/policy/rules';
import { scoreReadiness } from '@/lib/readiness';
import { MAX_PRODUCTS } from './csv';

/** Everything the review screen sends back is checked again here. The browser is never trusted. */
export const publishInput = z.object({
  name: z.string().trim().min(2).max(60),
  tagline: z.string().trim().max(120).default(''),
  about: z.string().trim().max(2000).default(''),
  products: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        category: z.string().trim().toLowerCase().max(40).default('general'),
        priceCents: z.number().int().positive().max(10_000_00),
        description: z.string().max(500).default(''),
        inStock: z.boolean().default(true),
        confidence: z.number().min(0).max(1).default(1),
      }),
    )
    .min(1)
    .max(MAX_PRODUCTS),
  /** Only rules the merchant ticked. Unticked proposals are never stored. */
  rules: z.array(z.object({ rule: houseRuleSchema, sourceText: z.string().max(300).default('') })).max(12),
});

export type PublishInput = z.infer<typeof publishInput>;

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'shop';
}

/** How many products are mirrored to the PayPal Catalog inline, to keep publishing fast. */
const CATALOG_SYNC_LIMIT = 30;

export async function publishShop(raw: unknown): Promise<{ slug: string; score: number; catalogSynced: number }> {
  const input = publishInput.parse(raw);
  const db = await getDb();

  let slug = slugify(input.name);
  for (let n = 2; (await db.select({ id: schema.shops.id }).from(schema.shops).where(eq(schema.shops.slug, slug))).length > 0; n++) {
    slug = `${slugify(input.name)}-${n}`;
  }

  const { score } = scoreReadiness({ about: input.about, products: input.products, rules: input.rules.map((r) => r.rule) });
  const shopId = newId();
  const products = input.products.map((p) => ({ id: newId(), shopId, ...p }));

  await db.insert(schema.shops).values({ id: shopId, slug, name: input.name, tagline: input.tagline, about: input.about, readinessScore: score, publishedAt: new Date() });
  await db.insert(schema.products).values(products);
  if (input.rules.length > 0) {
    await db.insert(schema.houseRules).values(input.rules.map((r) => ({ id: newId(), shopId, rule: r.rule, sourceText: r.sourceText, confirmed: true })));
  }

  // Mirror the catalog into PayPal. Best effort: the shop is live either way, and
  // PayPal-Request-Id makes a later retry safe.
  let catalogSynced = 0;
  if (paypal.paypalConfigured()) {
    const results = await Promise.allSettled(
      products.slice(0, CATALOG_SYNC_LIMIT).map(async (p) => {
        const created = await paypal.createCatalogProduct({ requestId: `catalog-${p.id}`, name: p.name, description: p.description });
        await db.update(schema.products).set({ paypalProductId: created.id }).where(eq(schema.products.id, p.id));
      }),
    );
    catalogSynced = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.find((r) => r.status === 'rejected');
    if (failed) console.error('PayPal catalog sync failed for some products', (failed as PromiseRejectedResult).reason);
  }
  return { slug, score, catalogSynced };
}
