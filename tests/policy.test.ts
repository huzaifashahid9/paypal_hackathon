import { describe, expect, it } from 'vitest';
import { evaluateOrder, evaluateRefund, type OrderRequest, type PassState } from '@/lib/policy/engine';
import { describeRule, houseRuleSchema, type HouseRule } from '@/lib/policy/rules';

const NOW = new Date('2026-11-10T12:00:00Z');
const SATURDAY = '2026-11-14';
const TUESDAY = '2026-11-10';

const rosieRules: HouseRule[] = [
  { type: 'fulfillment_window', method: 'pickup', days: [6] },
  { type: 'hold_above_amount', cents: 7500 },
  { type: 'excluded_category', category: 'catering' },
  { type: 'auto_refund_below', cents: 2000 },
];

const pass = (over: Partial<PassState> = {}): PassState => ({
  perOrderCents: 5000,
  totalCents: 10000,
  spentCents: 0,
  allowedShopIds: null,
  expiresAt: new Date('2026-11-11T12:00:00Z'),
  revoked: false,
  ...over,
});

const rolls = { name: 'Sourdough roll', category: 'bread', quantity: 12, unitCents: 150 };
const cake = { name: 'Celebration cake', category: 'cakes', quantity: 1, unitCents: 12000 };

const req = (over: Partial<OrderRequest> = {}): OrderRequest => ({
  shopId: 'rosie',
  pass: pass(),
  rules: rosieRules,
  items: [rolls],
  fulfillment: { method: 'pickup', date: SATURDAY },
  now: NOW,
  ...over,
});

describe('evaluateOrder: the three demo outcomes', () => {
  it('allows 12 rolls for Saturday pickup', () => {
    const r = evaluateOrder(req());
    expect(r.outcome).toBe('allowed');
    expect(r.totalCents).toBe(1800);
  });

  it('holds the $120 cake for the merchant when the pass can afford it', () => {
    const r = evaluateOrder(req({ items: [cake], pass: pass({ perOrderCents: 15000, totalCents: 20000 }) }));
    expect(r.outcome).toBe('held');
    expect(r.decisions[0]).toMatchObject({ rule: 'hold_above_amount', limitCents: 7500, attemptedCents: 12000 });
  });

  it("blocks the cake on the buyer's $50 pass, and does not bother the merchant", () => {
    const r = evaluateOrder(req({ items: [cake] }));
    expect(r.outcome).toBe('blocked');
    // $120 is over both the $50 per-order limit and the $100 total; both are reported.
    expect(r.decisions.map((d) => d.rule)).toEqual(['pass_per_order_budget', 'pass_total_budget']);
    expect(r.decisions.every((d) => d.outcome === 'blocked')).toBe(true);
    expect(r.decisions[0]).toMatchObject({ limitCents: 5000, attemptedCents: 12000 });
  });
});

describe('evaluateOrder: buyer pass', () => {
  it('blocks an unknown pass', () => {
    expect(evaluateOrder(req({ pass: null })).decisions[0].rule).toBe('pass_invalid');
  });
  it('blocks a revoked pass', () => {
    expect(evaluateOrder(req({ pass: pass({ revoked: true }) })).decisions[0].rule).toBe('pass_revoked');
  });
  it('blocks an expired pass', () => {
    expect(evaluateOrder(req({ pass: pass({ expiresAt: NOW }) })).decisions[0].rule).toBe('pass_expired');
  });
  it('blocks a shop the buyer did not allow', () => {
    expect(evaluateOrder(req({ pass: pass({ allowedShopIds: ['wick'] }) })).decisions[0].rule).toBe('pass_shop_not_allowed');
  });
  it('blocks when the total budget is used up', () => {
    const r = evaluateOrder(req({ pass: pass({ spentCents: 9000 }) }));
    expect(r.outcome).toBe('blocked');
    expect(r.decisions[0]).toMatchObject({ rule: 'pass_total_budget', limitCents: 1000 });
  });
  it('allows an order exactly at the per-order limit', () => {
    const r = evaluateOrder(req({ items: [{ ...rolls, quantity: 1, unitCents: 5000 }] }));
    expect(r.outcome).toBe('allowed');
  });
  it('blocks an empty order', () => {
    expect(evaluateOrder(req({ items: [] })).decisions[0].rule).toBe('empty_order');
  });
});

