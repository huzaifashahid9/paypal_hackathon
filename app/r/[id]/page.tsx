import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { getDb, schema } from '@/lib/db';
import { formatCents } from '@/lib/money';
import { getOrder } from '@/lib/orders';
import { verifyReceipt } from '@/lib/receipt';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Agent Receipt · OpenShelf' };

/** Agent Receipt: what was bought, which checks it passed, and proof it has not been altered. */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getOrder(id);
  if (!order || !order.paypalOrderId || !order.paypalCaptureId || !order.receiptSig) notFound();

  const db = await getDb();
  const [shop] = await db.select().from(schema.shops).where(eq(schema.shops.id, order.shopId));
  const decisions = await db.select().from(schema.decisions).where(eq(schema.decisions.orderId, order.id));
  const refunds = (await db.select().from(schema.refunds).where(eq(schema.refunds.orderId, order.id))).filter(
    (r) => r.status === 'refunded',
  );
  const verified = verifyReceipt(
    {
      orderId: order.id,
      totalCents: order.totalCents,
      paypalOrderId: order.paypalOrderId,
      paypalCaptureId: order.paypalCaptureId,
    },
    order.receiptSig,
  );

  return (
    <main className="page">
      <div className="receipt">
        <div className="eyebrow">Agent Receipt</div>
        <h1 style={{ fontSize: 28, margin: '8px 0' }}>{shop?.name}</h1>
        <p className="muted" style={{ margin: 0 }}>
          Ordered by {order.agentClient} · {order.fulfillment.method} on {order.fulfillment.date}
        </p>
        <table>
          <tbody>
            {order.items.map((i) => (
              <tr key={i.productId}>
                <td>
                  {i.quantity} × {i.name}
                </td>
                <td>{formatCents(i.unitCents * i.quantity)}</td>
              </tr>
            ))}
            <tr>
              <td>
                <strong>Total paid</strong>
              </td>
              <td>
                <strong>{formatCents(order.totalCents)}</strong>
              </td>
            </tr>
            {refunds.map((r) => (
              <tr key={r.id}>
                <td>Refunded: {r.reason}</td>
                <td>-{formatCents(r.amountCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Checks this order went through</h2>
        {decisions.map((d) => (
          <p key={d.id} style={{ margin: '4px 0', fontSize: 14 }}>
            <span className={`chip ${d.outcome}`}>{d.outcome === 'held' ? 'Approved by merchant' : 'Allowed'}</span>{' '}
            {d.message}
          </p>
        ))}

        <div className="paypal-zone" style={{ marginTop: 16 }}>
          <span>
            PayPal order <code>{order.paypalOrderId}</code>
          </span>
          <span>
            PayPal capture <code>{order.paypalCaptureId}</code>
          </span>
          <span>PayPal sandbox. No real money moved.</span>
        </div>

        <p style={{ marginTop: 16 }}>
          <span className={`chip ${verified ? 'allowed' : 'blocked'}`}>
            {verified ? 'Signature verified' : 'Signature does not match'}
          </span>
        </p>
        <code style={{ overflowWrap: 'anywhere', color: 'var(--text-muted)' }}>{order.receiptSig}</code>
      </div>
    </main>
  );
}
