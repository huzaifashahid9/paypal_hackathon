import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { askShop } from '@/lib/assistant';
import { logEvent } from '@/lib/events';
import { formatCents } from '@/lib/money';
import { checkPolicy, createOrder, getOrder, OrderInputError, requestRefund, type Caller } from '@/lib/orders';
import { describeRule } from '@/lib/policy/rules';
import { getHouseRules, listProducts, searchProducts, type Product, type Shop } from '@/lib/shops';

const appUrl = (): string => (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

type ToolResult = { content: { type: 'text'; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };

const ok = (summary: string, data: Record<string, unknown>): ToolResult => ({
  content: [{ type: 'text', text: `${summary}\n\n${JSON.stringify(data, null, 2)}` }],
  structuredContent: data,
});

const fail = (message: string): ToolResult => ({ content: [{ type: 'text', text: message }], isError: true });

const productView = (p: Product) => ({ id: p.id, name: p.name, category: p.category, price: formatCents(p.priceCents), price_cents: p.priceCents, in_stock: p.inStock, description: p.description, image_url: p.imageUrl });

const itemsShape = z
  .array(z.object({ product_id: z.string().describe('A product id from search_products'), quantity: z.number().int().min(1) }))
  .min(1)
  .describe('What to buy');

const fulfillmentShape = z.object({
  method: z.enum(['pickup', 'delivery']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('The pickup or delivery date as YYYY-MM-DD'),
  time: z.string().optional().describe('Optional time or window, e.g. "10:30"'),
});

const passShape = z.string().describe("The buyer's Buyer Pass code, e.g. PASS-7K2Q-9MXD. Ask the buyer if you do not have one.");

/** Build the MCP server for one shop. Stateless: a fresh server per request. */
export async function buildShopServer(shop: Shop, caller: Caller): Promise<McpServer> {
  const rules = await getHouseRules(shop.id);
  const today = new Date().toISOString().slice(0, 10);

  const server = new McpServer(
    { name: `openshelf-${shop.slug}`, version: '0.1.0' },
    {
      instructions: [
        `This is the agent storefront for ${shop.name} (${shop.tagline}), powered by OpenShelf. Payments go through PayPal.`,
        `Today is ${today}.`,
        `House rules:\n${rules.map((r) => `- ${describeRule(r)}`).join('\n') || '- none'}`,
        'To buy: search_products, optionally ask_shop, then create_order with the buyer\'s Buyer Pass code. The buyer always approves the payment themselves in PayPal.',
        'Outcomes: "awaiting_payment" (give the buyer the approve_url), "held" (the merchant must approve first; tell the buyer and check order_status later), "blocked" (the buyer\'s own pass limits; explain the reason, do not retry with a different split of the same order).',
      ].join('\n\n'),
    },
  );

  const log = (type: Parameters<typeof logEvent>[0]['type'], payload: Record<string, unknown>) => logEvent({ type, shopId: shop.id, sessionId: caller.sessionId, payload: { agentClient: caller.agentClient, ...payload } });

  const guarded = async (run: () => Promise<ToolResult>): Promise<ToolResult> => {
    try {
      return await run();
    } catch (err) {
      if (err instanceof OrderInputError) return fail(err.message);
      console.error('MCP tool failed', err);
      return fail('Something went wrong on the shop side. Nothing was charged. Please try again in a moment.');
    }
  };

  server.registerTool(
    'search_products',
    {
      title: 'Search products',
      description: `Search ${shop.name}'s catalog. Returns product ids and prices. Call with an empty query to list everything.`,
      inputSchema: { query: z.string().default(''), category: z.string().optional(), max_price: z.number().positive().optional().describe('Maximum price in dollars') },
    },
    ({ query, category, max_price }) =>
      guarded(async () => {
        const found = searchProducts(await listProducts(shop.id), query, { category, maxPriceCents: max_price === undefined ? undefined : Math.round(max_price * 100) }).slice(0, 20);
        await log('tool.search_products', { query, results: found.length });
        return ok(`${found.length} product(s) at ${shop.name}.`, { products: found.map(productView) });
      }),
  );

  server.registerTool(
    'get_product',
    { title: 'Get product', description: 'Full details for one product, plus the house rules that apply when ordering.', inputSchema: { product_id: z.string() } },
    ({ product_id }) =>
      guarded(async () => {
        const product = (await listProducts(shop.id)).find((p) => p.id === product_id);
        await log('tool.get_product', { productId: product_id, found: Boolean(product) });
        if (!product) return fail(`Unknown product_id "${product_id}". Use search_products to find valid ids.`);
        return ok(product.name, { product: productView(product), house_rules: rules.map(describeRule) });
      }),
  );

  server.registerTool(
    'ask_shop',
    {
      title: 'Ask the shop',
      description: `Ask ${shop.name} a question (ingredients, allergens, pickup times, shipping). Answers come only from what the shop has published; if it does not know, it says so. It cannot place orders or change limits.`,
      inputSchema: { question: z.string().min(1).max(1000) },
    },
    ({ question }) =>
      guarded(async () => {
        const reply = await askShop(shop, await listProducts(shop.id), rules, question);
        await log('tool.ask_shop', { question, answer: reply.answer, answeredBy: reply.answeredBy });
        return ok(reply.answer, { answer: reply.answer, answered_by: reply.answeredBy });
      }),
  );

  server.registerTool(
    'check_policy',
    {
      title: 'Check an order before placing it',
      description: 'Dry run. Says whether an order would be allowed, held for the merchant, or blocked by the buyer\'s pass, and why. Creates nothing and charges nothing.',
      inputSchema: { items: itemsShape, pass_code: passShape, fulfillment: fulfillmentShape },
    },
    ({ items, pass_code, fulfillment }) =>
      guarded(async () => {
        const r = await checkPolicy({ shop, passCode: pass_code, items: items.map((i) => ({ productId: i.product_id, quantity: i.quantity })), fulfillment }, caller);
        return ok(`This order would be ${r.outcome}. Total ${formatCents(r.totalCents)}.`, { decision: r.outcome, total: formatCents(r.totalCents), total_cents: r.totalCents, reasons: r.decisions.map((d) => ({ rule: d.rule, message: d.message, limit_cents: d.limitCents, attempted_cents: d.attemptedCents })) });
      }),
  );

  server.registerTool(
    'create_order',
    {
      title: 'Create an order',
      description:
        'Place an order. Prices come from the shop catalog. Result status is one of: "awaiting_payment" (show the buyer approve_url so they can pay with PayPal, then call order_status), "held" (the merchant must approve; tell the buyer, then call order_status later; never retry with smaller items to get around a hold), "blocked" (the buyer\'s pass does not allow it; explain why and stop).',
      inputSchema: { items: itemsShape, pass_code: passShape, fulfillment: fulfillmentShape, buyer_note: z.string().max(500).optional().describe('A short note for the merchant') },
    },
    ({ items, pass_code, fulfillment, buyer_note }) =>
      guarded(async () => {
        const r = await createOrder({ shop, passCode: pass_code, items: items.map((i) => ({ productId: i.product_id, quantity: i.quantity })), fulfillment, buyerNote: buyer_note }, caller);
        const reasons = r.decisions.map((d) => ({ rule: d.rule, message: d.message, limit_cents: d.limitCents, attempted_cents: d.attemptedCents }));
        if (r.status === 'blocked') {
          await log('tool.create_order', { status: 'blocked', totalCents: r.totalCents, reasons });
          return ok(`Blocked by the buyer's pass. ${r.decisions.map((d) => d.message).join(' ')}`, { status: 'blocked', total: formatCents(r.totalCents), reasons });
        }
        await log('tool.create_order', { status: r.status, orderId: r.order.id, totalCents: r.order.totalCents, reasons });
        if (r.status === 'held') {
          return ok(`Held for ${shop.name} to approve. ${r.decisions.map((d) => d.message).join(' ')} Tell the buyer, and check order_status later.`, { status: 'held', order_id: r.order.id, total: formatCents(r.order.totalCents), reasons });
        }
        return ok(`Order created for ${formatCents(r.order.totalCents)}. Ask the buyer to approve the payment in PayPal: ${r.order.approveUrl}`, { status: 'awaiting_payment', order_id: r.order.id, total: formatCents(r.order.totalCents), approve_url: r.order.approveUrl });
      }),
  );

  server.registerTool(
    'order_status',
    { title: 'Order status', description: 'Check an order. Status: held, awaiting_payment (includes approve_url), paid (includes receipt_url), refunded or declined.', inputSchema: { order_id: z.string() } },
    ({ order_id }) =>
      guarded(async () => {
        const order = await getOrder(order_id);
        if (!order || order.shopId !== shop.id) return fail('No order with that id at this shop.');
        await log('tool.order_status', { orderId: order.id, status: order.status });
        const data: Record<string, unknown> = { status: order.status, order_id: order.id, total: formatCents(order.totalCents), items: order.items.map((i) => ({ name: i.name, quantity: i.quantity })), fulfillment: order.fulfillment };
        if (order.status === 'awaiting_payment') data.approve_url = order.approveUrl;
        if (order.status === 'held') data.hold_reason = order.holdReason;
        if (order.status === 'paid' || order.status === 'refunded') data.receipt_url = `${appUrl()}/r/${order.id}`;
        const summary = order.status === 'awaiting_payment' ? `Waiting for the buyer to approve in PayPal: ${order.approveUrl}` : `Order is ${order.status}.`;
        return ok(summary, data);
      }),
  );

  server.registerTool(
    'request_refund',
    {
      title: 'Request a refund',
      description: 'Ask for a full or partial refund on a paid order. Small refunds inside the shop\'s automatic limit are issued through PayPal at once; larger ones wait for the merchant.',
      inputSchema: { order_id: z.string(), amount: z.number().positive().optional().describe('Dollars to refund. Omit for a full refund.'), reason: z.string().min(1).max(500) },
    },
    ({ order_id, amount, reason }) =>
      guarded(async () => {
        const order = await getOrder(order_id);
        if (!order || order.shopId !== shop.id) return fail('No order with that id at this shop.');
        const r = await requestRefund({ orderId: order_id, amountCents: amount === undefined ? undefined : Math.round(amount * 100), reason });
        await log('tool.request_refund', { orderId: order_id, status: r.status, amountCents: r.refund?.amountCents });
        return ok(`Refund ${r.status}. ${r.message}`, { status: r.status, message: r.message, refund_id: r.refund?.id, amount: r.refund ? formatCents(r.refund.amountCents) : undefined });
      }),
  );

  return server;
}
