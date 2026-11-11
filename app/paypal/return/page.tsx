import { formatCents } from '@/lib/money';
import { captureOrder, getOrder } from '@/lib/orders';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ order?: string; token?: string; cancelled?: string }> };

/** PayPal sends the buyer back here after they approve. We capture on the server. */
export default async function PayPalReturn({ searchParams }: Props) {
  const { order: orderId, token, cancelled } = await searchParams;
  let order = orderId ? await getOrder(orderId) : null;
  let problem: string | null = null;

  if (!order) problem = 'We could not find that order.';
  else if (cancelled) problem = 'The payment was cancelled. Nothing was charged.';
  else if (token && order.paypalOrderId && token !== order.paypalOrderId) problem = 'This payment link does not match the order.';
  else {
    try {
      order = await captureOrder(order.id);
    } catch (err) {
      console.error('capture failed', err);
      problem = 'PayPal could not complete the payment. Nothing was charged. Please try the link again.';
    }
  }

  const paid = !problem && order?.status === 'paid';
  return (
    <main className="page">
      <div className="card" style={{ maxWidth: 520, margin: '48px auto' }}>
        <span className={`chip ${paid ? 'allowed' : 'held'}`}>{paid ? 'Paid' : 'Not completed'}</span>
        <h1 style={{ fontSize: 32, margin: '12px 0' }}>{paid ? 'Payment approved' : 'Payment not completed'}</h1>
        {paid && order ? (
          <>
            <p>
              {formatCents(order.totalCents)} paid through PayPal. You can go back to your assistant; it can confirm the
              order now.
            </p>
            <p className="mono">PayPal capture {order.paypalCaptureId}</p>
            <a href={`/r/${order.id}`}>View your Agent Receipt</a>
          </>
        ) : (
          <p>{problem ?? `This order is ${order?.status}.`}</p>
        )}
      </div>
    </main>
  );
}
