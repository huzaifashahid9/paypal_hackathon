import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import type { Fulfillment, OrderItem } from '@/lib/db/schema';
import { logEvent } from '@/lib/events';
import { hashPassCode, newId } from '@/lib/id';
import * as paypal from '@/lib/paypal';
import { evaluateOrder, evaluateRefund, type Decision, type Evaluation } from '@/lib/policy/engine';
import { signReceipt } from '@/lib/receipt';
import { getHouseRules, listProducts, type Shop } from '@/lib/shops';

export type Order = typeof schema.orders.$inferSelect;
export type Pass = typeof schema.buyerPasses.$inferSelect;
export type Caller = { agentClient: string; sessionId: string };
export type RequestedItem = { productId: string; quantity: number };

export class OrderInputError extends Error {}

const appUrl = (): string => (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

export async function findPass(code: string | undefined): Promise<Pass | null> {
  if (!code?.trim()) return null;
  const db = await getDb();
  const [pass] = await db.select().from(schema.buyerPasses).where(eq(schema.buyerPasses.codeHash, hashPassCode(code)));
  return pass ?? null;
}

/** Prices and categories always come from our catalog, never from what the agent sent. */
async function resolveItems(shopId: string, requested: RequestedItem[]): Promise<OrderItem[]> {
  const products = await listProducts(shopId);
  const merged = new Map<string, number>();
  for (const r of requested) merged.set(r.productId, (merged.get(r.productId) ?? 0) + r.quantity);
  return [...merged].map(([productId, quantity]) => {
    const p = products.find((x) => x.id === productId);
    if (!p) throw new OrderInputError(`Unknown product_id "${productId}". Use search_products to find valid ids.`);
    if (!p.inStock) throw new OrderInputError(`"${p.name}" is out of stock.`);
    if (!Number.isInteger(quantity) || quantity < 1) throw new OrderInputError(`Quantity for "${p.name}" must be a whole number of at least 1.`);
    return { productId: p.id, name: p.name, category: p.category, quantity, unitCents: p.priceCents };
  });
}

async function sumOrders(where: ReturnType<typeof and>): Promise<number> {
  const db = await getDb();
  const [row] = await db.select({ total: sql<number>`coalesce(sum(${schema.orders.totalCents}), 0)::int` }).from(schema.orders).where(where);
  return Number(row?.total ?? 0);
}

async function evaluate(shop: Shop, pass: Pass | null, items: OrderItem[], fulfillment: Fulfillment): Promise<Evaluation> {
  const rules = await getHouseRules(shop.id);
  const now = new Date();
  let spentCents = 0;
  let recentShopCents = 0;
  if (pass) {
    // Held and unpaid orders count too, so a pass cannot be over-committed while approvals are pending.
    spentCents = await sumOrders(and(eq(schema.orders.passId, pass.id), inArray(schema.orders.status, ['held', 'awaiting_payment', 'paid'])));
    recentShopCents = await sumOrders(
      and(
        eq(schema.orders.passId, pass.id),
        eq(schema.orders.shopId, shop.id),
        inArray(schema.orders.status, ['awaiting_payment', 'paid']),
        gte(schema.orders.createdAt, new Date(now.getTime() - 24 * 60 * 60 * 1000)),
      ),
    );
  }
  return evaluateOrder({
    shopId: shop.id,
    pass: pass && { perOrderCents: pass.perOrderCents, totalCents: pass.totalCents, spentCents, allowedShopIds: pass.allowedShopIds ?? null, expiresAt: pass.expiresAt, revoked: pass.revoked },
    rules,
    items,
    fulfillment,
    now,
    recentShopCents,
  });
}

export type OrderRequestInput = { shop: Shop; passCode?: string; items: RequestedItem[]; fulfillment: Fulfillment; buyerNote?: string };

/** Dry run: what would happen, with nothing written except the event log. */
export async function checkPolicy(input: OrderRequestInput, caller: Caller): Promise<Evaluation & { items: OrderItem[] }> {
  const items = await resolveItems(input.shop.id, input.items);
  const result = await evaluate(input.shop, await findPass(input.passCode), items, input.fulfillment);
  await logEvent({ type: 'tool.check_policy', shopId: input.shop.id, sessionId: caller.sessionId, payload: { outcome: result.outcome, totalCents: result.totalCents, decisions: result.decisions } });
  return { ...result, items };
}

async function recordDecisions(shop: Shop, pass: Pass | null, orderId: string | null, decisions: Decision[], caller: Caller): Promise<void> {
  const db = await getDb();
  await db.insert(schema.decisions).values(
    decisions.map((d) => ({ id: newId(), shopId: shop.id, passId: pass?.id ?? null, orderId, outcome: d.outcome, rule: d.rule, limitCents: d.limitCents ?? null, attemptedCents: d.attemptedCents ?? null, message: d.message, agentClient: caller.agentClient })),
  );
  await logEvent({ type: 'policy.decision', shopId: shop.id, sessionId: caller.sessionId, payload: { orderId, decisions } });
}

async function openPayPalOrder(order: Order, shop: Shop): Promise<Order> {
  const db = await getDb();
  const created = await paypal.createOrder({
    orderId: order.id,
    shopName: shop.name,
    items: order.items,
    totalCents: order.totalCents,
    returnUrl: `${appUrl()}/paypal/return?order=${order.id}`,
    cancelUrl: `${appUrl()}/paypal/return?order=${order.id}&cancelled=1`,
  });
  const [updated] = await db
    .update(schema.orders)
    .set({ status: 'awaiting_payment', paypalOrderId: created.id, approveUrl: created.approveUrl, updatedAt: new Date() })
    .where(eq(schema.orders.id, order.id))
    .returning();
  await logEvent({ type: 'paypal.order_created', shopId: shop.id, sessionId: order.sessionId, payload: { orderId: order.id, paypalOrderId: created.id, totalCents: order.totalCents } });
  return updated;
}

export type CreateOrderResult =
  | { status: 'blocked'; totalCents: number; decisions: Decision[] }
  | { status: 'held'; order: Order; decisions: Decision[] }
  | { status: 'awaiting_payment'; order: Order; decisions: Decision[] };

export async function createOrder(input: OrderRequestInput, caller: Caller): Promise<CreateOrderResult> {
  const db = await getDb();
  const items = await resolveItems(input.shop.id, input.items);
  const pass = await findPass(input.passCode);
  const result = await evaluate(input.shop, pass, items, input.fulfillment);

  if (result.outcome === 'blocked' || !pass) {
    await recordDecisions(input.shop, pass, null, result.decisions, caller);
    return { status: 'blocked', totalCents: result.totalCents, decisions: result.decisions };
  }

  const held = result.outcome === 'held';
  const [order] = await db
    .insert(schema.orders)
    .values({
      id: newId(),
      shopId: input.shop.id,
      passId: pass.id,
      status: 'held',
      items,
      totalCents: result.totalCents,
      fulfillment: input.fulfillment,
      buyerNote: (input.buyerNote ?? '').slice(0, 500),
      holdReason: held ? result.decisions.map((d) => d.message).join(' ') : null,
      agentClient: caller.agentClient,
      sessionId: caller.sessionId,
    })
    .returning();
  await recordDecisions(input.shop, pass, order.id, result.decisions, caller);
  if (held) return { status: 'held', order, decisions: result.decisions };

  try {
    return { status: 'awaiting_payment', order: await openPayPalOrder(order, input.shop), decisions: result.decisions };
  } catch (err) {
    // Do not leave a phantom order holding the buyer's budget if PayPal refused it.
    await db.update(schema.orders).set({ status: 'declined', holdReason: 'PayPal order could not be created', updatedAt: new Date() }).where(eq(schema.orders.id, order.id));
    throw err;
  }
}

export async function getOrder(orderId: string): Promise<Order | null> {
  const db = await getDb();
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  return order ?? null;
}

/** The merchant approves a held order: only now is a PayPal order created. */
export async function approveHeldOrder(orderId: string): Promise<Order> {
  const db = await getDb();
  const order = await getOrder(orderId);
  if (!order) throw new OrderInputError('Order not found.');
  if (order.status !== 'held') return order;
  const [shop] = await db.select().from(schema.shops).where(eq(schema.shops.id, order.shopId));
  const updated = await openPayPalOrder(order, shop);
  await logEvent({ type: 'merchant.approved', shopId: shop.id, sessionId: order.sessionId, payload: { orderId } });
  return updated;
}

export async function declineHeldOrder(orderId: string): Promise<Order> {
  const db = await getDb();
  const order = await getOrder(orderId);
  if (!order) throw new OrderInputError('Order not found.');
  if (order.status !== 'held') return order;
  const [updated] = await db.update(schema.orders).set({ status: 'declined', updatedAt: new Date() }).where(eq(schema.orders.id, orderId)).returning();
  await logEvent({ type: 'merchant.declined', shopId: order.shopId, sessionId: order.sessionId, payload: { orderId } });
  return updated;
}

/** Capture after the buyer approved in PayPal. Safe to call twice (return URL and webhook race). */
export async function captureOrder(orderId: string): Promise<Order> {
  const db = await getDb();
  const order = await getOrder(orderId);
  if (!order) throw new OrderInputError('Order not found.');
  if (order.status !== 'awaiting_payment' || !order.paypalOrderId) return order;
  const capture = await paypal.captureOrder(order.paypalOrderId);
  if (capture.status !== 'COMPLETED') return order;
  const receiptSig = signReceipt({ orderId: order.id, totalCents: order.totalCents, paypalOrderId: order.paypalOrderId, paypalCaptureId: capture.captureId });
  const [updated] = await db
    .update(schema.orders)
    .set({ status: 'paid', paypalCaptureId: capture.captureId, receiptSig, updatedAt: new Date() })
    .where(and(eq(schema.orders.id, orderId), eq(schema.orders.status, 'awaiting_payment')))
    .returning();
  await logEvent({ type: 'paypal.captured', shopId: order.shopId, sessionId: order.sessionId, payload: { orderId, paypalOrderId: order.paypalOrderId, captureId: capture.captureId, totalCents: order.totalCents } });
  return updated ?? (await getOrder(orderId))!;
}

export type Refund = typeof schema.refunds.$inferSelect;

async function refundedCents(orderId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${schema.refunds.amountCents}), 0)::int` })
    .from(schema.refunds)
    .where(and(eq(schema.refunds.orderId, orderId), inArray(schema.refunds.status, ['refunded', 'pending_merchant'])));
  return Number(row?.total ?? 0);
}

async function issueRefund(order: Order, refund: Refund): Promise<Refund> {
  const db = await getDb();
  const result = await paypal.refundCapture({ captureId: order.paypalCaptureId!, refundId: refund.id, amountCents: refund.amountCents, note: refund.reason });
  const [updated] = await db.update(schema.refunds).set({ status: 'refunded', paypalRefundId: result.id }).where(eq(schema.refunds.id, refund.id)).returning();
  if ((await refundedCents(order.id)) >= order.totalCents) {
    await db.update(schema.orders).set({ status: 'refunded', updatedAt: new Date() }).where(eq(schema.orders.id, order.id));
  }
  await logEvent({ type: 'paypal.refunded', shopId: order.shopId, sessionId: order.sessionId, payload: { orderId: order.id, refundId: refund.id, paypalRefundId: result.id, amountCents: refund.amountCents } });
  return updated;
}

export type RefundResult = { status: 'refunded' | 'pending_merchant' | 'rejected'; message: string; refund?: Refund };

export async function requestRefund(input: { orderId: string; amountCents?: number; reason: string }): Promise<RefundResult> {
  const db = await getDb();
  const order = await getOrder(input.orderId);
  if (!order) throw new OrderInputError('Order not found.');
  if (!order.paypalCaptureId || (order.status !== 'paid' && order.status !== 'refunded')) {
    return { status: 'rejected', message: 'Only paid orders can be refunded.' };
  }
  const amountCents = input.amountCents ?? order.totalCents;
  const verdict = evaluateRefund({ amountCents, capturedCents: order.totalCents, alreadyRefundedCents: await refundedCents(order.id), rules: await getHouseRules(order.shopId) });
  if (verdict.outcome === 'rejected') return { status: 'rejected', message: verdict.message };

  const [refund] = await db
    .insert(schema.refunds)
    .values({ id: newId(), orderId: order.id, amountCents, reason: input.reason.slice(0, 500), status: 'pending_merchant' })
    .returning();
  if (verdict.outcome === 'pending_merchant') return { status: 'pending_merchant', message: verdict.message, refund };
  try {
    return { status: 'refunded', message: verdict.message, refund: await issueRefund(order, refund) };
  } catch (err) {
    await db.update(schema.refunds).set({ status: 'declined' }).where(eq(schema.refunds.id, refund.id));
    throw err;
  }
}

export async function approveRefund(refundId: string): Promise<Refund> {
  const db = await getDb();
  const [refund] = await db.select().from(schema.refunds).where(eq(schema.refunds.id, refundId));
  if (!refund) throw new OrderInputError('Refund not found.');
  if (refund.status !== 'pending_merchant') return refund;
  const order = await getOrder(refund.orderId);
  await logEvent({ type: 'merchant.approved', shopId: order!.shopId, sessionId: order!.sessionId, payload: { refundId } });
  return issueRefund(order!, refund);
}

export async function declineRefund(refundId: string): Promise<Refund> {
  const db = await getDb();
  const [updated] = await db.update(schema.refunds).set({ status: 'declined' }).where(and(eq(schema.refunds.id, refundId), eq(schema.refunds.status, 'pending_merchant'))).returning();
  if (!updated) throw new OrderInputError('Refund not found or already decided.');
  return updated;
}
