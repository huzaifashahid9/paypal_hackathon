'use server';

import { z } from 'zod';
import { getDb, schema } from '@/lib/db';
import { createPass } from '@/lib/passes';

const input = z.object({
  label: z.string().max(80),
  perOrder: z.coerce.number().min(1).max(10000),
  total: z.coerce.number().min(1).max(100000),
  hours: z.coerce.number().int().min(1).max(24 * 30),
  shop: z.string(),
});

export type PassFormState = {
  error?: string;
  pass?: { code: string; label: string; perOrderCents: number; totalCents: number; expiresAt: string; shops: string };
};

export async function createPassAction(_prev: PassFormState, form: FormData): Promise<PassFormState> {
  const parsed = input.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: 'Check the amounts: each must be a number above zero.' };
  const v = parsed.data;
  if (v.perOrder > v.total) return { error: 'The per-order limit cannot be more than the total budget.' };

  const db = await getDb();
  const shops = await db.select({ id: schema.shops.id, name: schema.shops.name }).from(schema.shops);
  const chosen = shops.find((s) => s.id === v.shop);
  const { code, pass } = await createPass({
    label: v.label,
    perOrderCents: Math.round(v.perOrder * 100),
    totalCents: Math.round(v.total * 100),
    expiresInHours: v.hours,
    allowedShopIds: chosen ? [chosen.id] : null,
  });
  return {
    pass: {
      code,
      label: pass.label,
      perOrderCents: pass.perOrderCents,
      totalCents: pass.totalCents,
      expiresAt: pass.expiresAt.toISOString(),
      shops: chosen ? chosen.name : 'Any OpenShelf shop',
    },
  };
}
