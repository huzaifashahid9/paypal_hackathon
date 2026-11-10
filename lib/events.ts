import { getDb, schema } from '@/lib/db';
import { newId } from '@/lib/id';

export type EventType =
  | 'tool.search_products'
  | 'tool.get_product'
  | 'tool.ask_shop'
  | 'tool.check_policy'
  | 'tool.create_order'
  | 'tool.order_status'
  | 'tool.request_refund'
  | 'policy.decision'
  | 'paypal.order_created'
  | 'paypal.captured'
  | 'paypal.refunded'
  | 'paypal.webhook'
  | 'merchant.approved'
  | 'merchant.declined';

/** Append to the event log that feeds the dashboard and Agent Replay. Never throws. */
export async function logEvent(input: { type: EventType; shopId?: string | null; sessionId?: string | null; payload: Record<string, unknown> }): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(schema.events).values({ id: newId(), type: input.type, shopId: input.shopId ?? null, sessionId: input.sessionId ?? null, payload: input.payload });
  } catch (err) {
    console.error('logEvent failed', err);
  }
}
