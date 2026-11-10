import { z } from 'zod';

/**
 * House Rules are the ONLY things a merchant can ask of agents. The list is closed on
 * purpose: AI may translate a merchant's words into these shapes, but it cannot invent
 * a new kind of rule, and the engine in ./engine.ts is the only thing that enforces them.
 */
export const houseRuleSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('fulfillment_window'),
    method: z.enum(['pickup', 'delivery', 'any']),
    /** Allowed weekdays, 0 = Sunday … 6 = Saturday. */
    days: z.array(z.number().int().min(0).max(6)).min(1),
  }),
  z.object({ type: z.literal('hold_above_amount'), cents: z.number().int().positive() }),
  z.object({ type: z.literal('excluded_category'), category: z.string().min(1) }),
  z.object({ type: z.literal('auto_refund_below'), cents: z.number().int().positive() }),
  z.object({ type: z.literal('max_quantity_per_item'), quantity: z.number().int().positive() }),
]);

export type HouseRule = z.infer<typeof houseRuleSchema>;
export type HouseRuleType = HouseRule['type'];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function dayNames(days: number[]): string {
  const names = [...days].sort().map((d) => DAY_NAMES[d]);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}

/** One plain-English line per rule, for chips, agents and receipts. */
export function describeRule(rule: HouseRule): string {
  switch (rule.type) {
    case 'fulfillment_window': {
      const how = rule.method === 'any' ? 'Pickup or delivery' : rule.method === 'pickup' ? 'Pickup' : 'Delivery';
      return `${how} only on ${dayNames(rule.days)}`;
    }
    case 'hold_above_amount':
      return `Orders over $${(rule.cents / 100).toFixed(2)} need the merchant's approval`;
    case 'excluded_category':
      return `"${rule.category}" items need the merchant's approval`;
    case 'auto_refund_below':
      return `Refunds up to $${(rule.cents / 100).toFixed(2)} are automatic`;
    case 'max_quantity_per_item':
      return `More than ${rule.quantity} of one item needs the merchant's approval`;
  }
}
