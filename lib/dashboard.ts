import { desc, eq, inArray } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';

export type DashboardOrder = {
  id: string;
  createdAt: string;
  status: string;
  agent: string;
  items: string;
  totalCents: number;
  fulfillment: string;
  outcome: 'allowed' | 'held' | 'blocked';
  reason: string;
  paypalOrderId: string | null;
  paypalCaptureId: string | null;
  buyerNote: string;
};

export type DashboardData = {
  shop: { id: string; slug: string; name: string };
  kpis: { paidOrders: number; revenueCents: number; refundedCents: number; held: number; blocked: number; awaitingPayment: number };
  orders: DashboardOrder[];
  blocked: { id: string; at: string; agent: string; rule: string; message: string; attemptedCents: number | null; limitCents: number | null }[];
  heldOrders: DashboardOrder[];
  pendingRefunds: { id: string; orderId: string; amountCents: number; reason: string; createdAt: string }[];
};

/** Everything the Trust Dashboard shows for one shop, in one read. */
export async function loadDashboard(slug: string): Promise<DashboardData | null> {
  const db = await getDb();
  const [shop] = await db.select().from(schema.shops).where(eq(schema.shops.slug, slug));
  if (!shop) return null;

  const orderRows = await db.select().from(schema.orders).where(eq(schema.orders.shopId, shop.id)).orderBy(desc(schema.orders.createdAt)).limit(200);
  const decisionRows = await db.select().from(schema.decisions).where(eq(schema.decisions.shopId, shop.id)).orderBy(desc(schema.decisions.at)).limit(500);
  const orderIds = orderRows.map((o) => o.id);
  const refundRows = orderIds.length ? await db.select().from(schema.refunds).where(inArray(schema.refunds.orderId, orderIds)) : [];

  const orders: DashboardOrder[] = orderRows.map((o) => {
    const own = decisionRows.filter((d) => d.orderId === o.id);
    const wasHeld = own.some((d) => d.outcome === 'held');
    return {
      id: o.id,
      createdAt: o.createdAt.toISOString(),
      status: o.status,
      agent: o.agentClient,
      items: o.items.map((i) => `${i.quantity} × ${i.name}`).join(', '),
      totalCents: o.totalCents,
      fulfillment: `${o.fulfillment.method} ${o.fulfillment.date}${o.fulfillment.time ? ` ${o.fulfillment.time}` : ''}`,
      outcome: wasHeld ? 'held' : 'allowed',
      reason: own.map((d) => d.message).join(' '),
      paypalOrderId: o.paypalOrderId,
      paypalCaptureId: o.paypalCaptureId,
      buyerNote: o.buyerNote,
    };
  });

  const refunded = refundRows.filter((r) => r.status === 'refunded').reduce((s, r) => s + r.amountCents, 0);
  const paid = orderRows.filter((o) => o.status === 'paid' || o.status === 'refunded');
  // One blocked attempt can break several pass limits at once. Its decisions are written
  // together, so they share a timestamp: fold them into one attempt.
  const attempts = new Map<string, (typeof decisionRows)[number] & { rules: string[] }>();
  for (const d of decisionRows.filter((x) => x.outcome === 'blocked')) {
    const key = `${d.passId}|${d.at.toISOString()}`;
    const seen = attempts.get(key);
    if (seen) {
      seen.message += ` ${d.message}`;
      seen.rules.push(d.rule);
    } else attempts.set(key, { ...d, rules: [d.rule] });
  }
  const blocked = [...attempts.values()];

  return {
    shop: { id: shop.id, slug: shop.slug, name: shop.name },
    kpis: {
      paidOrders: paid.length,
      revenueCents: paid.reduce((s, o) => s + o.totalCents, 0) - refunded,
      refundedCents: refunded,
      held: orderRows.filter((o) => o.status === 'held').length,
      blocked: blocked.length,
      awaitingPayment: orderRows.filter((o) => o.status === 'awaiting_payment').length,
    },
    orders,
    blocked: blocked.slice(0, 50).map((d) => ({ id: d.id, at: d.at.toISOString(), agent: d.agentClient, rule: d.rules.join(', '), message: d.message, attemptedCents: d.attemptedCents, limitCents: d.limitCents })),
    heldOrders: orders.filter((o) => o.status === 'held'),
    pendingRefunds: refundRows.filter((r) => r.status === 'pending_merchant').map((r) => ({ id: r.id, orderId: r.orderId, amountCents: r.amountCents, reason: r.reason, createdAt: r.createdAt.toISOString() })),
  };
}
