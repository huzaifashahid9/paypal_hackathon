import { beforeAll, describe, expect, it, vi } from 'vitest';

// PayPal is faked here: these tests cover our own flow, not PayPal's API.
vi.mock('@/lib/paypal', () => ({
  paypalConfigured: () => true,
  createOrder: vi.fn(async (i: { orderId: string }) => ({ id: `PP-${i.orderId.slice(0, 8)}`, approveUrl: `https://www.sandbox.paypal.com/checkoutnow?token=PP-${i.orderId.slice(0, 8)}` })),
  captureOrder: vi.fn(async (id: string) => ({ captureId: `CAP-${id}`, status: 'COMPLETED', amountCents: 0 })),
  refundCapture: vi.fn(async () => ({ id: 'REF-1', status: 'COMPLETED' })),
  verifyWebhook: vi.fn(async () => false),
}));

process.env.PGLITE_DIR = 'memory';
delete process.env.DATABASE_URL;
delete process.env.OPENAI_API_KEY;

import { POST } from '@/app/s/[shop]/mcp/route';
import { getDb, schema } from '@/lib/db';
import { approveHeldOrder, captureOrder } from '@/lib/orders';
import { createPass } from '@/lib/passes';
import * as paypal from '@/lib/paypal';
import { verifyReceipt } from '@/lib/receipt';
import { seedDemoShops } from '@/lib/seed';

const SATURDAY = '2026-11-14';
let id = 0;

