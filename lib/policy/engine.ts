import { formatCents } from '@/lib/money';
import { dayNames, type HouseRule } from './rules';

/**
 * The policy engine. Pure code, no AI, no I/O: the same inputs always give the same answer.
 *
 * Two sides, two different powers:
 *  - The BUYER's pass can BLOCK an order (it is their money and their limits).
 *  - The MERCHANT's house rules can only HOLD an order for the merchant's approval,
 *    because a merchant never wants software to turn a sale away on their behalf.
 */

export type Outcome = 'allowed' | 'held' | 'blocked';

export type Decision = {
  outcome: Outcome;
  /** Machine-readable id of the check, e.g. pass_per_order_budget or hold_above_amount. */
  rule: string;
  message: string;
  limitCents?: number;
  attemptedCents?: number;
};

export type PassState = {
  perOrderCents: number;
  totalCents: number;
  /** Already committed on this pass: paid orders plus orders awaiting payment or approval. */
  spentCents: number;
  allowedShopIds: string[] | null;
  expiresAt: Date;
  revoked: boolean;
};

export type LineItem = { name: string; category: string; quantity: number; unitCents: number };

export type OrderRequest = {
  shopId: string;
  /** null when the code the agent sent matches no pass. */
  pass: PassState | null;
  rules: HouseRule[];
  items: LineItem[];
  fulfillment: { method: 'pickup' | 'delivery'; date: string };
  now: Date;
  /** What this pass already ordered from this shop in the last 24h (stops order-splitting). */
  recentShopCents?: number;
};

export type Evaluation = { outcome: Outcome; totalCents: number; decisions: Decision[] };

export function orderTotal(items: LineItem[]): number {
  return items.reduce((sum, i) => sum + i.unitCents * i.quantity, 0);
}

function weekday(isoDate: string): number | null {
  const t = Date.parse(`${isoDate}T00:00:00Z`);
  return Number.isNaN(t) ? null : new Date(t).getUTCDay();
}

function buyerChecks(req: OrderRequest, total: number): Decision[] {
  const { pass } = req;
  if (!pass) {
    return [{ outcome: 'blocked', rule: 'pass_invalid', message: 'That pass code is not valid. Ask the buyer for a current Buyer Pass.' }];
  }
  if (pass.revoked) {
    return [{ outcome: 'blocked', rule: 'pass_revoked', message: 'The buyer revoked this pass.' }];
  }
  if (pass.expiresAt.getTime() <= req.now.getTime()) {
    return [{ outcome: 'blocked', rule: 'pass_expired', message: 'This pass has expired. Ask the buyer for a new one.' }];
  }
  const out: Decision[] = [];
  if (pass.allowedShopIds && !pass.allowedShopIds.includes(req.shopId)) {
    out.push({ outcome: 'blocked', rule: 'pass_shop_not_allowed', message: 'The buyer did not allow this pass to shop here.' });
  }
  if (total > pass.perOrderCents) {
    out.push({
      outcome: 'blocked',
      rule: 'pass_per_order_budget',
      limitCents: pass.perOrderCents,
      attemptedCents: total,
      message: `This order is ${formatCents(total)}, over the buyer's ${formatCents(pass.perOrderCents)} per-order limit.`,
    });
  }
  const remaining = pass.totalCents - pass.spentCents;
  if (total > remaining) {
    out.push({
      outcome: 'blocked',
      rule: 'pass_total_budget',
      limitCents: Math.max(remaining, 0),
      attemptedCents: total,
      message: `This order is ${formatCents(total)}, but only ${formatCents(Math.max(remaining, 0))} is left on the buyer's pass.`,
    });
  }
  return out;
}