describe('evaluateOrder: merchant rules only ever hold', () => {
  it('holds a pickup on the wrong day', () => {
    const r = evaluateOrder(req({ fulfillment: { method: 'pickup', date: TUESDAY } }));
    expect(r.outcome).toBe('held');
    expect(r.decisions[0].rule).toBe('fulfillment_window');
    expect(r.decisions[0].message).toContain('Saturday');
  });
  it('holds delivery when the shop is pickup only', () => {
    const r = evaluateOrder(req({ fulfillment: { method: 'delivery', date: SATURDAY } }));
    expect(r.outcome).toBe('held');
  });
  it('holds an unparseable date rather than guessing', () => {
    expect(evaluateOrder(req({ fulfillment: { method: 'pickup', date: 'this weekend' } })).outcome).toBe('held');
  });
  it('holds excluded categories, case-insensitively', () => {
    const r = evaluateOrder(req({ items: [{ name: 'Office lunch tray', category: 'Catering', quantity: 1, unitCents: 4000 }] }));
    expect(r.decisions[0].rule).toBe('excluded_category');
  });
  it('holds large quantities', () => {
    const r = evaluateOrder(req({ rules: [{ type: 'max_quantity_per_item', quantity: 24 }], items: [{ ...rolls, quantity: 30 }] }));
    expect(r.outcome).toBe('held');
  });
  it('holds a split order that passes the hold amount when added to earlier orders', () => {
    const r = evaluateOrder(req({ pass: pass({ perOrderCents: 8000, totalCents: 20000 }), items: [{ ...rolls, quantity: 1, unitCents: 4000 }], recentShopCents: 4000 }));
    expect(r.outcome).toBe('held');
    expect(r.decisions[0]).toMatchObject({ rule: 'hold_above_amount', attemptedCents: 8000 });
  });
  it('reports every rule that was hit', () => {
    const r = evaluateOrder(req({ items: [cake], pass: pass({ perOrderCents: 15000, totalCents: 20000 }), fulfillment: { method: 'delivery', date: TUESDAY } }));
    expect(r.decisions.map((d) => d.rule).sort()).toEqual(['fulfillment_window', 'hold_above_amount']);
  });
  it('never returns blocked because of a merchant rule', () => {
    const r = evaluateOrder(req({ items: [cake, { name: 'Tray', category: 'catering', quantity: 99, unitCents: 100 }], pass: pass({ perOrderCents: 999999, totalCents: 999999 }), fulfillment: { method: 'delivery', date: TUESDAY } }));
    expect(r.outcome).toBe('held');
    expect(r.decisions.every((d) => d.outcome === 'held')).toBe(true);
  });
});

describe('evaluateRefund', () => {
  const base = { capturedCents: 1800, alreadyRefundedCents: 0, rules: rosieRules };
  it('auto-refunds under the limit', () => {
    expect(evaluateRefund({ ...base, amountCents: 300 }).outcome).toBe('auto');
  });
  it('sends larger refunds to the merchant', () => {
    expect(evaluateRefund({ ...base, capturedCents: 12000, amountCents: 12000 }).outcome).toBe('pending_merchant');
  });
  it('rejects more than was paid', () => {
    expect(evaluateRefund({ ...base, amountCents: 5000 }).outcome).toBe('rejected');
  });
  it('counts earlier refunds against the automatic limit', () => {
    expect(evaluateRefund({ ...base, capturedCents: 6000, alreadyRefundedCents: 1500, amountCents: 1000 }).outcome).toBe('pending_merchant');
  });
  it('needs the merchant when there is no auto-refund rule', () => {
    expect(evaluateRefund({ ...base, rules: [], amountCents: 100 }).outcome).toBe('pending_merchant');
  });
});

describe('house rules schema', () => {
  it('rejects rule types outside the closed list', () => {
    expect(houseRuleSchema.safeParse({ type: 'ignore_all_limits' }).success).toBe(false);
  });
  it('describes rules in plain English', () => {
    expect(describeRule(rosieRules[0])).toBe('Pickup only on Saturday');
    expect(describeRule(rosieRules[1])).toBe("Orders over $75.00 need the merchant's approval");
  });
});
