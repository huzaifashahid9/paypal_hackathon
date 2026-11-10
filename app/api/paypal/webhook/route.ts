import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { logEvent } from '@/lib/events';
import { captureOrder } from '@/lib/orders';
import { verifyWebhook } from '@/lib/paypal';

export const dynamic = 'force-dynamic';

type PayPalEvent = { id?: string; event_type?: string; resource?: { id?: string; custom_id?: string; purchase_units?: { custom_id?: string }[] } };

/** PayPal webhooks. An event is acted on only after PayPal confirms it sent it. */
export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  let event: PayPalEvent;
  try {
    event = JSON.parse(raw) as PayPalEvent;
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }

  let verified = false;
  try {
    verified = await verifyWebhook(request.headers, event);
  } catch (err) {
    console.error('webhook verification failed', err);
  }
  if (!verified) return Response.json({ error: 'signature not verified' }, { status: 400 });

  const db = await getDb();
  await logEvent({ type: 'paypal.webhook', payload: { eventId: event.id, eventType: event.event_type, resourceId: event.resource?.id } });

  if (event.event_type === 'CHECKOUT.ORDER.APPROVED' && event.resource?.id) {
    // The buyer approved but may have closed the tab before our return page captured.
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.paypalOrderId, event.resource.id));
    if (order) await captureOrder(order.id);
  }
  return Response.json({ received: true });
}
