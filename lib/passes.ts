import { getDb, schema } from '@/lib/db';
import { hashPassCode, newId, newPassCode } from '@/lib/id';

export type NewPassInput = { label?: string; perOrderCents: number; totalCents: number; expiresInHours: number; allowedShopIds?: string[] | null };

/** Create a Buyer Pass. The code is returned once here and is never stored in the clear. */
export async function createPass(input: NewPassInput): Promise<{ code: string; pass: typeof schema.buyerPasses.$inferSelect }> {
  const db = await getDb();
  const code = newPassCode();
  const [pass] = await db
    .insert(schema.buyerPasses)
    .values({
      id: newId(),
      codeHash: hashPassCode(code),
      codeHint: code.slice(-4),
      label: (input.label ?? '').slice(0, 80),
      perOrderCents: input.perOrderCents,
      totalCents: input.totalCents,
      allowedShopIds: input.allowedShopIds?.length ? input.allowedShopIds : null,
      expiresAt: new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000),
    })
    .returning();
  return { code, pass };
}