async function rpc(method: string, params: unknown, slug = 'rosies-bakery'): Promise<any> {
  const res = await POST(
    new Request(`http://localhost/s/${slug}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'user-agent': 'Claude-User' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
    }),
    { params: Promise.resolve({ shop: slug }) },
  );
  return res.json();
}

async function tool(name: string, args: unknown): Promise<any> {
  const res = await rpc('tools/call', { name, arguments: args });
  expect(res.error, JSON.stringify(res.error)).toBeUndefined();
  return res.result;
}

let productId: Record<string, string> = {};
let smallPass = '';
let bigPass = '';

beforeAll(async () => {
  const db = await getDb();
  await seedDemoShops(db);
  smallPass = (await createPass({ perOrderCents: 5000, totalCents: 10000, expiresInHours: 24 })).code;
  bigPass = (await createPass({ perOrderCents: 15000, totalCents: 20000, expiresInHours: 24 })).code;
  const found = await tool('search_products', { query: '' });
  for (const p of found.structuredContent.products) productId[p.name] = p.id;
});

describe('MCP endpoint', () => {
  it('lists the seven tools', async () => {
    const res = await rpc('tools/list', {});
    expect(res.result.tools.map((t: { name: string }) => t.name).sort()).toEqual(['ask_shop', 'check_policy', 'create_order', 'get_product', 'order_status', 'request_refund', 'search_products']);
  });

  it('returns 404 for an unknown shop', async () => {
    const res = await POST(new Request('http://localhost/s/nope/mcp', { method: 'POST', body: '{}' }), { params: Promise.resolve({ shop: 'nope' }) });
    expect(res.status).toBe(404);
  });

  it('finds sourdough rolls', async () => {
    const r = await tool('search_products', { query: 'sourdough rolls' });
    expect(r.structuredContent.products[0].name).toBe('Sourdough roll');
  });

  it('answers ask_shop from published facts when AI is off', async () => {
    const r = await tool('ask_shop', { question: 'Can I pick up on Saturday?' });
    expect(r.structuredContent.answered_by).toBe('facts');
    expect(r.structuredContent.answer).toContain('Saturdays 9am to 1pm');
  });

  it('check_policy is a dry run', async () => {
    const r = await tool('check_policy', { items: [{ product_id: productId['Sourdough roll'], quantity: 12 }], pass_code: smallPass, fulfillment: { method: 'pickup', date: SATURDAY } });
    expect(r.structuredContent).toMatchObject({ decision: 'allowed', total_cents: 1800 });
    const db = await getDb();
    expect(await db.select().from(schema.orders)).toHaveLength(0);
  });

  it('rejects unknown products without charging', async () => {
    const r = await tool('create_order', { items: [{ product_id: 'made-up', quantity: 1 }], pass_code: smallPass, fulfillment: { method: 'pickup', date: SATURDAY } });
    expect(r.isError).toBe(true);
    expect(paypal.createOrder).not.toHaveBeenCalled();
  });
});

describe('the three outcomes, end to end', () => {
  let paidOrderId = '';

  it('ALLOWED: 12 rolls → PayPal order → capture → signed receipt → auto refund', async () => {
    const r = await tool('create_order', { items: [{ product_id: productId['Sourdough roll'], quantity: 12 }], pass_code: smallPass, fulfillment: { method: 'pickup', date: SATURDAY } });
    expect(r.structuredContent.status).toBe('awaiting_payment');
    expect(r.structuredContent.approve_url).toContain('sandbox.paypal.com');
    paidOrderId = r.structuredContent.order_id;
    // Price came from the catalog: 12 × $1.50.
    expect(vi.mocked(paypal.createOrder).mock.calls.at(-1)![0].totalCents).toBe(1800);

    const paid = await captureOrder(paidOrderId);
    expect(paid.status).toBe('paid');
    expect(verifyReceipt({ orderId: paid.id, totalCents: 1800, paypalOrderId: paid.paypalOrderId!, paypalCaptureId: paid.paypalCaptureId! }, paid.receiptSig!)).toBe(true);
    expect(verifyReceipt({ orderId: paid.id, totalCents: 1, paypalOrderId: paid.paypalOrderId!, paypalCaptureId: paid.paypalCaptureId! }, paid.receiptSig!)).toBe(false);

    // Capturing twice (return page and webhook racing) charges once.
    await captureOrder(paidOrderId);
    expect(paypal.captureOrder).toHaveBeenCalledTimes(1);

    const status = await tool('order_status', { order_id: paidOrderId });
    expect(status.structuredContent.status).toBe('paid');
    expect(status.structuredContent.receipt_url).toContain(`/r/${paidOrderId}`);

    const refund = await tool('request_refund', { order_id: paidOrderId, amount: 3, reason: '2 rolls were missing' });
    expect(refund.structuredContent.status).toBe('refunded');
    expect(vi.mocked(paypal.refundCapture).mock.calls.at(-1)![0].amountCents).toBe(300);
  });

  it('HELD: the $120 cake waits for Rosie, and PayPal is not touched until she approves', async () => {
    const before = vi.mocked(paypal.createOrder).mock.calls.length;
    const r = await tool('create_order', { items: [{ product_id: productId['Celebration cake'], quantity: 1 }], pass_code: bigPass, fulfillment: { method: 'pickup', date: SATURDAY } });
    expect(r.structuredContent.status).toBe('held');
    expect(r.structuredContent.reasons[0].rule).toBe('hold_above_amount');
    expect(vi.mocked(paypal.createOrder).mock.calls.length).toBe(before);

    const approved = await approveHeldOrder(r.structuredContent.order_id);
    expect(approved.status).toBe('awaiting_payment');
    const status = await tool('order_status', { order_id: approved.id });
    expect(status.structuredContent.approve_url).toContain('sandbox.paypal.com');
  });

  it("BLOCKED: the cake on the buyer's $50 pass creates no order", async () => {
    const db = await getDb();
    const ordersBefore = (await db.select().from(schema.orders)).length;
    const r = await tool('create_order', { items: [{ product_id: productId['Celebration cake'], quantity: 1 }], pass_code: smallPass, fulfillment: { method: 'pickup', date: SATURDAY } });
    expect(r.structuredContent.status).toBe('blocked');
    expect(r.structuredContent.reasons[0]).toMatchObject({ rule: 'pass_per_order_budget', limit_cents: 5000, attempted_cents: 12000 });
    expect((await db.select().from(schema.orders)).length).toBe(ordersBefore);
    const blocked = (await db.select().from(schema.decisions)).filter((d) => d.outcome === 'blocked');
    expect(blocked.length).toBeGreaterThan(0);
  });

  it('blocks a made-up pass code', async () => {
    const r = await tool('create_order', { items: [{ product_id: productId['Sourdough roll'], quantity: 1 }], pass_code: 'PASS-FAKE-FAKE', fulfillment: { method: 'pickup', date: SATURDAY } });
    expect(r.structuredContent.reasons[0].rule).toBe('pass_invalid');
  });

  it('adds refunds up: automatic while inside the limit, never more than was paid', async () => {
    // $3 already refunded. $15 more makes $18, still inside Rosie's $20 automatic limit.
    const r = await tool('request_refund', { order_id: paidOrderId, amount: 15, reason: 'changed my mind' });
    expect(r.structuredContent.status).toBe('refunded');
    // The order was $18 and is now fully refunded, so anything more is rejected.
    const over = await tool('request_refund', { order_id: paidOrderId, amount: 5, reason: 'more' });
    expect(over.structuredContent.status).toBe('rejected');
  });

  it('logs a replayable trail of events', async () => {
    const db = await getDb();
    const types = new Set((await db.select().from(schema.events)).map((e) => e.type));
    for (const t of ['tool.search_products', 'tool.create_order', 'policy.decision', 'paypal.order_created', 'paypal.captured', 'paypal.refunded', 'merchant.approved']) expect(types).toContain(t);
  });
});
