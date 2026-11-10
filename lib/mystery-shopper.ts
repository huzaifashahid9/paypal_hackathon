// The Mystery Shopper is a scripted buyer agent. It makes the same MCP tool calls a real
// agent (Claude, ChatGPT) would make, through the same handler, so the three outcomes can
// be seen in one click. It is not an LLM: the script is fixed, which keeps the demo repeatable.

import { newId } from '@/lib/id';
import { serveShopMcp } from '@/lib/mcp/http';
import { createPass } from '@/lib/passes';
import { getShopBySlug, type Shop } from '@/lib/shops';

export type Outcome = 'allowed' | 'held' | 'blocked' | 'error';

export type ToolCall = { tool: string; args: Record<string, unknown>; reply: string };

export type Scenario = {
  key: 'allowed' | 'held' | 'blocked';
  title: string;
  setup: string;
  calls: ToolCall[];
  outcome: Outcome;
  summary: string;
  approveUrl?: string;
  orderId?: string;
};

export type DemoRun = { shopSlug: string; shopName: string; pickupDate: string; scenarios: Scenario[] };

/** The next Saturday after today, as YYYY-MM-DD (UTC). */
export function nextSaturday(from = new Date()): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + (((6 - d.getUTCDay() + 7) % 7) || 7));
  return d.toISOString().slice(0, 10);
}

const maskPass = (args: Record<string, unknown>): Record<string, unknown> =>
  typeof args.pass_code === 'string' ? { ...args, pass_code: `PASS-••••-${args.pass_code.slice(-4)}` } : args;

type ToolReply = { text: string; data: Record<string, any>; isError: boolean };

function shopper(shop: Shop, sessionId: string) {
  let id = 0;
  return async (calls: ToolCall[], tool: string, args: Record<string, unknown>): Promise<ToolReply> => {
    const request = new Request(`http://openshelf.internal/s/${shop.slug}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name: tool, arguments: args } }),
    });
    const res = await serveShopMcp(shop, request, { agentClient: 'Mystery Shopper', sessionId });
    const body = (await res.json()) as { result?: { content?: { text?: string }[]; structuredContent?: Record<string, any>; isError?: boolean }; error?: { message?: string } };
    const full = body.result?.content?.[0]?.text ?? body.error?.message ?? 'No reply.';
    const reply: ToolReply = { text: full.split('\n\n{')[0], data: body.result?.structuredContent ?? {}, isError: Boolean(body.error || body.result?.isError) };
    calls.push({ tool, args: maskPass(args), reply: reply.text });
    return reply;
  };
}

const OUTCOME: Record<string, Outcome> = { awaiting_payment: 'allowed', held: 'held', blocked: 'blocked' };

/** Run the three demo orders against the bakery: one allowed, one held, one blocked. */
export async function runMysteryShopper(): Promise<DemoRun> {
  const shop = await getShopBySlug('rosies-bakery');
  if (!shop) throw new Error('The demo shop is missing. Run the seed first.');
  const call = shopper(shop, `demo-${newId().slice(0, 8)}`);
  const date = nextSaturday();
  const fulfillment = { method: 'pickup', date };

  // A fresh pass per run, so earlier runs never use up this run's budget.
  const small = await createPass({ label: 'Demo: weekend errands', perOrderCents: 5000, totalCents: 10000, expiresInHours: 1, allowedShopIds: [shop.id] });
  const big = await createPass({ label: 'Demo: birthday party', perOrderCents: 15000, totalCents: 20000, expiresInHours: 1, allowedShopIds: [shop.id] });

  const find = async (calls: ToolCall[], query: string, name: string): Promise<string> => {
    const r = await call(calls, 'search_products', { query });
    const hit = (r.data.products as { id: string; name: string }[] | undefined)?.find((p) => p.name === name);
    if (!hit) throw new Error(`The demo shop has no "${name}".`);
    return hit.id;
  };

  const order = async (calls: ToolCall[], passCode: string, productId: string, quantity: number, note: string) => {
    const r = await call(calls, 'create_order', { items: [{ product_id: productId, quantity }], pass_code: passCode, fulfillment, buyer_note: note });
    return { reply: r, outcome: r.isError ? ('error' as const) : (OUTCOME[r.data.status as string] ?? 'error') };
  };

  // 1. Allowed: 12 rolls for $18 fits the $50 pass and every House Rule.
  const c1: ToolCall[] = [];
  const rolls = await find(c1, 'sourdough rolls', 'Sourdough roll');
  await call(c1, 'check_policy', { items: [{ product_id: rolls, quantity: 12 }], pass_code: small.code, fulfillment });
  const o1 = await order(c1, small.code, rolls, 12, 'For a family brunch.');

  // 2. Held: the $120 cake fits the buyer's $150 pass, but the bakery reviews orders over $75.
  const c2: ToolCall[] = [];
  const cake = await find(c2, 'celebration cake', 'Celebration cake');
  const o2 = await order(c2, big.code, cake, 1, 'Message on the cake: Happy 30th, Sam!');

  // 3. Blocked: the same cake with the $50 pass. The buyer's own limit stops it.
  const c3: ToolCall[] = [];
  const o3 = await order(c3, small.code, cake, 1, '');

  return {
    shopSlug: shop.slug,
    shopName: shop.name,
    pickupDate: date,
    scenarios: [
      { key: 'allowed', title: '12 sourdough rolls, $18', setup: 'Buyer Pass: up to $50 per order', calls: c1, outcome: o1.outcome, summary: o1.reply.text, approveUrl: o1.reply.data.approve_url, orderId: o1.reply.data.order_id },
      { key: 'held', title: 'A celebration cake, $120', setup: 'Buyer Pass: up to $150 per order', calls: c2, outcome: o2.outcome, summary: o2.reply.text, orderId: o2.reply.data.order_id },
      { key: 'blocked', title: 'The same cake, with the small pass', setup: 'Buyer Pass: up to $50 per order', calls: c3, outcome: o3.outcome, summary: o3.reply.text },
    ],
  };
}