function merchantChecks(req: OrderRequest, total: number): Decision[] {
  const out: Decision[] = [];
  const recent = req.recentShopCents ?? 0;
  for (const rule of req.rules) {
    switch (rule.type) {
      case 'hold_above_amount': {
        if (total > rule.cents) {
          out.push({
            outcome: 'held',
            rule: rule.type,
            limitCents: rule.cents,
            attemptedCents: total,
            message: `Orders over ${formatCents(rule.cents)} need the merchant's approval.`,
          });
        } else if (recent > 0 && total + recent > rule.cents) {
          out.push({
            outcome: 'held',
            rule: rule.type,
            limitCents: rule.cents,
            attemptedCents: total + recent,
            message: `With this pass's other orders today the total is ${formatCents(total + recent)}, over the ${formatCents(rule.cents)} the merchant approves automatically.`,
          });
        }
        break;
      }
      case 'excluded_category': {
        const wanted = rule.category.trim().toLowerCase();
        const hit = req.items.find((i) => i.category.trim().toLowerCase() === wanted);
        if (hit) {
          out.push({ outcome: 'held', rule: rule.type, message: `"${hit.name}" is a ${rule.category} item, which the merchant reviews personally.` });
        }
        break;
      }
      case 'max_quantity_per_item': {
        const hit = req.items.find((i) => i.quantity > rule.quantity);
        if (hit) {
          out.push({ outcome: 'held', rule: rule.type, message: `${hit.quantity} × "${hit.name}" is more than ${rule.quantity}, so the merchant needs to confirm it.` });
        }
        break;
      }
      case 'fulfillment_window': {
        const day = weekday(req.fulfillment.date);
        const methodOk = rule.method === 'any' || rule.method === req.fulfillment.method;
        const dayOk = day !== null && rule.days.includes(day);
        if (!methodOk || !dayOk) {
          const how = rule.method === 'any' ? req.fulfillment.method : rule.method;
          out.push({
            outcome: 'held',
            rule: rule.type,
            message: `The shop offers ${how} on ${dayNames(rule.days)}. Change the request to proceed right away, or the merchant can review this as an exception.`,
          });
        }
        break;
      }
      case 'auto_refund_below':
        break; // refunds only
    }
  }
  return out;
}

export function evaluateOrder(req: OrderRequest): Evaluation {
  const totalCents = orderTotal(req.items);
  if (req.items.length === 0 || totalCents <= 0) {
    return { outcome: 'blocked', totalCents, decisions: [{ outcome: 'blocked', rule: 'empty_order', message: 'The order has no items.' }] };
  }
  const blocks = buyerChecks(req, totalCents);
  // A blocked order never reaches the merchant's queue, so their rules are not reported.
  if (blocks.length > 0) return { outcome: 'blocked', totalCents, decisions: blocks };

  const holds = merchantChecks(req, totalCents);
  if (holds.length > 0) return { outcome: 'held', totalCents, decisions: holds };

  return {
    outcome: 'allowed',
    totalCents,
    decisions: [{ outcome: 'allowed', rule: 'all_checks_passed', attemptedCents: totalCents, message: "Within the buyer's pass and the shop's house rules." }],
  };
}

export type RefundRequest = {
  amountCents: number;
  capturedCents: number;
  alreadyRefundedCents: number;
  rules: HouseRule[];
};

export type RefundEvaluation = { outcome: 'auto' | 'pending_merchant' | 'rejected'; message: string; limitCents?: number };

export function evaluateRefund(req: RefundRequest): RefundEvaluation {
  const refundable = req.capturedCents - req.alreadyRefundedCents;
  if (req.amountCents <= 0) return { outcome: 'rejected', message: 'The refund amount must be more than zero.' };
  if (req.amountCents > refundable) {
    return { outcome: 'rejected', limitCents: Math.max(refundable, 0), message: `Only ${formatCents(Math.max(refundable, 0))} of this order can still be refunded.` };
  }
  const auto = req.rules.find((r) => r.type === 'auto_refund_below');
  // Count earlier refunds too, so many small requests cannot add up past the limit.
  if (auto && auto.type === 'auto_refund_below' && req.amountCents + req.alreadyRefundedCents <= auto.cents) {
    return { outcome: 'auto', limitCents: auto.cents, message: `Within the shop's ${formatCents(auto.cents)} automatic refund limit.` };
  }
  return {
    outcome: 'pending_merchant',
    limitCents: auto && auto.type === 'auto_refund_below' ? auto.cents : undefined,
    message: 'This refund needs the merchant to approve it.',
  };
}
