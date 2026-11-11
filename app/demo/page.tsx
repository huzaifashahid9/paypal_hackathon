import { paypalConfigured } from '@/lib/paypal';
import { DemoRunner } from './demo-runner';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'One-click demo · OpenShelf' };

export default function DemoPage() {
  return (
    <main className="page wide">
      <div className="eyebrow">One-click demo</div>
      <h1 style={{ fontSize: 40, margin: '8px 0 12px' }}>Watch an AI agent try to buy three things.</h1>
      <p className="muted" style={{ maxWidth: 680, marginBottom: 24 }}>
        Our Mystery Shopper is a scripted buyer agent. It calls the same tools at Rosie&apos;s Bakery that Claude or ChatGPT would call. One order
        goes through, one waits for the baker, and one is stopped by the buyer&apos;s own budget.
      </p>
      <DemoRunner paypalOn={paypalConfigured()} />
    </main>
  );
}
