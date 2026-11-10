'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { aiConfigured } from '@/lib/ai';
import { looksLikeCsv, parseProductsCsv } from '@/lib/onboarding/csv';
import { extractProducts } from '@/lib/onboarding/extract';
import { publishShop } from '@/lib/onboarding/publish';
import { translateRules } from '@/lib/onboarding/rules';
import { describeRule, type HouseRule } from '@/lib/policy/rules';

export type DraftProduct = { name: string; category: string; priceCents: number; description: string; inStock: boolean; confidence: number };
export type DraftRule = { rule: HouseRule; sourceText: string; label: string };

export type Draft = {
  name: string;
  tagline: string;
  about: string;
  products: DraftProduct[];
  skipped: string[];
  rules: DraftRule[];
  notUnderstood: string[];
  readProductsWithAi: boolean;
  readRulesWithAi: boolean;
};

export type DraftState = { error?: string; draft?: Draft };

const draftInput = z.object({
  name: z.string().trim().min(2, 'Give your shop a name.').max(60),
  tagline: z.string().trim().max(120),
  about: z.string().trim().max(2000),
  catalog: z.string().max(60000),
  rules: z.string().max(2000),
});

/** Step 1: read the merchant's catalog and rules into a draft. Nothing is saved yet. */
export async function draftShopAction(_prev: DraftState, form: FormData): Promise<DraftState> {
  const parsed = draftInput.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' };
  const v = parsed.data;
  if (!v.catalog.trim()) return { error: 'Paste your product list so agents have something to buy.' };

  let products: DraftProduct[] = [];
  let skipped: string[] = [];
  let readProductsWithAi = false;
  if (looksLikeCsv(v.catalog)) {
    const csv = parseProductsCsv(v.catalog);
    products = csv.products.map((p) => ({ ...p, confidence: 1 }));
    skipped = csv.skipped;
  } else if (aiConfigured()) {
    try {
      products = await extractProducts(v.catalog);
      readProductsWithAi = true;
    } catch (err) {
      console.error('product extraction failed', err);
      return { error: 'We could not read that list just now. Try again, or paste it as CSV with "name" and "price" columns.' };
    }
  } else {
    return { error: 'Paste your products as CSV. The first line must name the columns, for example: name,price,category,description' };
  }
  if (products.length === 0) return { error: skipped[0] ?? 'We found no products with a price in that list.' };

  const categories = [...new Set(products.map((p) => p.category))];
  const translated = await translateRules(v.rules, categories);

  return {
    draft: {
      name: v.name,
      tagline: v.tagline,
      about: v.about,
      products,
      skipped,
      rules: translated.proposals.map((p) => ({ ...p, label: describeRule(p.rule) })),
      notUnderstood: translated.notUnderstood,
      readProductsWithAi,
      readRulesWithAi: translated.usedAi,
    },
  };
}

/** Step 2: publish the reviewed draft. publishShop validates every field again. */
export async function publishShopAction(draft: Draft, confirmedRuleIndexes: number[]): Promise<{ error: string }> {
  let slug: string;
  try {
    const rules = draft.rules.filter((_, i) => confirmedRuleIndexes.includes(i)).map((r) => ({ rule: r.rule, sourceText: r.sourceText }));
    ({ slug } = await publishShop({ name: draft.name, tagline: draft.tagline, about: draft.about, products: draft.products, rules }));
  } catch (err) {
    console.error('publish failed', err);
    return { error: 'We could not publish the shop. Nothing was saved. Check the details and try again.' };
  }
  redirect(`/s/${slug}?new=1`);
}
